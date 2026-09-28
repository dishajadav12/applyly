# Phase 05: Gmail client

Prerequisite: previous phase verified and committed.

## Prompt

```
Execute Phase 5. Implement src/lib/gmail/{client,query,mime}.ts per A6:
- client: fetch wrapper with bearer token, one retry on 401 after refresh, exponential backoff on 429/5xx, concurrency pool helper.
- query: buildQueries(rangeStart, rangeEnd) → Q1..Q3 with epoch-second filters and exclusions; listMessageIds with pagination.
- mime: decode base64url, walk multipart, prefer text/plain else html-to-text, strip quoted replies, truncate 15KB,
  return ParsedMessage {messageId, threadId, rfc822MessageId, receivedAt, from, fromName, replyTo, subject, snippet, text, headers}.
- links: gmailMessageUrl(googleEmail, rfc822MessageId, messageId) per D16.
Unit-test mime, query, and links. Add dev-only /debug page with range picker and "Dry run" showing unique ID counts per
query and combined, plus the top 20 sender domains per query (fetched with format=metadata) so Q2 can be tuned.
```

## Definition of done

- [ ] `buildQueries(rangeStart, rangeEnd)` returns Q1–Q3 exactly as in A6, each with `after:<epochSec> before:<epochSec> -in:chats -in:spam -in:trash`; covered by unit tests.
- [ ] `listMessageIds` paginates with `nextPageToken` and `maxResults=500`; the client retries once on 401 after refreshing, backs off exponentially on 429/5xx, and the pool caps concurrency (tested with mocked fetch).
- [ ] `mime` decodes base64url, walks nested multipart, prefers `text/plain`, falls back to html-to-text, strips quoted replies, truncates to 15 KB, never fetches attachments, and returns the full `ParsedMessage` shape; covered by fixture-based tests.
- [ ] `ParsedMessage` includes `rfc822MessageId`; `gmailMessageUrl` builds the D16 `#search/rfc822msgid:` link (URL-encoded) with the `#all/` fallback; tested.
- [ ] `/debug` (dev only) has a range picker and **Dry run** that shows unique ID counts per query and combined plus the top 20 sender domains per query, and writes nothing to the database.

## Manual verification

1. `npm test` → mime and query tests pass.
2. Open http://localhost:3000/debug, pick "Last 7 days", click **Dry run** → three per-query counts plus a combined count ≤ their sum.
3. Copy the Q1 string the page shows (or from the code) into Gmail's web search box with the same dates → roughly the same number of results.
4. Repeat for "Since May 1, 2026" and note the combined count (this is your first-scan size). Target: low thousands.
5. Look at Q2's top sender domains. Any obvious newsletter/marketing sender → ask Claude to add it to `Q2_EXCLUDED_SENDERS` in `config.ts` and rerun.
6. Supabase Table Editor → no new rows in any table.
7. `npm run typecheck && npm run lint` → green. Commit.
