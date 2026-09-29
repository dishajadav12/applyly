# Applyly

A personal web app that rebuilds your job-application history from Gmail.

Sign in with Google, grant **read-only** Gmail access, and click **Scan**. The server searches your inbox for job-related emails, extracts the company, role, status and recruiter from each one, and groups related emails into a single row per application.

For example, a confirmation in May, an online assessment in June and an interview invite in July for the same company and role become **one** application:

| Company | Role | Applied | Status | Recruiter |
|---|---|---|---|---|
| Acme | SWE, New Grad 2027 | May 15 | Interviewing | set from the July email |

Rescanning never creates duplicates, and your manual corrections are never overwritten.

> **Status:** v1.0. All 11 build phases are complete. The full plan is in [PROJECT_SPEC.md](PROJECT_SPEC.md) and the build order is in [docs/prompts/](docs/prompts/).

## Privacy

- **Gmail scope is `gmail.readonly` only.** There are no send, modify or delete permissions. The app uses the Gmail REST API and never scrapes Gmail.
- **Email bodies are never stored.** They are fetched, parsed in server memory and discarded. The database keeps only message IDs, subject, sender, the Gmail snippet (~200 characters) and the extracted fields.
- **Email content goes only to Google and your own server.** No third-party service, and no LLM in v1.
- **The Google refresh token is stored encrypted** (AES-256-GCM). It lives in a table reachable only with the server-side secret key, and it never stays in a browser cookie.
- **Every user table has row-level security** (`user_id = auth.uid()`).

## How it works

```
Browser (Next.js pages)
  │  Supabase session cookie
  ▼
Next.js server (route handlers)
  ├─ Supabase (Postgres + Auth, RLS on every table)
  └─ Gmail REST API (access token refreshed from the encrypted refresh token)
```

### 1. Find candidate emails
Three Gmail queries run over the chosen date range, and the results are combined and de-duplicated:

- **Q1:** known ATS and assessment platforms (Greenhouse, Lever, Workday, HackerRank, CodeSignal and others).
- **Q2:** specific phrases such as "thank you for applying", "online assessment" and "not moving forward". This catches companies with in-house systems and human recruiters.
- **Q3:** LinkedIn and Indeed application confirmations.

Every query excludes chats, spam and trash. All lists live in [src/lib/config.ts](src/lib/config.ts).

### 2. Chunked scanning
A scan is a protocol, not one long request, so it works on serverless hosting and can be resumed:

1. `POST /api/scans` lists the message IDs, skips ones already processed, and queues them oldest-first.
2. The client repeatedly calls `POST /api/scans/:id/step`. Each call processes about 40 messages under a lease on the scan row, so two steps never run at once.
3. The scan can be cancelled or resumed, and only one scan per user can be active.

### 3. Extract
Each message goes through pure, unit-tested functions in `src/lib/extract`:

- **Classify:** a weighted score (ATS sender +4, application phrase in the subject +3, in the body +2, and so on). Newsletters, job alerts and emails you sent score negative. Job-related means a score of at least 3.
- **Event type:** the first match wins, in the order offer, rejection, withdrawal, final interview, interview invite, assessment, confirmation, recruiter outreach, other.
- **Company:** ATS-specific parsers, then regex patterns, then the sender domain through an alias map. Otherwise it is unknown and goes to review.
- **Role:** extracted only when a pattern matches. **It is never guessed;** no match shows as "Unknown".
- **Recruiter and requisition ID:** detected from sender, signature and headers, and from ID patterns.

Every decision appends a human-readable reason to `reasons[]`.

### 4. Match
Rules in `src/lib/match` run in order and the first one that fires decides. Same thread, same requisition ID, or same company plus a similar role attaches the email to an existing application. A different role at the same company becomes a new application. **Ambiguous matches go to a review queue and are never merged.**

### 5. Derive
Email events are the source of truth, and application fields are computed from them (`derive.ts`):

- **Applied date:** the earliest confirmation, or the earliest email marked "~" if none exists.
- **Status:** the latest terminal stage (offer, rejected, withdrawn) wins. Otherwise the highest stage seen: Applied, Recruiter Contacted, Assessment, Interviewing, Final Round. A stray later email never reopens a closed application, but a later interview invite does.
- **Recruiter:** the most recent one.

Fields you edit are stored in `overrides` and never overwritten. Events you assign, move or dismiss are locked and keep their application and state forever.

