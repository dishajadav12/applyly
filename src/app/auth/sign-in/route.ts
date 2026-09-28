import { NextResponse, type NextRequest } from "next/server";
import { CONSENT_COOKIE } from "@/lib/auth-cookies";
import { GMAIL_READONLY_SCOPE } from "@/lib/gmail/google";
import { createClient } from "@/lib/supabase/server";

/**
 * Starts Google OAuth server-side (D5). prompt=consent is forced ONLY with ?consent=1
 * (first connect / Reconnect); normal sign-in never forces the consent screen.
 */
export async function GET(request: NextRequest) {
  const consent = request.nextUrl.searchParams.get("consent") === "1";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl}/auth/callback`,
      scopes: GMAIL_READONLY_SCOPE,
      queryParams: { access_type: "offline", ...(consent ? { prompt: "consent" } : {}) },
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(new URL("/auth/error?reason=exchange", request.url));
  }

  const response = NextResponse.redirect(data.url);
  if (consent) {
    response.cookies.set(CONSENT_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
      path: "/auth",
    });
  }
  return response;
}
