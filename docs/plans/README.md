# Plans

This area uses explicit lifecycle buckets instead of treating every plan as
equally current.

## Buckets

- `active/`
  Execution-ready plans that should still steer implementation.
- `review-needed/`
  Older or partial plans that may still contain value, but need a reality check
  before reuse.
- `archived/`
  Completed or superseded plans kept only for traceability.

## Current status map

Verified `2026-03-17`.

`active`

- `active/06-world-class-builder-roadmap.md` — master roadmap (phases 1-4)
- `active/09-world-class-builder-phase-3-smb-growth.md` — ~60% done, deep in
  implementation
- `active/10-world-class-builder-phase-4-learning-moat.md` — ~15% done
- `active/14-critical-runtime-fixes.md` — token budgets, credit commit,
  config drift, Vercel cancellation
- `active/15-builder-robustness.md` — builder entry edge case, clarification
  persistence
- `active/16-provider-adapter-architecture.md` — own-engine / v0 separation

Plans 14-16 originate from the external deep-research audit
(`docs/analyses/2026-03-deep-research-buggar-overlapp.md`).

`review-needed`

- None currently.

`archived`

- `archived/01-design-system-registry.md`
- `archived/02-custom-domain-self-service.md`
- `archived/03-v0-env-vars-proper-sdk.md`
- `archived/04-deploy-sse-webhooks.md`
- `archived/05-template-search-ui.md`
- `archived/07-world-class-builder-phase-1-trust-launch.md`
- `archived/08-world-class-builder-phase-2-site-planning.md`
- `archived/11-next-vercel-build-plan-core-config.md`
- `archived/12-next-vercel-build-plan-server-routes.md`
- `archived/13-next-vercel-build-plan-ui-performance.md`
- `archived/2026-03-bug-recheck-sweep.md`
- `archived/2026-03-openclaw-rollout-roadmap.md`
- `archived/world-class-commit-selection-report.md` — recovery artifact
- `archived/world-class-branch-map-2026-03-13-to-now.md` — recovery artifact

These are planning artifacts, not runtime documentation. New plan files should
be created in `docs/plans/active/`, not in this root folder.
