# Phase 12: Optional AI fallback (later)

Prerequisite: previous phase verified and committed.

## Prompt

```
Execute Phase 12 (optional). Add an AI fallback only for events with low confidence or missing company/role, off by default,
behind a settings toggle. Provider interface with two implementations: (a) Google Gemini API free tier, (b) local Ollama for dev.
Send only subject, sender, and the first 2KB of text; require strict JSON {company, role, eventType}, validate with zod, never
override a higher-confidence rule result, and record "ai:<provider>" in reasons[]. Document exactly what is sent in README.
```

## Definition of done

- [ ] The AI fallback is off by default and toggled in settings; with it off, no requests go to any AI provider.
- [ ] It runs only for events with low confidence or missing company/role, and a unit test asserts the payload contains only subject, sender, and the first 2 KB of text.
- [ ] Responses are validated with zod as strict `{company, role, eventType}`; invalid output is ignored, and a result never overrides a higher-confidence rule result.
- [ ] AI-sourced fields add `ai:<provider>` to `reasons[]`; both Gemini and Ollama providers implement the same interface.
- [ ] `README.md` documents exactly what is sent and to whom.

## Manual verification

1. With the toggle off, run a scan with DevTools/terminal logs open → no calls to Gemini or Ollama.
2. Start Ollama locally, enable the toggle with the Ollama provider, run `/debug` Classify preview → low-confidence rows show `ai:ollama` in reasons.
3. Check that no rule-based high-confidence row changed.
4. `npm test` → payload-size and override tests pass. Commit.
