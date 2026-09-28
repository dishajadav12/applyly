# Phase prompts

Build the app one phase at a time. Each file holds the prompt, a definition of done, and manual verification steps.
For the short step-by-step checklist (what to paste, gate, commit command), follow [../BUILD.md](../BUILD.md).

| # | File | What it builds |
|---|---|---|
| 01 | [phase-01-scaffold.md](phase-01-scaffold.md) | Next.js + TypeScript + Tailwind + shadcn/ui scaffold, dependencies, folder structure, `config.ts`, `.env.example`. |
| 02 | [phase-02-supabase-google-setup.md](phase-02-supabase-google-setup.md) | `SETUP.md` for Supabase + Google Cloud OAuth, and an `npm run check:env` validator. You do the console setup. |
| 03 | [phase-03-database.md](phase-03-database.md) | SQL migrations for the A5 schema with RLS, triggers, generated types, and `repo.ts`. |
| 04 | [phase-04-auth-gmail-connect.md](phase-04-auth-gmail-connect.md) | Google sign-in with `gmail.readonly`, encrypted refresh token storage, token refresh, disconnect, header. |
| 05 | [phase-05-gmail-client.md](phase-05-gmail-client.md) | Gmail fetch client, search queries, MIME parsing, and a dev-only `/debug` dry run. |
| 06 | [phase-06-extraction.md](phase-06-extraction.md) | Rule-based classification and company/role/recruiter/req ID extraction with ≥ 25 fixtures. |
| 07 | [phase-07-matching.md](phase-07-matching.md) | Matching rules M1–M8 and pure derivation of application fields. |
| 08 | [phase-08-scan-pipeline.md](phase-08-scan-pipeline.md) | Chunked scan API (start/step/cancel), progress UI, resume, and "Re-process all". |
| 09 | [phase-09-dashboard-table.md](phase-09-dashboard-table.md) | Application table with sort, search, status chips, empty states, and live refresh. |
| 10 | [phase-10-detail-edit-review.md](phase-10-detail-edit-review.md) | Detail sheet with overrides, timeline, merge/move/delete, and the review queue. |
| 11 | [phase-11-hardening-deploy.md](phase-11-hardening-deploy.md) | Error states, shortcuts, rate limiting, README, and Vercel deployment. |
| 12 | [phase-12-optional-ai.md](phase-12-optional-ai.md) | *(Optional, later)* Off-by-default AI fallback for low-confidence emails. |

## The loop

1. In Claude Code, say: `Execute docs/prompts/phase-XX-<name>.md`
2. Claude posts a short plan, builds only that phase, and runs typecheck, lint, and tests.
3. You work through the file's **Manual verification** steps and tick off its **Definition of done**.
4. If anything fails, tell Claude what you saw and have it fix it within the same phase.
5. Commit (`git add -A && git commit -m "Phase XX: <name>"`).
6. Move to the next phase. Never start a phase until the previous one is verified and committed.
