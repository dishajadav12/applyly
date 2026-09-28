# Build runbook

This is the one file to follow from an empty folder to a deployed app. Each step says what to do before starting, the
exact prompt to paste into Claude Code, the gate that must pass before moving on, and the commit command.

The detailed prompt, definition of done, and manual verification for each step are in `docs/prompts/phase-XX-*.md`.
The spec is `PROJECT_SPEC.md`, and the rules are in `CLAUDE.md`.

**Rules for every step**
- Do one step per Claude Code request, and don't start a step until the previous one is committed.
- If a gate fails, stay in the step and paste what you saw: `Phase XX verification failed: <what happened>. Fix it within Phase XX.`
- If Claude wants to deviate from the spec, it must say so first. Record accepted deviations in `docs/DECISIONS.md`.

---

## Step 0: Project setup (done)

- [x] `CLAUDE.md`, `PROJECT_SPEC.md`, `docs/prompts/`, `docs/DECISIONS.md` created
- [x] Spec reviewed and revised (D1–D17)

Before Step 1:
```bash
node -v
```
It must be ≥ 20.9. If it isn't, install the current LTS from https://nodejs.org or with `nvm install --lts`.

---

## Step 1: Scaffold

**Before:** nothing.

**Paste:**
```
Execute docs/prompts/phase-01-scaffold.md
```

**Gate:**
- [ ] `npm run dev` → placeholder page at http://localhost:3000
- [ ] `npm run typecheck && npm run lint && npm test` → green
- [ ] `src/proxy.ts` exists; there is no `middleware.ts`
- [ ] All items in the phase file's Definition of done are ticked

**Commit** (the first time also initializes git):
```bash
git init && git add -A && git commit -m "Phase 1: scaffold"
```

---

## Step 2: Supabase + Google setup (mostly your clicks)

**Before:** you need a Google account (the Gmail you apply from) and a free Supabase account.

**Paste:**
```
Execute docs/prompts/phase-02-supabase-google-setup.md
```

**Then you:** follow `SETUP.md` in the Supabase and Google Cloud consoles and fill in `.env.local`.

**Gate:**
- [ ] `npm run check:env` → passes
- [ ] `npx supabase projects list` → project linked
- [ ] Google consent screen: External, Testing, you as test user, only `gmail.readonly` added
- [ ] `git status` doesn't list `.env.local`

**Tell Claude:** `Setup is done.` Then commit:
```bash
git add -A && git commit -m "Phase 2: setup docs and env check"
```

---

## Step 3: Database

**Paste:**
```
Execute docs/prompts/phase-03-database.md
```

**Gate:**
- [ ] `npx supabase db push` applied
- [ ] 7 tables, all with RLS on; `gmail_connections` has no policies
- [ ] With a temporary test user: signup trigger creates `user_settings`, and a second active scan is rejected (SQL test in the phase file)
- [ ] `npm run db:types && npm run typecheck` → green

```bash
git add -A && git commit -m "Phase 3: database schema, RLS, RPCs"
```

---

## Step 4: Auth + Gmail connect

**Paste:**
```
Execute docs/prompts/phase-04-auth-gmail-connect.md
```

**Gate:**
- [ ] Sign in → dashboard shows "● Connected as <you>"
- [ ] `gmail_connections.refresh_token_enc` is ciphertext
- [ ] Session cookie has no `provider_token` / `provider_refresh_token`
- [ ] Second sign-in: no consent screen, token unchanged
- [ ] Unticking Gmail on consent → "Gmail read access is required"
- [ ] Disconnect removes the row and the Google grant

```bash
git add -A && git commit -m "Phase 4: Google sign-in and Gmail connection"
```

---

## Step 5: Gmail client + dry run

**Paste:**
```
Execute docs/prompts/phase-05-gmail-client.md
```

**Gate:**
- [ ] mime, query, and links tests pass
- [ ] `/debug` → **Dry run** for "Since May 1, 2026" shows per-query and combined counts
- [ ] Combined count is in the low thousands. If it isn't, check Q2's top sender domains and ask Claude to add the noisy ones to `Q2_EXCLUDED_SENDERS`
- [ ] No rows written to the database

