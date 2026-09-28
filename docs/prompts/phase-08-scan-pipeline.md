# Phase 08: Scan pipeline

Prerequisite: previous phase verified and committed.

## Prompt

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

## Definition of done

- [ ] `POST /api/scans` lists IDs, drops IDs already processed at the current `PARSER_VERSION`, inserts `scans` + `scan_items` oldest-first, returns `{scanId, total}`, and rejects a second active scan for the same user.
- [ ] `POST /api/scans/[id]/step` processes ≤ 40 items per call, claims the `claim_scan_lease` lease (concurrent step → `409 {busy: true}`, client retries), updates counters, and returns `done`; `cancel` marks the scan cancelled.
- [ ] Rescanning the same range yields 0 new `email_events` and the same `applications` count; re-processing never changes `application_id`/`state` on `user_locked` events.
- [ ] Reloading mid-scan shows **Resume**, and resuming completes the scan without duplicates; `user_settings.last_scan_at` is set on completion.
- [ ] No table contains email body text (only IDs, subject, sender, ≤ ~200-char snippet, extracted fields).

## Manual verification

1. Dashboard → range "Since May 1, 2026" → **Scan Gmail**. Watch "Searching…" then "Processing N / total · X job-related · Y applications".
2. Halfway through, reload the page → **Resume** appears → click it → scan finishes.
3. SQL editor: `select count(*) from email_events; select count(*) from applications; select count(*) from processed_messages;` → note the numbers.
4. Run the same scan again → it finishes almost instantly; rerun the SQL → identical counts.
5. Open a second tab and click **Scan Gmail** while one is running → rejected with a clear message (and the UI offers to follow the running scan).
   In DevTools, fire the same `step` request twice at once → one returns `409 {busy: true}`; counts stay correct.
6. Start a "Last 7 days" scan and click **Cancel** → `scans.status = 'cancelled'`.
7. SQL: `select max(length(snippet)) from email_events;` → around 200 or less. Commit.
