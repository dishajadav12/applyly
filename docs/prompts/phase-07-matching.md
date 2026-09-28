# Phase 07: Matching

Prerequisite: previous phase verified and committed.

## Prompt

```
Execute Phase 7. Build src/lib/match per A8: normalize, similarity (token-based with noise words), matcher (rules
M1–M8 incl. M3b, returns {action, applicationId?, matchConfidence, reason}), derive (applied_at + source, role, status rank
rules, recruiters, primary recruiter, thread_ids, req_ids; respects overrides).
Implement M4b and the stage-event status rules exactly as in A8; user_locked events skip the matcher.
Tests must include: Example Corp May15 confirmation / Jun20 assessment / Jul3 interview → 1 application, Interviewing,
applied May 15 explicit; Google with 3 different roles → 3 applications; role-less rejection with 1 company app → attach;
with 2 apps → review; HackerRank email naming the company → attach; rejection processed before confirmation → still 1
application with correct role via M3b and explicit applied date; recruiter after interview doesn't downgrade; overridden
status unchanged; reversed input order gives identical derived output; a confirmation dated after a rejection keeps
the app Rejected; an interview invite after a rejection reopens it (Interviewing); role-less rejection for a company
whose only app is Rejected → attach (M4b); role-less assessment for that company → review (M5).
```

## Definition of done

- [ ] `src/lib/match/` implements normalize, similarity (token-based, ignores noise words), matcher (M1–M8 incl. M3b returning `{action, applicationId?, matchConfidence, reason}`), and derive; it is pure (no Supabase/Next/fetch imports).
- [ ] Every scenario named in the prompt has its own test and passes: Example Corp 3-email lifecycle → 1 app, Interviewing, applied May 15 explicit; Google 3 roles → 3 apps; role-less rejection with 1 app → attach, with 2 apps → review; HackerRank naming the company → attach; rejection-before-confirmation → 1 app via M3b with explicit date; recruiter after interview doesn't downgrade; overridden status unchanged.
- [ ] Status tests: a confirmation dated after a rejection stays Rejected; an interview invite after a rejection reopens it; M4b attaches a role-less rejection to a closed app, and a role-less assessment for that company goes to review.
- [ ] A test proves reversed (and shuffled) input order produces identical derived output.
- [ ] `derive` never writes a field present in `overrides`.

## Manual verification

1. `npm test -- match` → all matching tests pass.
2. `npx vitest list tests` (or open the test file) → confirm a named test exists for each scenario in the prompt.
3. `grep -rnE "supabase|from \"next|fetch\(" src/lib/match` → no output.
4. `npm run typecheck && npm run lint && npm test` → green. Commit.