### 6. Dashboard
A sortable, searchable table with status filters. Clicking a row opens a panel with editable fields, an email timeline with **Open in Gmail** links, and merge, move and delete actions. A banner lists emails that need review.

**Keyboard shortcuts:** `/` focuses the search box; `Esc` closes the open panel or dialog.

## Tech stack

- Next.js 16 (App Router, TypeScript strict). Request interception is in `src/proxy.ts`, not `middleware.ts`.
- Tailwind CSS and shadcn/ui
- Supabase (Postgres, Auth, RLS) via `@supabase/ssr`
- `html-to-text`, `zod`, `date-fns`
- Vitest
- Vercel for hosting

## Getting started

Requires Node 20.9 or newer.

```bash
npm install
cp .env.example .env.local   # fill in values (see below)
npm run dev                  # http://localhost:3000
```

### Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` key |
| `SUPABASE_SECRET_KEY` | `sb_secret_…` key, server only, bypasses RLS |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | The Google OAuth web client also configured in Supabase |
| `TOKEN_ENCRYPTION_KEY` | 32 random bytes, base64: `openssl rand -base64 32` |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally |

Full Supabase and Google Cloud setup instructions, including Vercel deployment, are in [SETUP.md](SETUP.md).

### Google OAuth mode
The app is designed to stay in Google's **Testing** mode with you as the only test user. Testing-mode refresh tokens expire after 7 days, so the app shows a one-click **Reconnect Gmail** banner when that happens.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm start` | Run a production build (after `npm run build`) |
| `npm test` | Run Vitest |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:types` | Generate `src/lib/db/types.gen.ts` from the linked Supabase project |
| `npx supabase db push` | Apply migrations |
| `npm run check:env` | Validate required environment variables |

## Troubleshooting

- **No refresh token returned on sign-in.** Google only issues a refresh token on the *first* consent, or when you explicitly re-request consent. Revoke the app at [myaccount.google.com/permissions](https://myaccount.google.com/permissions) and sign in again — the app also does this automatically once and shows a clear error if it still doesn't get one.
- **"Gmail read access is required" after signing in.** The Gmail permission checkbox was unticked on Google's consent screen. Click **Reconnect Gmail**, and make sure the Gmail checkbox stays ticked this time.
- **Reconnect banner appears after about a week.** Expected in Google's OAuth **Testing** mode (the default, per `docs/DECISIONS.md` D17): refresh tokens expire after 7 days. Click **Reconnect Gmail** — it's one click and reuses your existing Google session. See `SETUP.md` for the optional "In production, unverified" mode that avoids this.
- **Sign-in or scans suddenly fail with a database/network error.** Free Supabase projects pause after about a week of inactivity. Open the project in the [Supabase dashboard](https://supabase.com/dashboard) and restore it; the app resumes working immediately, no re-deploy needed.
- **A scan step fails repeatedly.** Gmail quota errors and transient network errors are retried automatically with backoff (`src/lib/gmail/client.ts`). If a scan still ends with failed items, the dashboard shows a **Retry failed items** button; individual message fetch failures don't block the rest of the scan.

## Project layout

```
src/
  app/          pages and route handlers (auth, scans, gmail disconnect, debug)
  components/   UI components; ui/ holds shadcn primitives
  lib/
    config.ts   PARSER_VERSION, domains, phrases, thresholds, aliases
    supabase/   browser, server and admin clients
    gmail/      token handling, API client, query builder, MIME parsing, deep links
    extract/    pure classification and extraction (no Supabase, fetch or Next imports)
    match/      pure matching and derivation
    scan/       scan start and step logic
    db/         generated types and typed repository helpers
  proxy.ts      session refresh and /dashboard protection
supabase/migrations/   SQL schema
tests/                 Vitest tests and anonymized fixtures
docs/                  decisions, build notes and per-phase prompts
```

## Build phases

The app is built in 12 phases, one prompt file each in [docs/prompts/](docs/prompts/): scaffold, Supabase and Google setup, database, auth and Gmail connect, Gmail client, extraction, matching, scan pipeline, dashboard, detail and review UI, hardening and deploy, and optional AI assistance. Design decisions are recorded in [docs/DECISIONS.md](docs/DECISIONS.md).

## Out of scope for v1

Notes, job URL, salary, location, CSV export, reminders, calendar, analytics, scheduled background scans and multi-inbox support.
