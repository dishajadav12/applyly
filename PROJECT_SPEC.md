# Job Application Email Tracker: Full-Stack Project Spec

This single file is the source of truth for the project. It contains:

- **Part A:** the product and architecture spec
- **Part B:** rules for Claude Code (to be copied into `CLAUDE.md`)
- **Part C:** phase-by-phase build prompts (to be split into `docs/prompts/`)

---

# PART A: PRODUCT & ARCHITECTURE

## A1. What it is

This is a personal web app. You sign in with Google, grant read-only Gmail access, and click **Scan**. The server searches your Gmail for job-application emails and extracts company, role, status, and recruiter from each one. It then groups related emails into one row per application.

For example, a confirmation in May, an assessment in June, and an interview invite in July for the same company and role become **one** application:

- Applied: May 15
- Status: Interviewing
- Recruiter: set from the July email

Rescanning never creates duplicates. Manual corrections are never overwritten.

Context: the user has been applying to 2027 New Grad SWE roles since **May 2026**. The first scan must reconstruct that history.

## A2. Decisions (override before Phase 1 if you disagree)

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | App type | **Web app** (the Chrome extension is dropped) | A full-stack app makes the extension redundant. You can open the dashboard from any browser. A thin extension can be added later. |
| D2 | Framework | **Next.js 16+ (App Router) + TypeScript (strict)**. Request interception lives in `src/proxy.ts` (the Next.js 16 replacement for `middleware.ts`; with a `src/` dir it must be inside `src/`). Node ≥ 20.9. | One codebase covers the UI, API routes, and server-side Gmail calls. Deploys free on Vercel. |
| D3 | Data + Auth | **Supabase** (Postgres + Auth + Row Level Security), free tier | One service replaces three: the database, "Sign in with Google", and per-user data isolation through RLS. Neon is only Postgres; you would still need to build auth and Google OAuth token handling yourself. |
| D4 | DB access | `@supabase/supabase-js` + `@supabase/ssr`, SQL migrations via Supabase CLI, generated TS types. Use the new API keys (`sb_publishable_…`, `sb_secret_…`), not the legacy anon/service_role keys. Session checks in the proxy use `supabase.auth.getClaims()`. | Least moving parts. Domain logic (extraction, matching) stays DB-agnostic, so moving to Neon + Drizzle later is possible. Legacy keys are being phased out by Supabase. |
| D5 | Login = Gmail connect | Supabase Google OAuth requesting the `gmail.readonly` scope with `access_type=offline`. **Normal sign-in does not force consent.** Consent (`prompt=consent`) is forced only when connecting for the first time or reconnecting: the callback redirects to the consent flow if Google returned no refresh token and there is no `active` connection. | One click both logs you in and connects Gmail. Returning users aren't shown the consent screen every time, and an existing token is never replaced by an empty one. |
| D6 | Gmail token handling | In the auth callback: capture `provider_refresh_token`, check the granted scopes with Google's `tokeninfo` endpoint, encrypt the token with AES-256-GCM, and store it in `gmail_connections`. Then call `refreshSession()` so the session saved in cookies no longer contains provider tokens. The server refreshes access tokens itself using the Google client ID and secret. | Supabase does not refresh Google provider tokens, so the server must do it. The plaintext Google token must never stay in a browser cookie. |
| D7 | Gmail scope | `https://www.googleapis.com/auth/gmail.readonly` **only**. Google lets users untick individual permissions on the consent screen, so the callback verifies the scope was actually granted. If it wasn't, the user sees "Gmail read access is required" and a retry button. | This is the minimum scope that allows search and body reading. There are no send, modify, or delete permissions. |
| D8 | Where emails are processed | Server (Next.js route handlers) | Bodies are fetched, parsed in memory, and discarded. They are **never stored**. |
| D9 | Long scans | **Chunked scan protocol**. Step 1 lists message IDs into a `scan_items` queue. Then the client repeatedly calls a "step" endpoint that processes about 40 messages per call. Concurrent steps are prevented with a **lease** on the `scans` row (not a Postgres advisory lock). A partial unique index allows only one active scan per user. | Avoids serverless timeouts and needs no queue service. Progress is real, and an interrupted scan can be resumed. Advisory locks can't be held across supabase-js calls because every call is a separate HTTP request on a pooled connection. |
| D10 | Extraction | Rule-based (weighted signals + ATS-specific parsers). No LLM in v1. | Free, deterministic, testable, private. |
| D11 | UI | Tailwind + shadcn/ui (Table, Sheet, Dialog, Select, Badge, Input, DropdownMenu, Progress) | Polished SaaS look with little effort. |
| D12 | Tests | Vitest with anonymized fixtures | Extraction and matching *are* the product. |
| D13 | Hosting | Local dev on `localhost:3000` against a Supabase cloud project. Deploy on Vercel Hobby (free). | No Docker needed. |
| D14 | Language | English emails only | Keeps the rules manageable. |
| D15 | Manual event decisions | Assigning, moving, or dismissing an event, and deleting its application, sets `email_events.user_locked = true`. Scans and re-processing may refresh a locked event's extracted fields but never change its `application_id` or `state`. | `overrides` protects application fields. This protects the user's decisions about which application an email belongs to. |
| D16 | Gmail deep links | Store the RFC 822 `Message-ID` header. Link to `https://mail.google.com/mail/u/?authuser=<google_email>#search/rfc822msgid:<Message-ID>` | Gmail doesn't officially support `#all/<API message id>` links, and they often fail to open the message. `rfc822msgid:` search is stable. |
| D17 | Google OAuth app mode | Stay in **Testing** (you are the only test user) and make **Reconnect** one click. "In production, unverified" is optional and not relied on. | `gmail.readonly` is a restricted scope. Unverified production apps show an "unsafe app" warning, are capped at 100 users, and Google's policy can change. |

