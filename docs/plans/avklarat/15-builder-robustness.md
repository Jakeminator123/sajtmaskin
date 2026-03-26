# Plan 15: Builder Robustness

**Status: COMPLETED (2026-03-17)**

## Goal
Close the remaining edge cases in the builder entry flow and follow-up
clarification handling identified in the deep-research audit.

These are not crashes, but they leave users in broken or confusing states.

## Source

Items trace to `docs/plans/avklarat/2026-03-docs-old-archive/analyses/2026-03-deep-research-buggar-overlapp.md`.
Verified 2026-03-17: both issues are still present or only partially fixed.

## Workstreams

### 1. Robust builder entry without initial data
Current issue:
- `useBuilderPageController.ts` auto-creates a project when no query params
  exist, but failure only logs a `console.warn` and resets a ref
- No auth modal, retry UI, or user-facing error
- The user can end up in a state where generation fails because
  `appProjectId` is missing

Implementation direction:
- On auto-create failure with 401/403: set `authModalReason` and show the
  auth modal
- On other failures: show a toast or inline error with a retry CTA
- Consider server-side fallback: if `appProjectId` is missing in
  create-stream, return a clear 400 with actionable message instead of
  failing downstream

Primary code:
- `src/app/builder/useBuilderPageController.ts` (lines 499-531)
- `src/app/api/v0/chats/stream/route.ts` (project validation)

### 2. Persist follow-up clarification messages
Current issue:
- In `[chatId]/stream/route.ts`, the `ambiguous-redesign` and
  `ambiguous-followup` paths return `buildAwaitingClarificationStream()`
  immediately without persisting the user message or assistant clarification
- This means reloading the builder loses the question
- Contract clarification and plan-mode paths already persist correctly

Implementation direction:
- Before calling `buildAwaitingClarificationStream()` in ambiguous paths:
  1. Persist the user message via `chatRepo.addMessage()`
  2. Persist the assistant clarification question with its `uiParts`
- Verify that chat reload restores the awaiting-input state
- Add a route test that confirms messages are persisted before the
  awaitingInput stream is returned

Primary code:
- `src/app/api/v0/chats/[chatId]/stream/route.ts` (lines 328-373)
- `src/lib/db/chat-repository-pg.ts`

## Acceptance criteria

- Opening `/builder` without params and failing to create a project shows a
  clear user-facing error or auth prompt
- Reloading the builder during an awaiting-input clarification restores the
  question and options
- No follow-up path sends `awaitingInput: true` without persisting first

## Recommended build order

1. Fix clarification persistence (clear scope, one route)
2. Harden builder entry (UI + API changes)

