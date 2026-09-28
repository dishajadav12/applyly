# Phase 11: Hardening & deploy

Prerequisite: previous phase verified and committed.

## Prompt

```
Execute Phase 11: error states (needs_reconnect banner with Reconnect, quota backoff messaging, network errors, failed
items retry), keyboard shortcuts (Esc closes sheet, / focuses search), gate /debug to development only, rate-limit scan
start. Write README.md: what it is, privacy statement (exactly what is stored where), architecture, local setup,
commands, troubleshooting (no refresh token, Gmail permission unticked on consent, 7-day expiry, Supabase project paused). Add Vercel deployment steps to
SETUP.md (env vars, add prod URL to Supabase redirect URLs). Run build, typecheck, lint, and tests; fix everything.
```

## Definition of done

- [ ] Error states exist: `needs_reconnect` banner with Reconnect, Gmail quota backoff messaging, network errors, and retry for failed scan items.
- [ ] Esc closes the Sheet and `/` focuses search; `/debug` returns 404 in production builds; scan start is rate-limited.
- [ ] `README.md` covers what it is, an exact privacy statement, architecture, local setup, commands, and troubleshooting (no refresh token, Gmail permission unticked, 7-day expiry, paused Supabase project); `SETUP.md` has Vercel deployment steps.
- [ ] `npm run build`, `npm run typecheck`, `npm run lint`, and `npm test` all pass.
- [ ] The deployed Vercel URL can sign in and complete a scan.

## Manual verification

1. `npm run build && npm run start`, open http://localhost:3000/debug → 404.
2. SQL: `update gmail_connections set status = 'needs_reconnect';` → reload dashboard → reconnect banner; click Reconnect → status back to `active`.
3. Open a row, press Esc → Sheet closes; press `/` → search is focused.
4. Click **Scan Gmail** repeatedly → throttled with a message.
5. Follow the new Vercel section in `SETUP.md`: set env vars, add the prod URL to Supabase redirect URLs, deploy.
6. On the prod URL: sign in, run a "Last 7 days" scan, confirm the table. Commit and tag `v1.0`.