**Third-party services** (all free tier):

| Service | Why | Data sent / stored | Required? |
|---|---|---|---|
| Google (Gmail API + OAuth) | Source of the emails | Gmail content goes from Google to your server only | Yes |
| Supabase | Database + auth | Stores extracted fields, Gmail IDs, subjects, ~200-character snippets, and the encrypted refresh token. **No email bodies.** Free tier: 500 MB. Projects pause after about 1 week of inactivity; restore them from the dashboard. | Yes |
| Vercel | Hosting | Runs server code. Email bodies pass through memory only. | Only for deploying; local dev works without it. |

**Privacy trade-off vs. the extension version:** email bodies are now processed on your server instead of in your browser, and extracted data lives in your Supabase project. Bodies are still never persisted or sent anywhere else.

**Google OAuth app mode (D17):** OAuth consent screen, External, with you as a test user.

- **Testing** (the default path) issues refresh tokens that expire after 7 days. Token refresh then fails with `invalid_grant`; the app sets `needs_reconnect` and shows a one-click **Reconnect Gmail** banner, which reruns the consent flow and resumes normally.
- **Optional:** switch the app to **In production** without verification to avoid the weekly reconnect. Consent shows a "Google hasn't verified this app" warning (Advanced → continue). This works for a single personal user today, but it is not guaranteed, so nothing in the app depends on it. If you switch, sign in again afterwards to get a non-expiring refresh token.

## A3. User flow

1. Open the app and click **Sign in with Google**. Consent to read-only Gmail. You are redirected to the dashboard.
2. First visit shows an empty state with a big call to action: **Scan since May 1, 2026**.
3. Pick a range: Last 24h / 7d / 1m / 2m / 3m / Since May 1, 2026 / Custom (start + end date).
4. Click **Scan Gmail**. A progress bar shows "Searching…", then "Processing 120 / 342 · 27 job-related · 18 applications". The scan can be cancelled or resumed.
5. The table fills in. Click a row to open a side panel with editable fields, the email timeline, and "Open in Gmail" links.
6. Later, scan "Last 7 days". New emails update existing rows.

The date range controls **which emails are scanned**, not the application dates. An email from today about an older application keeps that application's original applied date.

## A4. Architecture

```
Browser (Next.js pages, React)
  │  Supabase session cookie
  ▼
Next.js server (route handlers, server actions)
  ├─ Supabase (Postgres + Auth, RLS on every table)
  └─ Gmail REST API (access token refreshed from the encrypted refresh token)
```

**Scan protocol:**

1. `POST /api/scans` with body `{rangeStart, rangeEnd}`.
   - Insert the `scans` row first with status `listing`. The partial unique index rejects a second active scan, and the endpoint returns `409` with the active `scanId`.
   - Run the Gmail queries (A6) and union the IDs.
   - Remove IDs already in `processed_messages` for the current `PARSER_VERSION`.
   - Insert `scan_items` rows (batched, ≤ 1000 per insert) with `seq` in oldest-first order. Gmail lists newest first, so reverse the list. Set the scan to `processing`.
   - Return `{scanId, total}`.
2. `POST /api/scans/:id/step`.
   - **Claim the lease** with the RPC `claim_scan_lease(scan_id) returns uuid` (SQL function, `security invoker`, so RLS applies). It runs `update scans set lock_token = <new uuid>, locked_until = now() + interval '90 seconds' where id = :id and user_id = auth.uid() and status = 'processing' and (locked_until is null or locked_until < now()) returning id`. If no row comes back, return `409 {busy: true}`; the client waits 2 s and retries.
   - Take up to 40 pending items in `seq` order.
   - Fetch each message with `format=full`, concurrency 8, and exponential backoff on 429/5xx.
   - Extract, then match. Write events and applications, re-derive the applications they touch, and mark the items done.
   - Release the lease (`locked_until = null`, only where `lock_token` still matches). If the lease expired mid-step, idempotent upserts keep the result correct.
   - Return progress counters and `done: boolean`.
3. The client loops on `step` until done. On page load, any scan still in `processing` status offers **Resume**. A scan stuck in `listing` for more than 5 minutes is marked `failed`.
4. `POST /api/scans/:id/cancel` marks the scan cancelled.

