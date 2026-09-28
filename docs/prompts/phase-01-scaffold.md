# Phase 01: Scaffold

Prerequisite: previous phase verified and committed.

## Prompt

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

## Definition of done

- [ ] `npm run dev` serves a landing placeholder at http://localhost:3000, and `CLAUDE.md`, `PROJECT_SPEC.md`, and `docs/` are untouched.
- [ ] `npm run typecheck`, `npm run lint`, and `npm test` all exit 0.
- [ ] shadcn/ui is initialized and `src/components/ui/` contains button, input, table, sheet, dialog, select, badge, dropdown-menu, progress, tooltip, sonner. All listed runtime and dev dependencies are in `package.json`; scripts `test`, `typecheck`, `db:types` exist.
- [ ] The A10 folder structure exists with stub files (`src/proxy.ts`, no `middleware.ts` anywhere), and `src/lib/config.ts` exports `PARSER_VERSION = 1` plus every list from A6/A7 (ATS/assessment domains, Q1–Q3 phrases, alert/marketing phrases, rejection phrases, `Q2_EXCLUDED_SENDERS`, company suffixes, alias map, score threshold 3).
- [ ] `.env.example` contains exactly the A11 variables with no real values; `.gitignore` covers `.env*.local`, `.next`, `node_modules`, `supabase/.temp`.

## Manual verification

1. `node -v` → must be ≥ 20.9 (required by current Next.js).
2. `npm run dev`, open http://localhost:3000 → the placeholder landing page renders with no console errors.
3. In a second terminal: `npm run typecheck && npm run lint && npm test` → all green.
4. `ls CLAUDE.md PROJECT_SPEC.md docs/prompts` → all still present.
5. `cat .env.example` → the 7 variables from A11 (including `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`), all empty. `ls middleware.ts src/middleware.ts` → neither exists.
6. Skim `src/lib/config.ts` against A6 and A7 → every domain and phrase is there.
7. `git init && git add -A && git commit -m "Phase 1: scaffold"` → confirm `git status` did not stage any `.env*.local` file.
