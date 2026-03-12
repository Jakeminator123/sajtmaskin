# 13) Next + Vercel Build Plan - UI Performance

## Goal

Improve Phase 3 client-side rendering performance by applying targeted UI
rendering optimizations in shared components while preserving existing API
surface and behavior.

## Scope

- Add this Phase 3 implementation plan artifact under `docs/plans/active/`.
- Update `src/components/ui/spinner.tsx` to animate a wrapper element instead of
  the SVG icon directly.
- Update `src/components/ai-elements/message.tsx` with safe per-row
  `content-visibility` optimization for long message lists.
- Update `src/components/landing-v2/animated-logo.tsx` so boost particles use
  stable precomputed visuals instead of render-time `Math.random()`.
- Do not modify unrelated files.

## Steps

1. Create this plan file with completion tracking.
2. Refactor spinner rendering so `animate-spin` is applied to a wrapper element
   while preserving icon props and accessibility labeling.
3. Add default `contentVisibility` and `containIntrinsicSize` styles on each
   `Message` row, merged safely with caller-provided inline styles.
4. Replace boost particle random style generation with a module-level
   precomputed particle configuration.
5. Run `npm run typecheck` and record pass/fail.

## Acceptance Checklist

- [x] `docs/plans/active/13-next-vercel-build-plan-ui-performance.md` exists.
- [x] `src/components/ui/spinner.tsx` animates a wrapper element, not the SVG.
- [x] `src/components/ai-elements/message.tsx` applies safe per-row
      `content-visibility` optimization without API changes.
- [x] `src/components/landing-v2/animated-logo.tsx` uses stable precomputed
      boost particle values (no render-time randomness for particle styling).
- [x] No unrelated files modified as part of this phase.
- [x] `npm run typecheck` executed and status reported.

## Implementation Status

- Status: Completed
- Phase: 3 (UI Rendering Performance Improvements)
- Completed scope:
  - Plan document created.
  - Spinner animation moved to wrapper element for better SVG animation
    rendering behavior.
  - Message rows updated with `content-visibility` optimization defaults for
    long-list rendering.
  - Animated logo boost particles switched to stable precomputed visual values.