Only one active scan per user is allowed. This is enforced by `create unique index on scans (user_id) where status in ('listing','processing')`.

## A5. Data model (Postgres / Supabase)

Principle: **email events are the source of truth, and application fields are derived from them.** Derivation is a pure function, so results are order-independent and rescans are idempotent.

```sql
-- all tables: RLS enabled; policy user_id = auth.uid() for select/insert/update/delete
-- EXCEPT gmail_connections: RLS enabled with NO policies (admin/secret-key access only)

create table user_settings (
  user_id uuid primary key references auth.users on delete cascade,
  first_name text,              -- used as a signal: "Hi Disha," from a human sender
  last_scan_at timestamptz
);

create table gmail_connections (
  user_id uuid primary key references auth.users on delete cascade,
  google_email text not null,
  refresh_token_enc text not null,   -- AES-256-GCM, key = TOKEN_ENCRYPTION_KEY
  access_token_enc text,
  access_token_expires_at timestamptz,
  scope text not null,               -- granted scopes as reported by Google's tokeninfo endpoint
  status text not null default 'active',  -- active | needs_reconnect | revoked
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  company text not null,
  company_key text not null,          -- normalized for matching
  role text not null default 'Unknown',
  role_key text not null default '',
  req_ids text[] not null default '{}',
  applied_at timestamptz,
  applied_date_source text not null default 'inferred',  -- explicit | inferred
  status text not null default 'Applied',                 -- TS union, extensible
  primary_recruiter_email text,
  recruiters jsonb not null default '[]',   -- [{email,name,lastSeen}]
  thread_ids text[] not null default '{}',
  overrides jsonb not null default '{}',    -- {"status":true,...} user-edited fields
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on applications (user_id, company_key);

create table email_events (
  user_id uuid not null references auth.users on delete cascade,
  message_id text not null,
  thread_id text not null,
  rfc822_message_id text,                    -- Message-ID header, used for "Open in Gmail" (D16)
  application_id uuid references applications on delete set null,
  state text not null default 'linked',     -- linked | review | dismissed
  user_locked boolean not null default false, -- D15: application_id/state were set by the user; scans never change them
  received_at timestamptz not null,
  from_email text not null,
  from_name text,
  subject text not null,
  snippet text,                              -- Gmail snippet (~200 chars) only
  event_type text not null,
  company text, role text, req_id text,
  recruiter_email text, recruiter_name text, ats_source text,
  confidence real not null,
  match_confidence real,
  reasons text[] not null default '{}',
  parser_version int not null,
  primary key (user_id, message_id)
);
create index on email_events (user_id, thread_id);
create index on email_events (user_id, application_id);

create table processed_messages (          -- every scanned ID, job-related or not, so rescans skip it
  user_id uuid not null references auth.users on delete cascade,
  message_id text not null,
  parser_version int not null,
  is_job_related boolean not null,
  processed_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

create table scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  range_start timestamptz not null, range_end timestamptz not null,
  status text not null,               -- listing | processing | done | failed | cancelled
  total int not null default 0, processed int not null default 0,
  job_related int not null default 0,
  apps_created int not null default 0, apps_updated int not null default 0,
  error text,
  lock_token uuid, locked_until timestamptz,   -- step lease (A4)
  started_at timestamptz not null default now(), finished_at timestamptz
);
create unique index scans_one_active_per_user on scans (user_id) where status in ('listing','processing');

create table scan_items (
  scan_id uuid not null references scans on delete cascade,
  user_id uuid not null,
  message_id text not null,
  seq int not null,
  status text not null default 'pending',   -- pending | done | error
  error text,
  primary key (scan_id, message_id)
);
create index on scan_items (scan_id, status, seq);
```

TypeScript types:

```ts
type EventType = 'application_confirmation' | 'assessment' | 'recruiter_outreach' | 'interview_invite'
  | 'final_interview' | 'offer' | 'rejection' | 'withdrawal' | 'other_update';
type Status = 'Applied' | 'Recruiter Contacted' | 'Assessment' | 'Interviewing' | 'Final Round'
  | 'Offer' | 'Rejected' | 'Withdrawn' | 'Unknown';
```

## A6. Gmail search strategy

Run three queries per range, union and dedupe the results, then skip IDs already processed. The date filter is `after:<epochSec> before:<epochSec>`. Every query appends `-in:chats -in:spam -in:trash`. Promotions are **not** excluded, because the classifier handles marketing emails.

**Q1: ATS and assessment platforms.**
```
from:(greenhouse.io OR greenhouse-mail.io OR lever.co OR myworkday.com OR workday.com OR ashbyhq.com
 OR smartrecruiters.com OR icims.com OR jobvite.com OR taleo.net OR successfactors.com OR eightfold.ai
 OR avature.net OR workable.com OR rippling.com OR dover.com OR gem.com OR hackerrank.com
 OR codesignal.com OR coderpad.io OR hirevue.com OR karat.com OR codility.com OR testgorilla.com
 OR vervoe.com OR modernhire.com OR goodtime.io)
```

