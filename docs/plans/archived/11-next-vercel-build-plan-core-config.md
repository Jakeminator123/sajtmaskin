# 11) Next + Vercel Build Plan - Core Config

## Goal

Improve Phase 1 build baseline by enabling a core Next.js config optimization
that reduces unnecessary client bundle cost from icon imports.

## Scope

- Add `experimental.optimizePackageImports` in `next.config.ts`.
- Target package: `lucide-react`.
- Keep changes limited to core config and this plan artifact only.

## Steps

1. Review current `next.config.ts` and confirm no existing
   `optimizePackageImports` entry.
2. Add `experimental.optimizePackageImports: ["lucide-react"]`.
3. Add this plan file under `docs/plans/active/`.
4. Run a quick verification command to confirm no immediate config/type issues.

## Acceptance Checklist

- [x] `docs/plans/active/11-next-vercel-build-plan-core-config.md` exists.
- [x] `next.config.ts` includes
      `experimental.optimizePackageImports` with `lucide-react`.
- [x] No unrelated files modified as part of this phase.
- [x] Verification command executed and status reported.

## Implementation Status

- Status: Completed
- Phase: 1 (Core Config Improvements)
- Completed scope:
  - Plan document created.
  - Next.js experimental package import optimization enabled for
    `lucide-react`.
