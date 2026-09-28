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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