**Q2: specific phrases, for companies with in-house systems and human recruiters.**
Bare single words ("interview", "recruiter", "next steps", "new grad") are deliberately left out. In body text they match
thousands of newsletters and digests. `interview` is matched in the **subject** only.
```
("thank you for applying" OR "thanks for applying" OR "application received" OR "received your application"
 OR "your application to" OR "your application for" OR "your recent application" OR "thank you for your interest in"
 OR "online assessment" OR "coding assessment" OR "technical assessment" OR "coding challenge"
 OR "invitation to interview" OR "schedule an interview" OR "schedule your interview" OR "interview availability"
 OR "phone screen" OR "technical interview" OR "final round" OR "virtual onsite"
 OR "other candidates" OR "not moving forward" OR "move forward with other" OR "decided not to proceed"
 OR "no longer under consideration" OR "offer letter" OR "hiring team" OR "talent acquisition"
 OR "university recruiting" OR subject:interview)
 -from:(substack.com OR medium.com OR beehiiv.com OR mailchimpapp.net OR jobs-listings@linkedin.com
 OR jobalerts-noreply@linkedin.com)
```
Q2's noise-sender exclusions are a config list (`Q2_EXCLUDED_SENDERS`). Tune both lists with the Phase 5 dry run, which
shows the top sender domains per query. Target: a "Since May 1" combined count in the low thousands, not tens of thousands.

**Q3: LinkedIn and Indeed application confirmations.**
```
from:(jobs-noreply@linkedin.com OR indeed.com OR indeedapply) subject:(application OR applied)
```

List with `users.messages.list` (`maxResults=500`, paginated). Fetch with `users.messages.get?format=full`. Never download attachments. Body text is truncated to 15 KB after decoding. Keep the `Message-ID` header (D16).

All lists live in `src/lib/config.ts`.

## A7. Extraction pipeline (pure functions, `src/lib/extract/`)

```
Gmail message → decode MIME (base64url; prefer text/plain, else HTML→text via `html-to-text`)
  → normalize (whitespace, strip quoted replies "On … wrote:", strip footers)
  → classify → extract company/role/reqId/recruiter → ExtractionResult { ..., reasons[] }
```

**Classification (weighted scoring; job-related if score ≥ 3).**

Positive signals:
- ATS or assessment sender domain: +4
- Application phrase in the subject: +3
- Application phrase in the body: +2
- Candidate-portal link (`myworkdayjobs`, `boards.greenhouse.io`, `/candidate`): +2
- Human sender greeting the user by `first_name`: +1

Negative signals:
- `List-Unsubscribe` header plus marketing words (newsletter, webinar, % off, event, sale): −4
- LinkedIn or Indeed job **alerts** ("jobs you may be interested in", "new jobs for you", "recommended"): −6
- Sent by the user: −10

Event-type priority (first match wins):

1. offer
2. rejection
3. withdrawal
4. final_interview
5. interview_invite
6. assessment
7. application_confirmation
8. recruiter_outreach
9. other_update

Rejection phrases: "other candidates", "not moving forward", "decided not to proceed", "no longer under consideration", "position has been filled", and "unfortunately" together with application context.

**Company extraction (in priority order).**

1. ATS parsers:
   - **Greenhouse and Lever:** sender display name ("Stripe Recruiting" → Stripe), or subject patterns "application to/at X".
   - **Workday:** the sender local part or subdomain (`acme@myworkday.com`, `acme.wd5.myworkdayjobs.com`).
   - **Ashby:** "X Hiring Team".
   - **Assessment platforms:** "X has invited you", "on behalf of X", "X Coding Assessment".
2. Regex: "applying to/at/with X", "interest in X", "position at X", "X Talent Acquisition".
3. A non-freemail, non-ATS sender domain, run through the alias map (`datadoghq` → Datadog, `amazon.jobs` → Amazon, `metacareers` → Meta).
4. Otherwise `undefined`, and the event goes to review.

`company_key` normalization: lowercase, then strip Inc / LLC / Ltd / Corp / Technologies / Labs / Recruiting / Careers / Talent / Hiring Team and punctuation.

**Role extraction.** Search the subject first, then the body, for these patterns:

- "for the X position/role"
- "application for X"
- "applied to X at"
- "X – Application Received"

Also match phrases containing role keywords (Engineer, Developer, SWE, New Grad, University Grad, 2027). Reject captures over 100 characters or containing sentence punctuation. **If nothing matches, return `undefined`, shown as "Unknown". Never guess.**

**Recruiter detection.** The sender must not be a noreply, ATS, or scheduler address. It must also meet one of these:

- The display name or signature contains recruiter / talent / sourcer / university recruiting.
- The sender is replying in a thread already linked to an application.
- The `Reply-To` header is a human address.

Agency and gmail.com recruiters are allowed.

**Req ID patterns:**
- `R-?\d{4,}`
- `JR\d{5,}`
- `Req(uisition)? ?(ID|#)?:? ?[\w-]+`
- `Job ID:? ?[\w-]+`
- `gh_jid=\d+`
- Lever posting UUIDs

