# Follow-up route plan pass

## Plan

1. Repro and isolate the route-escalation path (`2 -> 6 -> 7 -> 8`) in follow-up orchestration.
2. Add a minimal guard that prevents unrequested route growth on follow-ups.
3. Keep explicit page additions possible when the user clearly asks for them.
4. Add regression tests for follow-up freeze/clamp behavior.
5. Avoid broad refactors outside route-plan + orchestration prompt inputs.

## Root cause (confirmed)

- Follow-up orchestration used `optimizedMessage` for route planning and BuildSpec inference.
- `optimizedMessage` includes continuity + file-context summary from previous files, which can contain many route-like keywords and paths.
- Route inference (`buildRoutePlan`) then sees extra route signals not present in the user’s actual follow-up request.
- Scaffold defaults could also add pages again, amplifying drift over repeated follow-ups.

## Implemented fix (minimal)

- Added follow-up route freeze support in `buildRoutePlan`:
  - new params: `generationMode`, `existingRoutePaths`
  - in follow-up mode with known existing routes: preserve existing route set as baseline
  - do **not** inject scaffold default routes in this mode
  - still allow explicit new routes when current user message clearly asks for them
- Added orchestration prompt split in `resolveOrchestrationBase`:
  - `routePlanPrompt` (for route inference)
  - `buildSpecPrompt` (for BuildSpec classification)
  - defaults still fall back to `prompt` for compatibility
- Follow-up API path now sends:
  - `routePlanPrompt: message` (raw user follow-up)
  - `buildSpecPrompt: message`
  - `existingRoutePaths` extracted from previous version files

## Why this addresses the reported problems

- Stops accidental route growth caused by context-rich follow-up prompt wrappers.
- Reduces route-driven BuildSpec inflation (fewer false multi-page signals from context wrappers).
- Keeps user-intended page additions possible (explicit prompt keywords still work).

## Tests added

- `route-plan.test.ts`:
  - follow-up keeps existing routes and ignores scaffold defaults by default
  - follow-up can still add explicitly requested new routes

## Remaining risks / next step

- This pass does not redesign global prompt strategy or max-output-token policies.
- If needed, next pass can add explicit “route removal intent” handling (today we preserve by default in follow-up mode).
