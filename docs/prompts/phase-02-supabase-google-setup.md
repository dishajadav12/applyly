# Phase 02: Supabase & Google setup

Prerequisite: previous phase verified and committed.

## Prompt

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

## Definition of done

- [ ] `SETUP.md` has click-by-click instructions for all 5 steps, including the exact redirect URI format `https://<project-ref>.supabase.co/auth/v1/callback` and why Testing mode is the default (D17), with In production unverified documented as optional.
- [ ] `npm run check:env` exits 0 when all A11 variables are valid, and exits non-zero naming each missing or invalid variable (URLs must be URLs; the publishable key starts with `sb_publishable_`, the secret key with `sb_secret_`; `TOKEN_ENCRYPTION_KEY` must base64-decode to exactly 32 bytes).
- [ ] `.env.local` is gitignored; Claude did not write any real secrets into tracked files.
- [ ] No auth, Supabase client, or Gmail code was written in this phase.

## Manual verification

1. Follow `SETUP.md` end to end in the Supabase and Google Cloud consoles.
2. Generate the key: `openssl rand -base64 32` → paste into `.env.local` as `TOKEN_ENCRYPTION_KEY`.
3. `npm run check:env` → passes.
4. Temporarily blank `GOOGLE_CLIENT_SECRET` in `.env.local`, rerun → fails and names that variable. Restore it.
5. `npx supabase projects list` → your project is shown as linked.
6. Google Cloud console → OAuth consent screen → your Gmail is listed as a test user and `gmail.readonly` is the only non-default scope.
7. `git status` → `.env.local` is not listed. Commit, then tell Claude setup is done.