## A8. Matching (`src/lib/match/matcher.ts`, pure)

Rules are evaluated in order. The first one that fires decides.

| # | Rule | Conf. | Action |
|---|---|---|---|
| M1 | Same `thread_id` as an event already linked to an application | 1.00 | attach |
| M2 | Same `req_id` as an application | 0.95 | attach |
| M3 | Same `company_key` and role similarity ≥ 0.85 (token-based; ignores new grad / 2027 / entry level / early career / university / I) | 0.90 | attach |
| M3b | Same `company_key`, the event has a role, and the company has exactly one application with role **Unknown** | 0.80 | attach; derive fills in the role |
| M4 | Same `company_key`, the event has no role, and the company has exactly one non-terminal application | 0.75 | attach |
| M4b | Same `company_key`, the event has no role, the company has no non-terminal application and exactly one terminal one, and the event is a `rejection`, `withdrawal`, or `other_update` (a follow-up to a closed application) | 0.70 | attach |
| M5 | Same `company_key`, the event has no role, and M4/M4b don't apply (several candidates, or a new-stage email for a company whose only application is closed) | 0.40 | **review** |
| M6 | Same `company_key`, the event's role matches no existing application | — | create |
| M7 | No application exists for the company | — | create (`inferred` unless the event is an application confirmation) |
| M8 | Company unknown | — | **review** |

Different roles at the same company become different applications. Third-party assessment emails match on the extracted company, role, or thread; the sender domain is ignored for matching.

Events with `user_locked = true` skip the matcher entirely (D15). "Terminal" means the application's derived status is Offer, Rejected, or Withdrawn.

**Derived fields (`derive.ts`).** These are recomputed after every change, and any field set in `overrides` is skipped.

- **applied_at:** the earliest `application_confirmation` (source: `explicit`). If there is none, the earliest event (source: `inferred`, displayed with a leading "~").
- **role:** the most specific non-Unknown role, preferring roles from confirmation emails.
- **status:**
  - **Stage events** are `assessment`, `interview_invite`, `final_interview`, `offer`, `rejection`, and `withdrawal`. `application_confirmation`, `recruiter_outreach`, and `other_update` are **not** stage events.
  - If the latest-dated stage event is terminal (offer → Offer, rejection → Rejected, withdrawal → Withdrawn), that is the status. A later non-stage email (for example a delayed LinkedIn confirmation or a recruiter note) never reopens a closed application. A later *stage* event (for example an interview invite after a rejection) does reopen it.
  - Otherwise use the highest-ranked stage seen: Applied 10 (any confirmation, or the default), Recruiter Contacted 20, Assessment 30, Interviewing 40, Final Round 50.
  - Recruiter emails never downgrade the status.
  - Only events with `state = 'linked'` count toward derivation.
- **primary_recruiter_email:** the latest recruiter. All recruiters are kept in `recruiters`.

**Idempotency:**
- The `(user_id, message_id)` primary key on both `email_events` and `processed_messages` prevents duplicate records.
- When `PARSER_VERSION` is bumped, "Re-process all" deletes the matching `processed_messages` rows and rescans those IDs.
- User deletions and dismissals keep their event rows (state `review` or `dismissed`), so rescans don't recreate them.
- The event upsert on re-process updates extracted fields, but when `user_locked = true` it keeps `application_id` and `state` unchanged (D15).
- **Delete application:** in one transaction (RPC), set its events to `application_id = null`, `state = 'review'`, `user_locked = true`, then delete the row. Don't rely on `on delete set null` alone; that would leave `state = 'linked'`.
- **Merge / Move event / review assign:** set `application_id`, `state = 'linked'`, `user_locked = true`, then re-derive every affected application. **Dismiss:** `state = 'dismissed'`, `user_locked = true`.

## A9. UI

**Header:**
- App name
- Gmail status: "● Connected as x@gmail.com", "Reconnect", or "Sign in"
- "Last scanned 2h ago"
- Range select
- **Scan Gmail** button
- Avatar menu with Re-process all, Disconnect Gmail, and Sign out

**Progress bar:** shows the stage and counters (processed / total, job-related, applications), plus a Cancel button.

**Review banner:** "5 emails need review" opens a dialog. For each email you can assign it to an existing application, create a new application, or dismiss it as not job-related.

**Table:**
- Columns: Company, Role, Applied, Status, Recruiter
  - **Applied** shows a leading "~" and a tooltip when the date is inferred.
  - **Status** is a colored badge.
  - **Recruiter** is a mailto link.
- Sortable by Applied, Company, and Status.
- One search box matching company or role.
- Status filter chips with counts.
- A dot on rows where `needs_review` is set.

**Detail panel (Sheet):**
- Editable fields: company, role, applied date, status select, recruiter email. Editing a field sets its override; each edited field has a "reset to auto" link.
- Timeline: date, event label, subject, and an **Open in Gmail** link to `https://mail.google.com/mail/u/?authuser=<google_email>#search/rfc822msgid:<url-encoded rfc822_message_id>` (D16). If the header is missing, fall back to `#all/<message_id>`.
- Recruiter list.
- Actions: **Delete** (its events move to review), **Merge into…**, and **Move event** to another application.

