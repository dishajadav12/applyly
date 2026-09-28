import "server-only";

import { requireEnv } from "@/lib/env";

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile";

type Fetch = typeof fetch;

/** Thrown when Google says the refresh token is no longer valid (expired, revoked). */
export class InvalidGrantError extends Error {
  constructor() {
    super("Google refresh token is invalid (invalid_grant)");
    this.name = "InvalidGrantError";
  }
}

export type RefreshedToken = {
  accessToken: string;
  expiresIn: number;
  /** Only present if Google rotated the refresh token. */
  refreshToken?: string;
};

export async function refreshAccessToken(refreshToken: string, fetchImpl: Fetch = fetch): Promise<RefreshedToken> {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error?: string;
  };
  if (!res.ok) {
    if (body.error === "invalid_grant") throw new InvalidGrantError();
    throw new Error(`Google token refresh failed (${res.status}${body.error ? `: ${body.error}` : ""})`);
  }
  if (!body.access_token) throw new Error("Google token refresh returned no access token");
  return {
    accessToken: body.access_token,
    expiresIn: body.expires_in ?? 3600,
    refreshToken: body.refresh_token || undefined,
  };
}

/** Returns the scopes Google reports as actually granted to this access token. */
export async function getGrantedScopes(accessToken: string, fetchImpl: Fetch = fetch): Promise<string[]> {
  const res = await fetchImpl(`${TOKENINFO_URL}?${new URLSearchParams({ access_token: accessToken })}`);
  if (!res.ok) throw new Error(`Google tokeninfo failed (${res.status})`);
  const body = (await res.json()) as { scope?: string };
  return (body.scope ?? "").split(/\s+/).filter(Boolean);
}

export function hasGmailReadonly(scopes: string[]): boolean {
  return scopes.includes(GMAIL_READONLY_SCOPE);
}

export async function getGmailAddress(accessToken: string, fetchImpl: Fetch = fetch): Promise<string> {
  const res = await fetchImpl(PROFILE_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Gmail getProfile failed (${res.status})`);
  const body = (await res.json()) as { emailAddress?: string };
  if (!body.emailAddress) throw new Error("Gmail getProfile returned no address");
  return body.emailAddress;
}

/** Revokes a token at Google. Returns true if revoked or already invalid. */
export async function revokeToken(token: string, fetchImpl: Fetch = fetch): Promise<boolean> {
  const res = await fetchImpl(REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
  if (res.ok) return true;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error === "invalid_token";
}
