import { describe, expect, it, vi } from "vitest";
import { getGmailAddress, getGrantedScopes, hasGmailReadonly, revokeToken } from "@/lib/gmail/google";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("google helpers", () => {
  it("reads granted scopes from tokeninfo and detects gmail.readonly", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json({ scope: "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/gmail.readonly" }),
    );
    const scopes = await getGrantedScopes("tok", fetchImpl as unknown as typeof fetch);
    expect(scopes).toHaveLength(3);
    expect(hasGmailReadonly(scopes)).toBe(true);
  });

  it("detects a missing gmail.readonly scope (user unticked it)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ scope: "openid https://www.googleapis.com/auth/userinfo.email" }));
    const scopes = await getGrantedScopes("tok", fetchImpl as unknown as typeof fetch);
    expect(hasGmailReadonly(scopes)).toBe(false);
  });

  it("returns the Gmail address from getProfile", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ emailAddress: "fake@example.com" }));
    expect(await getGmailAddress("tok", fetchImpl as unknown as typeof fetch)).toBe("fake@example.com");
  });

  it("treats an already-invalid token as revoked, but not other errors", async () => {
    const ok = vi.fn().mockResolvedValue(json({}, 200));
    const invalid = vi.fn().mockResolvedValue(json({ error: "invalid_token" }, 400));
    const down = vi.fn().mockResolvedValue(json({ error: "server_error" }, 500));
    expect(await revokeToken("t", ok as unknown as typeof fetch)).toBe(true);
    expect(await revokeToken("t", invalid as unknown as typeof fetch)).toBe(true);
    expect(await revokeToken("t", down as unknown as typeof fetch)).toBe(false);
  });
});