```bash
git add -A && git commit -m "Phase 5: Gmail client, MIME parsing, dry run"
```

---

## Step 6: Extraction (most important)

**Paste:**
```
Execute docs/prompts/phase-06-extraction.md
```

**Gate:**
- [ ] ≥ 25 anonymized fixtures; all tests pass
- [ ] `src/lib/extract` has no Supabase, Next.js, or fetch imports
- [ ] `/debug` **Classify preview** on the last month: job alerts and newsletters are `false`; unseen roles show Unknown
- [ ] Every misclassification you found has become a fixture and passes

To fix misclassifications, paste:
```
Phase 6 follow-up: these were misclassified: <subject / expected / got>. Add anonymized fixtures and fix the rules.
```

```bash
git add -A && git commit -m "Phase 6: rule-based extraction with fixtures"
```

---

## Step 7: Matching + derivation

**Paste:**
```
Execute docs/prompts/phase-07-matching.md
```

**Gate:**
- [ ] Every scenario named in the phase prompt has its own passing test
- [ ] Order-independence test passes (reversed + shuffled)
- [ ] `src/lib/match` is pure

```bash
git add -A && git commit -m "Phase 7: matching rules and derivation"
```

---

## Step 8: Scan pipeline

**Paste:**
```
Execute docs/prompts/phase-08-scan-pipeline.md
```

**Gate:**
- [ ] Full scan since May 1, 2026 completes; Resume works after a mid-scan reload
- [ ] Rescan of the same range → identical `email_events` and `applications` counts
- [ ] A second concurrent scan is rejected; a concurrent `step` returns `409 busy`
- [ ] Cancel works; snippets are ≤ ~200 characters and no bodies are stored

```bash
git add -A && git commit -m "Phase 8: chunked scan pipeline"
```

---

## Step 9: Dashboard table

**Paste:**
```
Execute docs/prompts/phase-09-dashboard-table.md
```

**Gate:**
- [ ] Sort, search, status chips (counts add up), "~" tooltip, mailto, review dot
- [ ] Empty and no-results states; rows update live during a scan

```bash
git add -A && git commit -m "Phase 9: application table"
```

---

## Step 10: Detail sheet, editing, review

**Paste:**
```
Execute docs/prompts/phase-10-detail-edit-review.md
```

**Gate:**
- [ ] Edited status survives a rescan; "reset to auto" restores it
- [ ] **Open in Gmail** opens the right email
- [ ] Merge, delete (→ review), and dismiss (never re-added) all work
- [ ] A moved event stays moved after **Re-process all**

```bash
git add -A && git commit -m "Phase 10: detail sheet, overrides, review queue"
```

---

## Step 11: Hardening + deploy

**Before:** a free Vercel account connected to a GitHub repo for this project (push the repo first).

**Paste:**
```
Execute docs/prompts/phase-11-hardening-deploy.md
```

**Gate:**
- [ ] `npm run build && npm run typecheck && npm run lint && npm test` → green
- [ ] `/debug` is 404 in production; reconnect banner works; Esc and `/` shortcuts work
- [ ] Deployed URL: sign in + "Last 7 days" scan works
- [ ] Production URL added to Supabase redirect URLs

```bash
git add -A && git commit -m "Phase 11: hardening and deployment" && git tag v1.0
```

---

## Step 12 (optional, later): AI fallback

Only after v1 has run for a while and you have real misclassifications the rules can't fix.

**Paste:**
```
Execute docs/prompts/phase-12-optional-ai.md
```

**Gate:**
- [ ] Off by default; with it off, no AI requests are made
- [ ] Payload test: only subject, sender, and first 2 KB are sent
- [ ] Never overrides a higher-confidence rule result

```bash
git add -A && git commit -m "Phase 12: optional AI fallback"
```

---

## Ongoing

| Situation | What to do |
|---|---|
| Weekly "Reconnect Gmail" banner | Expected in Testing mode (D17). Click **Reconnect**. |
| Supabase project paused | Supabase dashboard → Restore project. |
| Extraction rules changed | Claude bumps `PARSER_VERSION`; then avatar menu → **Re-process all**. |
| New spec decision | Ask Claude to update `PROJECT_SPEC.md` + `docs/DECISIONS.md` first, then build. |
