import "server-only";

import { decrypt, encrypt } from "@/lib/crypto";
import { getGmailConnection, updateGmailConnection } from "@/lib/db/repo";
import { createAdminClient } from "@/lib/supabase/admin";
import { InvalidGrantError, refreshAccessToken } from "./google";

/** Refresh this long before actual expiry. */
const EXPIRY_SKEW_MS = 60_000;

/** The user must reconnect Gmail (no connection, revoked, or expired refresh token). */
export class NeedsReconnectError extends Error {
  constructor(message = "Gmail needs to be reconnected") {
    super(message);
    this.name = "NeedsReconnectError";
  }
}

/**
 * Returns a valid Gmail access token for the user, refreshing via Google when the
 * stored one is missing or about to expire (or when `forceRefresh` is set, e.g. after a 401). On invalid_grant, marks the connection
 * needs_reconnect and throws NeedsReconnectError.
 */
export async function getAccessToken(userId: string, options: { forceRefresh?: boolean } = {}): Promise<string> {
  const admin = createAdminClient();
  const connection = await getGmailConnection(admin, userId);

  if (!connection || connection.status !== "active") throw new NeedsReconnectError();

  const expiresAt = connection.access_token_expires_at ? Date.parse(connection.access_token_expires_at) : 0;
  if (!options.forceRefresh && connection.access_token_enc && expiresAt - Date.now() > EXPIRY_SKEW_MS) {
    return decrypt(connection.access_token_enc);
  }

  try {
    const refreshed = await refreshAccessToken(decrypt(connection.refresh_token_enc));
    await updateGmailConnection(admin, userId, {
      access_token_enc: encrypt(refreshed.accessToken),
      access_token_expires_at: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
      // Only replace the refresh token if Google rotated it, and never with an empty one.
      ...(refreshed.refreshToken ? { refresh_token_enc: encrypt(refreshed.refreshToken) } : {}),
    });
    return refreshed.accessToken;
  } catch (err) {
    if (err instanceof InvalidGrantError) {
      await updateGmailConnection(admin, userId, { status: "needs_reconnect" });
      throw new NeedsReconnectError();
    }
    throw err;
  }
}
