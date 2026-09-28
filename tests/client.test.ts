import { describe, expect, it, vi } from "vitest";
import { createGmailClient, GmailApiError, pool } from "@/lib/gmail/client";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

function setup(responses: (Response | Error)[], extra: Record<string, unknown> = {}) {
  const queue = [...responses];
  const fetchImpl = vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error("unexpected extra fetch");
    if (next instanceof Error) throw next;
    return next;
  });
  const sleep = vi.fn(async () => {});
  const getToken = vi.fn(async (force: boolean) => (force ? "fresh-token" : "old-token"));
  const client = createGmailClient({
    getToken,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep,
    random: () => 0,
    baseDelayMs: 100,
    maxRetries: 3,
    ...extra,
  });
  return { client, fetchImpl, sleep, getToken };
}

const authHeader = (fetchImpl: ReturnType<typeof vi.fn>, call: number) =>
  ((fetchImpl.mock.calls[call] as unknown[])[1] as RequestInit).headers as Record<string, string>;

describe("createGmailClient", () => {
  it("sends the bearer token and builds the URL with repeated params", async () => {
    const { client, fetchImpl } = setup([json({ ok: 1 })]);
    await client.getJson("/users/me/messages/abc", { format: "metadata", metadataHeaders: ["From", "Subject"], skip: undefined });

    const url = new URL((fetchImpl.mock.calls[0] as unknown[])[0] as string);
    expect(url.origin + url.pathname).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/abc");
    expect(url.searchParams.getAll("metadataHeaders")).toEqual(["From", "Subject"]);
    expect(url.searchParams.has("skip")).toBe(false);
    expect(authHeader(fetchImpl, 0).Authorization).toBe("Bearer old-token");
  });

  it("retries once on 401 with a force-refreshed token", async () => {
    const { client, fetchImpl, getToken, sleep } = setup([json({}, 401), json({ ok: true })]);
    expect(await client.getJson("/x")).toEqual({ ok: true });
    expect(getToken.mock.calls.map((c) => c[0])).toEqual([false, true]);
    expect(authHeader(fetchImpl, 1).Authorization).toBe("Bearer fresh-token");
    expect(sleep).not.toHaveBeenCalled();
  });

  it("gives up after a second 401", async () => {
    const { client, fetchImpl } = setup([json({}, 401), json({}, 401)]);
    await expect(client.getJson("/x")).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("backs off exponentially on 429 and 5xx", async () => {
    const { client, sleep } = setup([json({}, 429), json({}, 503), json({}, 500), json({ ok: true })]);
    expect(await client.getJson("/x")).toEqual({ ok: true });
    expect(sleep.mock.calls.map((c) => (c as unknown[])[0])).toEqual([100, 200, 400]);
  });

  it("honors Retry-After when it is longer than the backoff", async () => {
    const { client, sleep } = setup([json({}, 429, { "retry-after": "7" }), json({ ok: true })]);
    await client.getJson("/x");
    expect((sleep.mock.calls[0] as unknown[])[0]).toBe(7000);
  });

  it("throws GmailApiError once retries are exhausted", async () => {
    const { client, fetchImpl } = setup([json({}, 500), json({}, 500), json({}, 500), json({}, 500)]);
    await expect(client.getJson("/x")).rejects.toBeInstanceOf(GmailApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(4); // first try + 3 retries
  });

  it("retries a 403 rateLimitExceeded but not a plain 403", async () => {
    const limited = json({ error: { errors: [{ reason: "rateLimitExceeded" }] } }, 403);
    const a = setup([limited, json({ ok: true })]);
    expect(await a.client.getJson("/x")).toEqual({ ok: true });

    const b = setup([json({ error: { errors: [{ reason: "forbidden" }] } }, 403)]);
    await expect(b.client.getJson("/x")).rejects.toMatchObject({ status: 403 });
    expect(b.sleep).not.toHaveBeenCalled();
  });

  it("does not retry other 4xx errors", async () => {
    const { client, fetchImpl } = setup([json({ error: "nope" }, 404)]);
    await expect(client.getJson("/x")).rejects.toMatchObject({ status: 404 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries network errors", async () => {
    const { client, sleep } = setup([new TypeError("fetch failed"), json({ ok: true })]);
    expect(await client.getJson("/x")).toEqual({ ok: true });
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});

describe("pool", () => {
  it("never exceeds the concurrency limit and keeps result order", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await pool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5 * ((n % 3) + 1)));
      inFlight--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    expect(peak).toBe(3);
  });

  it("handles empty input and rejects on error", async () => {
    expect(await pool([], 4, async (x) => x)).toEqual([]);
    await expect(
      pool([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });
});
