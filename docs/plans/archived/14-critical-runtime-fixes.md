# Plan 14: Critical Runtime Fixes

**Status: COMPLETED (2026-03-17)**

## Goal
Fix the highest-risk runtime bugs and configuration drift identified in the
March 2026 deep-research audit (`docs/analyses/2026-03-deep-research-buggar-overlapp.md`).

These are production-safety issues that can cause economic leaks, false alarms,
or undefined abort behavior.

## Source

All items trace back to the external code audit. Current verification
(2026-03-17) confirms each issue is still present.

## Workstreams

### 1. Harmonize ENGINE_MAX_OUTPUT_TOKENS default
Current issue:
- `src/lib/gen/defaults.ts` defaults to **262 144**
- `ENV.md` documents **32 768**
- No tier-based cap exists; every generation can request the full budget

Implementation direction:
- Lower code default to match ENV.md (32 768)
- Introduce tier-based caps so fast/pro/max tiers get different budgets
- Add telemetry log line for effective maxOutputTokens per generation
- Update ENV.md if the final default differs from 32 768
- Snapshot test on `defaults.ts` to catch unintentional drift

Primary code:
- `src/lib/gen/defaults.ts` (line 19-25)
- `src/lib/gen/engine.ts` (streamText call)
- `ENV.md`

### 2. Fix plan-mode credit commit in create-stream
Current issue:
- `/api/v0/chats/stream/route.ts` plan-mode path returns stream without
  calling `commitCreditsOnce()`
- Follow-up plan-mode in `[chatId]/stream` already commits correctly

Implementation direction:
- Add `await commitCreditsOnce()` in the plan-mode branch of create-stream
  before `controller.close()`
- Add route test: mock `prepareCredits` and verify `commit` is called in
  plan-mode path

Primary code:
- `src/app/api/v0/chats/stream/route.ts` (lines 329-428)

### 3. Condition DATA_DIR warning on storage backend
Current issue:
- `src/lib/config.ts` logs "CRITICAL: DATA_DIR not set in production!" for
  all production environments, including Vercel where DATA_DIR is irrelevant

Implementation direction:
- Gate the warning on `IS_RENDER` or a storage-backend check
- Add unit test: in "production + non-Render" mode, no CRITICAL log

Primary code:
- `src/lib/config.ts` (lines 115-122)

### 4. Add Vercel supportsCancellation
Current issue:
- Stream routes set `maxDuration = 800` but `vercel.json` has no
  `supportsCancellation`, so cleanup on client abort is not guaranteed

Implementation direction:
- Add `supportsCancellation: true` for stream route paths in `vercel.json`
- Verify that ReadableStream cancel() handlers in stream routes run correctly
  under Vercel abort conditions
- Test with a short-lived client connection

Primary code:
- `vercel.json`
- Stream route cancel() handlers

## Acceptance criteria

- ENGINE_MAX_OUTPUT_TOKENS default matches documentation and has tier caps
- Plan-mode always commits credits on both create and follow-up streams
- DATA_DIR warning only fires when file-based storage is expected
- Vercel abort/cancellation is explicitly opted in

## Recommended build order

1. Fix credit commit (smallest, highest economic risk)
2. Harmonize token defaults (config + code + docs)
3. Condition DATA_DIR warning
4. Add supportsCancellation
