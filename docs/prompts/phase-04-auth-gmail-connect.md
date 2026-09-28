# Phase 04: Auth & Gmail connect

Prerequisite: previous phase verified and committed.

## Prompt

```
Execute Phase 4. Implement per D5, D6, D7, D17, A11:
- src/lib/supabase/{client,server,admin,proxy}.ts and src/proxy.ts (session refresh via getClaims(); protect /dashboard).
- /auth/sign-in route: server-side signInWithOAuth with scope gmail.readonly, queryParams access_type=offline, and
  prompt=consent ONLY when ?consent=1; redirectTo /auth/callback. Landing "Sign in with Google" links to /auth/sign-in;
  "Reconnect" links to /auth/sign-in?consent=1.
- /auth/callback: exchangeCodeForSession; read session.provider_token + provider_refresh_token; check granted scopes via
  https://oauth2.googleapis.com/tokeninfo (missing gmail.readonly → error page "Gmail read access is required" + retry
  with consent); get the Gmail address via users.getProfile; encrypt tokens with src/lib/crypto.ts (AES-256-GCM,
  unit-tested); upsert gmail_connections via admin client. If no refresh token was returned: keep an existing active
  connection untouched; otherwise redirect once to /auth/sign-in?consent=1; if still none, show a clear error explaining
  to revoke access at myaccount.google.com/permissions and retry. Finally call refreshSession() so the session cookie no
  longer contains provider tokens.
- src/lib/gmail/tokens.ts: getAccessToken(userId) that refreshes via https://oauth2.googleapis.com/token when expired;
  on invalid_grant set status needs_reconnect.
- /api/gmail/disconnect: revoke token at Google, delete row.
- Dashboard header with connection status, Reconnect, Sign out.
Verify: sign in, see "Connected as …" in the header, see the gmail_connections row with encrypted values, and confirm no
sb-* cookie contains provider_token or provider_refresh_token.
```

## Definition of done

- [ ] "Sign in with Google" requests only `gmail.readonly` (plus the default openid/email/profile) and lands on `/dashboard`; signed-out visits to `/dashboard` redirect to `/`.
- [ ] After sign-in, `gmail_connections` has one row for the user with `status = 'active'`, the Gmail address, and `refresh_token_enc` / `access_token_enc` that are ciphertext, not raw Google tokens.
- [ ] `src/lib/crypto.ts` has unit tests for round-trip, wrong key, and tampered ciphertext; all pass.
- [ ] `getAccessToken` refreshes expired tokens and sets `needs_reconnect` on `invalid_grant` (unit-tested with mocked fetch).
- [ ] Normal sign-in doesn't force the consent screen; `/auth/sign-in?consent=1` (Reconnect) does. A sign-in without a refresh token never overwrites an existing active connection; with no connection it retries once with consent, then shows the revoke-and-retry error.
- [ ] Granted scopes are checked with `tokeninfo`: unticking Gmail on the consent screen shows "Gmail read access is required", and `scope` stores the real granted scopes.
- [ ] After the callback, no `sb-*` cookie contains `provider_token` or `provider_refresh_token`.
- [ ] `/api/gmail/disconnect` revokes at Google and deletes the row; the header shows "Connected as …", "Reconnect", or "Sign out" correctly.

## Manual verification

1. `npm run dev`, open http://localhost:3000 in a private window, click **Sign in with Google**.
2. On Google's consent screen, confirm the only Gmail permission is read-only ("View your email messages and settings"). Approve.
3. You land on `/dashboard` and the header shows "● Connected as <your gmail>".
4. Supabase Table Editor → `gmail_connections` → one row; `refresh_token_enc` does not start with `1//` (raw Google refresh tokens do).
5. Open another private window and go straight to http://localhost:3000/dashboard → redirected to `/`.
6. DevTools → Application → Cookies → decode the `sb-…-auth-token` cookie(s) (strip the `base64-` prefix, base64-decode) → no `provider_token` / `provider_refresh_token` fields.
7. Sign out and sign in again → no consent screen this time, and the `gmail_connections` row's `refresh_token_enc` is unchanged.
8. Click **Disconnect Gmail** → the row disappears, and https://myaccount.google.com/permissions no longer lists the app.
9. Sign in again, and on the consent screen **untick** the Gmail permission → you see "Gmail read access is required". Retry and tick it → connected.
10. `npm run typecheck && npm run lint && npm test` → green. Commit.
