import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY = randomBytes(32).toString("base64");
process.env.TOKEN_ENCRYPTION_KEY = KEY;
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

const getGmailConnection = vi.fn();
const updateGmailConnection = vi.fn();
vi.mock("@/lib/db/repo", () => ({ getGmailConnection, updateGmailConnection }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const { encrypt, decrypt } = await import("@/lib/crypto");
const { getAccessToken, NeedsReconnectError } = await import("@/lib/gmail/tokens");

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function connection(overrides: Record<string, unknown> = {}) {
  return {
    user_id: "u1",
    google_email: "fake@example.com",
    refresh_token_enc: encrypt("refresh-token"),
    access_token_enc: null,
    access_token_expires_at: null,
    scope: "gmail.readonly",
    status: "active",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAccessToken", () => {
  it("returns the stored access token while it is still valid, without calling Google", async () => {
    getGmailConnection.mockResolvedValue(
      connection({
        access_token_enc: encrypt("cached-access"),
        access_token_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      }),
    );
    expect(await getAccessToken("u1")).toBe("cached-access");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes an expired token and stores the new one encrypted", async () => {
    getGmailConnection.mockResolvedValue(
      connection({
        access_token_enc: encrypt("old-access"),
        access_token_expires_at: new Date(Date.now() - 1000).toISOString(),
      }),
    );
    fetchMock.mockResolvedValue(jsonResponse({ access_token: "new-access", expires_in: 3600 }));

    expect(await getAccessToken("u1")).toBe("new-access");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(String(init.body)).toContain("grant_type=refresh_token");
    expect(String(init.body)).toContain("refresh_token=refresh-token");

    const patch = updateGmailConnection.mock.calls[0][2];
    expect(patch.access_token_enc).not.toContain("new-access");
    expect(decrypt(patch.access_token_enc)).toBe("new-access");
    expect(patch.refresh_token_enc).toBeUndefined(); // not rotated: left untouched
  });

  it("refreshes when there is no stored access token", async () => {
    getGmailConnection.mockResolvedValue(connection());
    fetchMock.mockResolvedValue(jsonResponse({ access_token: "fresh", expires_in: 3600 }));
    expect(await getAccessToken("u1")).toBe("fresh");
  });

  it("stores a rotated refresh token, encrypted", async () => {
    getGmailConnection.mockResolvedValue(connection());
    fetchMock.mockResolvedValue(jsonResponse({ access_token: "a", expires_in: 3600, refresh_token: "rotated" }));
    await getAccessToken("u1");
    expect(decrypt(updateGmailConnection.mock.calls[0][2].refresh_token_enc)).toBe("rotated");
  });

  it("sets needs_reconnect and throws on invalid_grant", async () => {
    getGmailConnection.mockResolvedValue(connection());
    fetchMock.mockResolvedValue(jsonResponse({ error: "invalid_grant" }, 400));

    await expect(getAccessToken("u1")).rejects.toBeInstanceOf(NeedsReconnectError);
    expect(updateGmailConnection).toHaveBeenCalledWith(expect.anything(), "u1", { status: "needs_reconnect" });
  });

  it("does not mark needs_reconnect on other failures", async () => {
    getGmailConnection.mockResolvedValue(connection());
    fetchMock.mockResolvedValue(jsonResponse({ error: "backend_error" }, 500));

    await expect(getAccessToken("u1")).rejects.toThrow(/refresh failed/);
    expect(updateGmailConnection).not.toHaveBeenCalled();
  });

  it("throws NeedsReconnectError without calling Google when there is no active connection", async () => {
    getGmailConnection.mockResolvedValue(null);
    await expect(getAccessToken("u1")).rejects.toBeInstanceOf(NeedsReconnectError);

    getGmailConnection.mockResolvedValue(connection({ status: "needs_reconnect" }));
    await expect(getAccessToken("u1")).rejects.toBeInstanceOf(NeedsReconnectError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
