# Phase 09: Dashboard table

Prerequisite: previous phase verified and committed.

## Prompt

```
Execute Phase 9. Build the application table per A9 with server-fetched data plus client-side sort/filter:
columns, inferred "~" dates with tooltip, colored status badges, mailto recruiter, sort by Applied/Company/Status,
search (company or role), status chips with counts, needs-review dot. Empty states: never scanned (big CTA), no filter
results. Loading skeletons. Polish to a clean SaaS look (sticky header, hover rows, consistent spacing).
Refresh the table after each scan step.
```

## Definition of done

- [ ] The table shows Company, Role, Applied, Status, Recruiter; inferred dates show a leading "~" with a tooltip; status is a colored badge; recruiter is a `mailto:` link; `needs_review` rows show a dot.
- [ ] Sorting works on Applied, Company, and Status; one search box filters by company or role; status chips show counts that match the rows.
- [ ] Empty states exist for "never scanned" (big CTA "Scan since May 1, 2026") and "no results for this filter"; loading skeletons render while data loads.
- [ ] The table refreshes after each scan step, so rows appear during a scan.

## Manual verification

1. Open `/dashboard` → table populated from your Phase 8 scan.
2. Click the Applied, Company, and Status headers → sort order flips each time.
3. Type part of a company name, then part of a role, into search → rows filter correctly.
4. Add up the status chip counts → equals total rows; click a chip → only that status shows.
5. Hover an Applied date starting with "~" → tooltip explains it is inferred.
6. Search for `zzzz` → "no results" state. (Optional: sign in with a second Google test user to see the never-scanned state.)
7. Run a "Last 7 days" scan and watch rows update live. Commit.