**States:**
- Signed out (landing page with privacy blurb and sign-in)
- Never scanned
- Scanning
- No results for the current filter
- Errors: needs reconnect, Gmail scope not granted (retry consent), Gmail quota (auto-retry), network, failed scan (Resume)

**Style:** neutral background, one accent color, Inter, 14px table text, generous whitespace. Aim for the look of Linear or Notion, not an admin panel.

## A10. Project structure

```
job-tracker/
  CLAUDE.md  PROJECT_SPEC.md  README.md  SETUP.md  .env.example
  docs/BUILD.md  docs/DECISIONS.md  docs/prompts/README.md  docs/prompts/phase-01 … phase-12 .md
  supabase/migrations/*.sql
  src/
    app/
      page.tsx                      # landing / sign-in
      dashboard/page.tsx
      auth/sign-in/route.ts         # GET ?consent=1 → server-side signInWithOAuth, redirect to Google (D5)
      auth/callback/route.ts        # exchange code, verify scope, encrypt refresh token, drop provider tokens from session
      api/scans/route.ts            # POST start
      api/scans/[id]/step/route.ts
      api/scans/[id]/cancel/route.ts
      api/gmail/disconnect/route.ts
      debug/page.tsx                # dev-only classify preview
    lib/
      config.ts                     # PARSER_VERSION, domains, phrases, thresholds, aliases
      supabase/{client,server,admin,proxy}.ts
      crypto.ts                     # AES-256-GCM encrypt/decrypt
      gmail/{tokens,client,query,mime,links}.ts   # links = Open-in-Gmail URL builder (D16)
      extract/{normalize,classify,company,role,recruiter,reqId,index}.ts  extract/ats/*.ts
      match/{normalize,similarity,matcher,derive}.ts
      scan/{start,step}.ts
      db/{types.gen.ts,repo.ts}
    components/  (header, scan-controls, app-table, detail-sheet, review-dialog, status-badge, ui/*)
    proxy.ts                        # Next.js 16 proxy (formerly middleware.ts): session refresh, protect /dashboard
  tests/fixtures/*.json  tests/*.test.ts
```

## A11. Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= # sb_publishable_… (Project Settings → API Keys)
SUPABASE_SECRET_KEY=                  # sb_secret_…, server only (admin client; bypasses RLS)
GOOGLE_CLIENT_ID=                     # same Web client configured in Supabase
GOOGLE_CLIENT_SECRET=
TOKEN_ENCRYPTION_KEY=                 # 32 random bytes, base64: openssl rand -base64 32
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## A12. Out of scope for v1

Notes, job URL, salary, location, sponsorship, CSV export, reminders, calendar, analytics, scheduled background scans, and multi-inbox support.

Adding a field later means one migration column, one type field, and one input.

---

# PART B: RULES FOR CLAUDE CODE (copy verbatim into CLAUDE.md)

```markdown
# CLAUDE.md: Job Application Email Tracker

Full-stack Next.js + Supabase app that scans Gmail (read-only) and reconstructs job applications.
Source of truth: PROJECT_SPEC.md (Part A). Phase prompts: docs/prompts/.

## Stack
Next.js 16+ (App Router; request interception in src/proxy.ts, never middleware.ts) · TypeScript strict ·
Tailwind + shadcn/ui · Supabase (Postgres, Auth, RLS) via @supabase/ssr with publishable/secret API keys ·
Supabase CLI migrations + generated types · html-to-text · Vitest · Vercel.
Decisions: docs/DECISIONS.md (D1–D17).

## Non-negotiable rules
- Gmail scope is gmail.readonly ONLY. Use the Gmail REST API; never scrape Gmail.
- Never persist email bodies. Store only IDs, subject, sender, Gmail snippet, and extracted fields.
- Never send email content to any service other than Google and our own server.
- The Google refresh token is stored only encrypted (src/lib/crypto.ts). The gmail_connections table is accessible only via the admin (secret-key) client.
  Provider tokens must not remain in the Supabase session cookie (refreshSession() after capture). Never overwrite a
  stored refresh token with an empty one. Verify the granted scope via Google tokeninfo.
- Every user table has RLS: user_id = auth.uid(). Never use the admin (secret-key) client for user data when the session client works.
- Never guess a role. No match → undefined → "Unknown".
- Ambiguous match → review queue, never a merge.
- Events with user_locked = true keep their application_id and state forever; scans and re-processing never change them.
- Application fields are DERIVED from linked events (src/lib/match/derive.ts). Fields in `overrides` are never overwritten.
- (user_id, message_id) is the idempotency key. Scans must never create duplicates.
- Scans are chunked (start → repeated step). No single request may process more than ~40 messages.
  Step concurrency uses the scans-row lease (claim_scan_lease RPC), never Postgres advisory locks.

## Code conventions
- src/lib/extract and src/lib/match are pure: no Supabase, no fetch, no Next imports. Fully unit-tested.
- All tunable lists and thresholds live in src/lib/config.ts. Bump PARSER_VERSION when extraction changes.
- Every classification/matching decision appends a human-readable string to reasons[].
- Server-only modules import "server-only".
- Small components; shadcn/ui primitives only.
- Test fixtures are anonymized (fake names and emails).

## Commands
npm run dev · npm run build · npm test · npm run typecheck · npm run lint
npx supabase db push · npm run db:types (generate src/lib/db/types.gen.ts)

## Workflow
- Execute exactly one phase file from docs/prompts/ per request. Start with a short plan.
- Before finishing a phase, run typecheck, lint, and tests and fix failures.
- End each phase with: what was built, what the human must do manually, and how to verify.
- Never edit PROJECT_SPEC.md unless asked. If you must deviate from it, say so and explain why.
```

