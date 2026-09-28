import { NextResponse, type NextRequest } from "next/server";
import { CONSENT_COOKIE } from "@/lib/auth-cookies";
import { encrypt } from "@/lib/crypto";
import { getGmailConnection, upsertGmailConnection } from "@/lib/db/repo";
import { getGmailAddress, getGrantedScopes, hasGmailReadonly, refreshAccessToken } from "@/lib/gmail/google";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const consentAttempted = request.cookies.get(CONSENT_COOKIE)?.value === "1";

  const to = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url));
    response.cookies.delete({ name: CONSENT_COOKIE, path: "/auth" });
    return response;
  };

  const code = searchParams.get("code");
  if (searchParams.get("error") || !code) return to("/auth/error?reason=denied");

  const supabase = await createClient();
  const { data: exchange, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError || !exchange.session) return to("/auth/error?reason=exchange");

  const { session } = exchange;
  const userId = session.user.id;
  const admin = createAdminClient();

  // Provider tokens must not stay in the session cookie (D6): refreshSession() issues a session without them.
  const dropProviderTokens = async () => {
    await supabase.auth.refreshSession();
  };

  try {
    const existing = await getGmailConnection(admin, userId);
    const providerRefreshToken = session.provider_refresh_token;

    if (!providerRefreshToken) {
      // Never overwrite a stored token with an empty one; keep an active connection untouched.
      if (existing?.status === "active") {
        await dropProviderTokens();
        return to("/dashboard");
      }
      await dropProviderTokens();
      // First connect / reconnect without a refresh token: retry once with forced consent.
      return to(consentAttempted ? "/auth/error?reason=no_refresh_token" : "/auth/sign-in?consent=1");
    }

    // Access token for tokeninfo + getProfile: use the provider token, else mint one from the refresh token.
    let accessToken = session.provider_token ?? null;
    let expiresIn = 3600;
    if (!accessToken) {
      const refreshed = await refreshAccessToken(providerRefreshToken);
      accessToken = refreshed.accessToken;
      expiresIn = refreshed.expiresIn;
    }

    // The user can untick individual permissions on the consent screen (D7): verify what was granted.
    const scopes = await getGrantedScopes(accessToken);
    if (!hasGmailReadonly(scopes)) {
      await dropProviderTokens();
      return to("/auth/error?reason=scope");
    }

    const googleEmail = await getGmailAddress(accessToken);

    await upsertGmailConnection(admin, {
      user_id: userId,
      google_email: googleEmail,
      refresh_token_enc: encrypt(providerRefreshToken),
      access_token_enc: encrypt(accessToken),
      access_token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      scope: scopes.join(" "),
      status: "active",
    });

    await dropProviderTokens();
    return to("/dashboard");
  } catch (err) {
    console.error("auth callback failed:", err instanceof Error ? err.message : err);
    await dropProviderTokens().catch(() => {});
    return to("/auth/error?reason=exchange");
  }
}
