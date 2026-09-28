# Decisions

Source: PROJECT_SPEC.md, section A2. Revised on 2026-09-27 after the pre-Phase-1 spec review.

| # | Decision | Choice | Why | Status |
|---|---|---|---|---|
| D1 | App type | **Web app** (the Chrome extension is dropped) | A full-stack app makes the extension redundant. You can open the dashboard from any browser. A thin extension can be added later. | Accepted |
| D2 | Framework | **Next.js 16+ (App Router) + TypeScript (strict)**. Request interception lives in `src/proxy.ts` (the Next.js 16 replacement for `middleware.ts`; with a `src/` dir it must be inside `src/`). Node ≥ 20.9. | One codebase covers the UI, API routes, and server-side Gmail calls. Deploys free on Vercel. | Accepted (revised 2026-09-27) |
| D3 | Data + Auth | **Supabase** (Postgres + Auth + Row Level Security), free tier | One service replaces three: the database, "Sign in with Google", and per-user data isolation through RLS. Neon is only Postgres; you would still need to build auth and Google OAuth token handling yourself. | Accepted |
| D4 | DB access | `@supabase/supabase-js` + `@supabase/ssr`, SQL migrations via Supabase CLI, generated TS types. Use the new API keys (`sb_publishable_…`, `sb_secret_…`), not the legacy anon/service_role keys. Session checks in the proxy use `supabase.auth.getClaims()`. | Least moving parts. Domain logic (extraction, matching) stays DB-agnostic, so moving to Neon + Drizzle later is possible. Legacy keys are being phased out by Supabase. | Accepted (revised 2026-09-27) |
| D5 | Login = Gmail connect | Supabase Google OAuth requesting the `gmail.readonly` scope with `access_type=offline`. **Normal sign-in does not force consent.** Consent (`prompt=consent`) is forced only when connecting for the first time or reconnecting: the callback redirects to the consent flow if Google returned no refresh token and there is no `active` connection. | One click both logs you in and connects Gmail. Returning users aren't shown the consent screen every time, and an existing token is never replaced by an empty one. | Accepted (revised 2026-09-27) |
| D6 | Gmail token handling | In the auth callback: capture `provider_refresh_token`, check the granted scopes with Google's `tokeninfo` endpoint, encrypt the token with AES-256-GCM, and store it in `gmail_connections`. Then call `refreshSession()` so the session saved in cookies no longer contains provider tokens. The server refreshes access tokens itself using the Google client ID and secret. | Supabase does not refresh Google provider tokens, so the server must do it. The plaintext Google token must never stay in a browser cookie. | Accepted (revised 2026-09-27) |
| D7 | Gmail scope | `https://www.googleapis.com/auth/gmail.readonly` **only**. Google lets users untick individual permissions on the consent screen, so the callback verifies the scope was actually granted. If it wasn't, the user sees "Gmail read access is required" and a retry button. | This is the minimum scope that allows search and body reading. There are no send, modify, or delete permissions. | Accepted (revised 2026-09-27) |
| D8 | Where emails are processed | Server (Next.js route handlers) | Bodies are fetched, parsed in memory, and discarded. They are **never stored**. | Accepted |
| D9 | Long scans | **Chunked scan protocol**. Step 1 lists message IDs into a `scan_items` queue. Then the client repeatedly calls a "step" endpoint that processes about 40 messages per call. Concurrent steps are prevented with a **lease** on the `scans` row (not a Postgres advisory lock). A partial unique index allows only one active scan per user. | Avoids serverless timeouts and needs no queue service. Progress is real, and an interrupted scan can be resumed. Advisory locks can't be held across supabase-js calls because every call is a separate HTTP request on a pooled connection. | Accepted (revised 2026-09-27) |
| D10 | Extraction | Rule-based (weighted signals + ATS-specific parsers). No LLM in v1. | Free, deterministic, testable, private. | Accepted |
| D11 | UI | Tailwind + shadcn/ui (Table, Sheet, Dialog, Select, Badge, Input, DropdownMenu, Progress) | Polished SaaS look with little effort. | Accepted |
| D12 | Tests | Vitest with anonymized fixtures | Extraction and matching *are* the product. | Accepted |
| D13 | Hosting | Local dev on `localhost:3000` against a Supabase cloud project. Deploy on Vercel Hobby (free). | No Docker needed. | Accepted |
| D14 | Language | English emails only | Keeps the rules manageable. | Accepted |
| D15 | Manual event decisions | Assigning, moving, or dismissing an event, and deleting its application, sets `email_events.user_locked = true`. Scans and re-processing may refresh a locked event's extracted fields but never change its `application_id` or `state`. | `overrides` protects application fields. This protects the user's decisions about which application an email belongs to. | Accepted (added 2026-09-27) |
| D16 | Gmail deep links | Store the RFC 822 `Message-ID` header. Link to `https://mail.google.com/mail/u/?authuser=<google_email>#search/rfc822msgid:<Message-ID>` | Gmail doesn't officially support `#all/<API message id>` links, and they often fail to open the message. `rfc822msgid:` search is stable. | Accepted (added 2026-09-27) |
| D17 | Google OAuth app mode | Stay in **Testing** (you are the only test user) and make **Reconnect** one click. "In production, unverified" is optional and not relied on. | `gmail.readonly` is a restricted scope. Unverified production apps show an "unsafe app" warning, are capped at 100 users, and Google's policy can change. | Accepted (added 2026-09-27) |

## Spec changes from the 2026-09-27 review

| Issue | Resolution | Where |
|---|---|---|
| Next.js 16 renamed `middleware.ts` to `proxy.ts`; the root location would be ignored with a `src/` dir | `src/proxy.ts`, `lib/supabase/proxy.ts` | D2, A10 |
| Legacy Supabase anon/service_role keys are being phased out | `sb_publishable_…` / `sb_secret_…` keys; `getClaims()` in the proxy | D4, A11 |
| Advisory locks can't be held across supabase-js calls | Lease on `scans` via the `claim_scan_lease` RPC, and a partial unique index for one active scan | D9, A4, A5 |
| Google lets users untick the Gmail permission; `scope` had no source | Verify with `tokeninfo`; show a "Gmail read access is required" error | D6, D7, A9 |
| The plaintext refresh token was left in the Supabase session cookie | `refreshSession()` after capture | D6 |
| `prompt=consent` on every sign-in | Consent only on first connect or reconnect; never overwrite a token with an empty one | D5, A10 |
| Unverified production mode is fragile | Testing mode + one-click Reconnect is the primary path | D17, A2 |
| Re-processing could undo manual assign/move/dismiss | `email_events.user_locked` | D15, A5, A8 |
| Q2 was too broad (thousands of newsletters) | Specific phrases, `subject:interview`, `Q2_EXCLUDED_SENDERS`, dry-run tuning | A6 |
| `#all/<id>` Gmail links are unreliable | `rfc822msgid:` search link | D16, A5, A9 |
| "Stage event" was undefined, so late emails could reopen closed applications | Stage events defined; non-stage emails never reopen | A8 |
| No rule for a role-less email when the company only has a closed application | M4b + clarified M5 | A8 |
| Deleting an application left its events `linked` | `delete_application` RPC sets them to review | A8 |
| A10 listed phases 00–11 | Phases 01–12 | A10 |
