# Phase 10: Detail, edit & review

Prerequisite: previous phase verified and committed.

## Prompt

```
Execute Phase 10 per A9: detail Sheet with editable fields (server actions, set overrides, "reset to auto" per field),
timeline with Open in Gmail links (src/lib/gmail/links.ts), recruiters list, Delete (delete_application RPC: events →
review), Merge into (searchable picker; move events, re-derive target, delete source), Move single event. Review dialog +
banner: assign to existing, create new, or dismiss (state=dismissed). Every assign/move/merge/dismiss/delete sets
user_locked=true per D15. All mutations re-derive affected applications.
Verify: edit a status, rescan, and the edit survives; merge works; a dismissed email is not re-added; a moved event stays
moved after "Re-process all".
```

## Definition of done

- [ ] Clicking a row opens a Sheet with editable company, role, applied date, status, and recruiter email; each edit sets its override and shows "reset to auto", which clears it and re-derives.
- [ ] The timeline lists every linked event (date, label, subject) with a working **Open in Gmail** link (D16 `rfc822msgid:` format), plus the recruiter list.
- [ ] Delete moves the app's events to review; Merge into moves events, re-derives the target, and deletes the source; Move event reassigns a single event and re-derives both apps.
- [ ] The review banner and dialog support assign-to-existing, create-new, and dismiss (`state = 'dismissed'`); dismissed emails are never re-added by rescans.
- [ ] Every assign/move/merge/dismiss/delete sets `user_locked = true`, and every mutation re-derives the affected applications.

## Manual verification

1. Open any application, change Status manually → badge updates. Run a "Last 7 days" scan → the edited status is unchanged.
2. Click "reset to auto" → status returns to the derived value.
3. Click **Open in Gmail** on a timeline item → the correct email opens in the correct Gmail account.
4. Pick two applications for the same company → **Merge into…** → one row remains, with both timelines combined.
5. Open the review banner → dismiss one email → rescan its date range → it does not come back.
6. Delete an application → its emails appear in the review dialog.
7. **Move event** one email to another application → avatar menu → **Re-process all** → the email is still on the application you moved it to. Commit.