---

# PART C: PHASE PROMPTS (each becomes `docs/prompts/phase-XX-name.md`)

### phase-01-scaffold
```
Read CLAUDE.md and PROJECT_SPEC.md. Execute Phase 1 only.
Scaffold a Next.js 16+ (App Router, TypeScript strict, ESLint, src/ dir, Tailwind) app in the current directory
without deleting CLAUDE.md, PROJECT_SPEC.md, or docs/. Initialize shadcn/ui and add: button, input, table, sheet, dialog,
select, badge, dropdown-menu, progress, tooltip, sonner. Install @supabase/supabase-js, @supabase/ssr, html-to-text,
server-only, zod, date-fns; dev: vitest, supabase CLI. Add scripts: test, typecheck, db:types.
Create the folder structure from PROJECT_SPEC.md A10 with stub files (src/proxy.ts, not middleware.ts), src/lib/config.ts
(PARSER_VERSION = 1 and all lists from A6/A7, including Q2_EXCLUDED_SENDERS), and .env.example from A11. Build a simple landing page placeholder. Update .gitignore.
Verify `npm run dev`, typecheck, and test all pass.
```

### phase-02-supabase-google-setup
```
Execute Phase 2. Write SETUP.md with exact click-by-click instructions for me:
1) Create a Supabase project; copy URL, publishable key (sb_publishable_…) and secret key (sb_secret_…) into .env.local.
2) Google Cloud: create project, enable Gmail API, OAuth consent screen (External, add gmail.readonly scope, add me as
   test user; Testing is the default per D17 (7-day refresh token expiry + one-click Reconnect); document In production
   unverified as optional), create an OAuth client of type
   "Web application" with redirect URI https://<project-ref>.supabase.co/auth/v1/callback.
3) Supabase Auth → Providers → Google: paste client ID/secret. Auth → URL Configuration: Site URL
   http://localhost:3000, redirect URLs http://localhost:3000/auth/callback (+ prod URL later).
4) Put GOOGLE_CLIENT_ID/SECRET and a generated TOKEN_ENCRYPTION_KEY in .env.local.
5) supabase login + supabase link.
Also create a small `npm run check:env` script that validates required env vars with zod. Then stop and wait for me to
confirm setup is done. Do not write auth code yet.
```

### phase-03-database
```
Execute Phase 3. Create supabase/migrations with the full schema from PROJECT_SPEC.md A5: tables, indexes, RLS
enabled on all tables, owner policies (user_id = auth.uid()) on all except gmail_connections (no policies),
updated_at triggers, and a trigger creating a user_settings row on new auth user (first_name from Google metadata:
given_name, else the first word of full_name/name). Include the one-active-scan partial unique index, the scan lease
columns, the claim_scan_lease(scan_id) RPC (security invoker), and a delete_application(app_id) RPC per A8.
Push with `npx supabase db push`, generate types into src/lib/db/types.gen.ts, and create src/lib/db/repo.ts with
typed helpers. Write a short RLS sanity checklist in SETUP.md I can verify in the Supabase SQL editor.
```

### phase-04-auth-gmail-connect
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

### phase-05-gmail-client
```
Execute Phase 5. Implement src/lib/gmail/{client,query,mime}.ts per A6:
- client: fetch wrapper with bearer token, one retry on 401 after refresh, exponential backoff on 429/5xx, concurrency pool helper.
- query: buildQueries(rangeStart, rangeEnd) → Q1..Q3 with epoch-second filters and exclusions; listMessageIds with pagination.
- mime: decode base64url, walk multipart, prefer text/plain else html-to-text, strip quoted replies, truncate 15KB,
  return ParsedMessage {messageId, threadId, rfc822MessageId, receivedAt, from, fromName, replyTo, subject, snippet, text, headers}.
- links: gmailMessageUrl(googleEmail, rfc822MessageId, messageId) per D16.
Unit-test mime, query, and links. Add dev-only /debug page with range picker and "Dry run" showing unique ID counts per
query and combined, plus the top 20 sender domains per query (fetched with format=metadata) so Q2 can be tuned.
```

