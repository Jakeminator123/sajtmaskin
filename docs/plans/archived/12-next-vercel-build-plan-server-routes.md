# 12) Next + Vercel Build Plan - Server Routes

## Goal

Improve Phase 2 server/API performance by removing avoidable request blocking in
key route handlers while preserving existing behavior and response contracts.

## Scope

- Add this Phase 2 implementation plan artifact under `docs/plans/active/`.
- Remove async waterfall in `src/app/api/v0/deployments/route.ts` by
  parallelizing independent fetches after `engineVersion` is loaded.
- Make analytics pageview recording non-blocking in
  `src/app/api/analytics/route.ts` using Next.js `after()`.
- Keep error handling and response shape stable for existing callers.
- Do not modify unrelated files.

## Steps

1. Create this plan file with completion tracking.
2. In deployment POST flow (non-fallback path), keep `getVersionById` first, then
   run `getChat(engineVersion.chat_id)` and `getVersionFiles(versionId)` in
   parallel via `Promise.all`.
3. In analytics POST flow, keep request parsing and validation synchronous, return
   success promptly, and defer user lookup + pageview write in `after(async () => ...)`.
4. Preserve existing logging semantics as best effort for background analytics
   failures.
5. Run `npm run typecheck` and record pass/fail.

## Acceptance Checklist

- [x] `docs/plans/active/12-next-vercel-build-plan-server-routes.md` exists.
- [x] `src/app/api/v0/deployments/route.ts` parallelizes independent fetches with
      `Promise.all` after `engineVersion` is loaded.
- [x] `src/app/api/analytics/route.ts` uses `after()` for non-blocking pageview
      recording in POST.
- [x] Existing response shapes and validation behavior remain intact.
- [x] `npm run typecheck` executed and status reported.

## Implementation Status

- Status: Completed
- Phase: 2 (Server/API Performance Improvements)
- Completed scope:
  - Plan document created.
  - Deployment route async waterfall removed for independent fetches.
  - Analytics POST pageview write moved to non-blocking `after()` execution.
