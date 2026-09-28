# Phase 06: Extraction

Prerequisite: previous phase verified and committed.

## Prompt

```
Execute Phase 6, the most important phase. Build src/lib/extract per A7 as pure functions:
classify (weighted scoring + event type priority), ATS parsers (greenhouse, lever, workday, ashby, assessment platforms),
company extraction + normalization + alias map, role extraction returning undefined when unsure, recruiter detection,
reqId extraction. Every rule appends to reasons[].
Create ≥25 anonymized fixtures covering every event type, every listed ATS, third-party assessments, agency/gmail recruiters,
LinkedIn job ALERTS and newsletters (must be isJobRelated=false), and emails with no role (role must be undefined).
Write table-driven Vitest tests; all pass.
Extend /debug with "Classify preview": fetch the range and show subject | from | jobRelated | eventType | company | role |
confidence | reasons. Nothing is stored.
```

## Definition of done

- [ ] `tests/fixtures/` has ≥ 25 anonymized fixtures covering all 9 event types, each listed ATS (Greenhouse, Lever, Workday, Ashby) and assessment platforms, agency and gmail.com recruiters, LinkedIn/Indeed job alerts and newsletters (`isJobRelated = false`), and role-less emails (`role === undefined`).
- [ ] Table-driven Vitest tests over those fixtures all pass.
- [ ] `src/lib/extract/` imports nothing from Supabase, Next.js, or `fetch`; all thresholds and lists come from `src/lib/config.ts`.
- [ ] Every `ExtractionResult` has a non-empty `reasons[]` explaining the classification and each extracted field.
- [ ] `/debug` **Classify preview** shows subject | from | jobRelated | eventType | company | role | confidence | reasons and stores nothing.

## Manual verification

1. `npm test` → all extraction tests pass; count the fixtures: `ls tests/fixtures | wc -l` → ≥ 25.
2. `grep -rnE "supabase|from \"next|fetch\(" src/lib/extract` → no output.
3. `grep -rniE "disha|@gmail.com" tests/fixtures` → only obviously fake names/addresses.
4. Open http://localhost:3000/debug, choose "Last 1 month", run **Classify preview**.
5. Spot-check 20 rows against your real inbox: job alerts and newsletters must be `false`; roles you can't see in the email must show as Unknown, not a guess.
6. Write down any misclassifications; they become new fixtures before Phase 7. Commit.