### phase-06-extraction
```
Execute Phase 6, the most important phase. Build src/lib/extract per A7 as pure functions:
classify (weighted scoring + event type priority), ATS parsers (greenhouse, lever, workday, ashby, assessment platforms),
company extraction + normalization + alias map, role extraction returning undefined when unsure, recruiter detection,
reqId extraction. Every rule appends to reasons[].
Create ≥25 anonymized fixtures covering every event type, every listed ATS, third-party assessments, agency/gmail recruiters,
LinkedIn job ALERTS and newsletters (must be isJobRelated=false), and emails with no role (role must be undefined).
Write table-driven Vitest tests; all pass.
Extend /debug with "Classify preview": fetch the range and show subject | from | jobRelated | eventType | company | role |
confidence | reasons. Nothing is stored.
```

### phase-07-matching
```
Execute Phase 7. Build src/lib/match per A8: normalize, similarity (token-based with noise words), matcher (rules
M1–M8 incl. M3b, returns {action, applicationId?, matchConfidence, reason}), derive (applied_at + source, role, status rank
rules, recruiters, primary recruiter, thread_ids, req_ids; respects overrides).
Implement M4b and the stage-event status rules exactly as in A8; user_locked events skip the matcher.
Tests must include: Example Corp May15 confirmation / Jun20 assessment / Jul3 interview → 1 application, Interviewing,
applied May 15 explicit; Google with 3 different roles → 3 applications; role-less rejection with 1 company app → attach;
with 2 apps → review; HackerRank email naming the company → attach; rejection processed before confirmation → still 1
application with correct role via M3b and explicit applied date; recruiter after interview doesn't downgrade; overridden
status unchanged; reversed input order gives identical derived output; a confirmation dated after a rejection keeps
the app Rejected; an interview invite after a rejection reopens it (Interviewing); role-less rejection for a company
whose only app is Rejected → attach (M4b); role-less assessment for that company → review (M5).
```

### phase-08-scan-pipeline
```
Execute Phase 8. Implement the chunked scan protocol from A4:
POST /api/scans (list, dedupe against processed_messages at current PARSER_VERSION, insert scans + scan_items oldest-first),
POST /api/scans/[id]/step (≤40 items, lease via claim_scan_lease with 409 busy + client retry, fetch → extract → upsert
processed_messages → for job-related: match, upsert email_events preserving application_id/state when user_locked,
create/update applications, re-derive touched apps; update counters; mark done/failed per item; release lease),
POST /api/scans/[id]/cancel. Enforce one active scan per user via the partial unique index (409 with the active scanId).
Batch scan_items inserts. Update user_settings.last_scan_at on completion.
UI: scan range select (24h, 7d, 1m, 2m, 3m, Since May 1 2026, Custom), Scan button, progress bar with counters,
Cancel, Resume for interrupted scans. Add "Re-process all" in the avatar menu.
Verify: scan since May 1, then scan it again → 0 new events and the same application count.
```

### phase-09-dashboard-table
```
Execute Phase 9. Build the application table per A9 with server-fetched data plus client-side sort/filter:
columns, inferred "~" dates with tooltip, colored status badges, mailto recruiter, sort by Applied/Company/Status,
search (company or role), status chips with counts, needs-review dot. Empty states: never scanned (big CTA), no filter
results. Loading skeletons. Polish to a clean SaaS look (sticky header, hover rows, consistent spacing).
Refresh the table after each scan step.
```

### phase-10-detail-edit-review
```
Execute Phase 10 per A9: detail Sheet with editable fields (server actions, set overrides, "reset to auto" per field),
timeline with Open in Gmail links (src/lib/gmail/links.ts), recruiters list, Delete (delete_application RPC: events →
review), Merge into (searchable picker; move events, re-derive target, delete source), Move single event. Review dialog +
banner: assign to existing, create new, or dismiss (state=dismissed). Every assign/move/merge/dismiss/delete sets
user_locked=true per D15. All mutations re-derive affected applications.
Verify: edit a status, rescan, and the edit survives; merge works; a dismissed email is not re-added; a moved event stays
moved after "Re-process all".
```

### phase-11-hardening-deploy
```
Execute Phase 11: error states (needs_reconnect banner with Reconnect, quota backoff messaging, network errors, failed
items retry), keyboard shortcuts (Esc closes sheet, / focuses search), gate /debug to development only, rate-limit scan
start. Write README.md: what it is, privacy statement (exactly what is stored where), architecture, local setup,
commands, troubleshooting (no refresh token, Gmail permission unticked on consent, 7-day expiry, Supabase project paused). Add Vercel deployment steps to
SETUP.md (env vars, add prod URL to Supabase redirect URLs). Run build, typecheck, lint, and tests; fix everything.
```

### phase-12-optional-ai (later)
```
Execute Phase 12 (optional). Add an AI fallback only for events with low confidence or missing company/role, off by default,
behind a settings toggle. Provider interface with two implementations: (a) Google Gemini API free tier, (b) local Ollama for dev.
Send only subject, sender, and the first 2KB of text; require strict JSON {company, role, eventType}, validate with zod, never
override a higher-confidence rule result, and record "ai:<provider>" in reasons[]. Document exactly what is sent in README.
```
