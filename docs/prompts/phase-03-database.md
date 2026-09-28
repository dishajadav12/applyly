# Phase 03: Database

Prerequisite: previous phase verified and committed.

## Prompt

```
Execute Phase 3. Create supabase/migrations with the full schema from PROJECT_SPEC.md A5: tables, indexes, RLS
enabled on all tables, owner policies (user_id = auth.uid()) on all except gmail_connections (no policies),
updated_at triggers, and a trigger creating a user_settings row on new auth user (first_name from Google metadata:
given_name, else the first word of full_name/name). Include the one-active-scan partial unique index, the scan lease
columns, the claim_scan_lease(scan_id) RPC (security invoker), and a delete_application(app_id) RPC per A8.
Push with `npx supabase db push`, generate types into src/lib/db/types.gen.ts, and create src/lib/db/repo.ts with
typed helpers. Write a short RLS sanity checklist in SETUP.md I can verify in the Supabase SQL editor.
```

## Definition of done

- [ ] Migration(s) in `supabase/migrations/` create all 7 A5 tables with the listed columns, defaults, and indexes.
- [ ] RLS is enabled on all 7 tables; 6 have owner policies (`user_id = auth.uid()`) for select/insert/update/delete; `gmail_connections` has zero policies.
- [ ] `scans` has `lock_token`/`locked_until` and the `scans_one_active_per_user` partial unique index; `email_events` has `rfc822_message_id` and `user_locked`; RPCs `claim_scan_lease` and `delete_application` exist (security invoker).
- [ ] `updated_at` triggers exist on `gmail_connections` and `applications`; a trigger on `auth.users` insert creates a `user_settings` row with `first_name` from Google metadata.
- [ ] `npx supabase db push` succeeds, `npm run db:types` produces `src/lib/db/types.gen.ts`, and `src/lib/db/repo.ts` typechecks against it.
- [ ] `SETUP.md` contains an RLS sanity checklist runnable in the SQL editor.

## Manual verification

1. `npx supabase db push` → applies cleanly.
2. Supabase dashboard → Table Editor → all 7 tables exist; each shows "RLS enabled".
3. SQL editor: `select tablename, rowsecurity from pg_tables where schemaname = 'public';` → 7 rows, all `true`.
4. SQL editor: `select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by 1;` → policies for 6 tables, none for `gmail_connections`.
5. Run the RLS checklist Claude added to `SETUP.md`.
6. Supabase → Authentication → Users → **Add user** → create `test@example.com` (auto-confirm) → Table Editor → `user_settings` has a row for it (signup trigger works). SQL editor: `insert into scans (user_id, range_start, range_end, status) select id, now(), now(), 'processing' from auth.users where email = 'test@example.com';` twice → the second fails with a unique violation. Then delete that test user (cascades).
7. `npm run db:types && npm run typecheck` → green. Commit.
