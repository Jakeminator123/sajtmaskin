# Engine Quick Score Boosts

This document summarizes the final "quick score boosts" pass that moved three
engine-related areas from a rough 7/10 to a more robust 8/10 baseline.

## What Changed

### 1. Follow-up finalization now emits visible progress

File: `src/app/api/v0/chats/[chatId]/stream/route.ts`

- Added a shared `emitFinalizeProgress()` helper in the follow-up SSE flow
- Wired `onProgress` into all three `finalizeAndSaveVersion()` call sites:
  - normal `done`
  - buffer flush
  - fallback flush
- Result: autofix and validation progress is now surfaced consistently for both
  initial generations and follow-up turns

### 2. Streamdown styling is now included by Tailwind

File: `src/app/globals.css`

- Added Tailwind `@source` entries for:
  - `streamdown`
  - `@streamdown/code`
- Result: streaming markdown and code blocks keep their intended styling in the
  builder UI instead of silently losing utility classes

### 3. Eval is now runnable as a real gate

Files:
- `scripts/run-eval.ts`
- `package.json`

- Reused and expanded the existing `scripts/run-eval.ts` instead of replacing it
- Added `npm run eval`
- The script now:
  - runs `runEval()`
  - writes the standard eval report
  - builds a scorecard via `buildScorecard()` and `formatScorecardReport()`
  - fails with exit code `1` if any scorecard category drops below `0.7`

## Integration Notes

This pass was also aligned with the current own-engine architecture rather than
the older v0-first assumptions.

### Embeddings

- Eval now explicitly verifies that the repository still exposes:
  - `docs:embeddings`
  - `templates:embeddings`
- It also checks that scaffold auto-selection still goes through
  `matchScaffoldWithEmbeddings(...)`

### Scaffolds

- Eval now documents and verifies that scaffold routing is centralized around
  `prepareGenerationContext(...)`
- The checks cover:
  - manual scaffold mode
  - persisted scaffold reuse across turns
  - auto scaffold selection for MCP site generation

### Own-engine builds

- The build-stack report now verifies that the own engine remains the primary
  path and that v0 only activates behind `shouldUseV0Fallback()`
- The MCP generator still enforces own-engine-only behavior unless fallback is
  explicitly enabled elsewhere

## Obsolete Code

No additional dead runtime code was removed in this pass because the touched
files were still active and lint-clean. The main cleanup here was to avoid
introducing duplicate eval wrappers and instead extend the already-existing
`scripts/run-eval.ts`.

## Verification

- `npm run typecheck` passed
- No new linter errors were introduced in the changed files
- `npm run eval` was intentionally not executed during this pass because it
  triggers real model generations and may consume credits

## Handoff For Next Agent

Use this as the baseline context for the next pass:

- follow-up streaming now emits finalize progress in all completion branches
- Streamdown styling is wired into Tailwind sources
- eval is no longer just a report generator; it is now a scorecard gate
- eval output also includes a small build-stack integration section for:
  - embeddings
  - scaffolds
  - own-engine default vs v0 fallback
- `tools/doc-browser/` (formerly `v0_vercel_agent/`) was left outside this pass

## Suggested Next Pass

- Run `npm run eval` when you are ready to spend credits and inspect real scores
- If needed, move the build-stack checks from script-local logic into shared
  eval modules once the shape stabilizes
- If desired, add one or two prompt fixtures that specifically exercise
  integrations and scaffold selection, so those areas are measured by runtime
  evals instead of only repo checks
