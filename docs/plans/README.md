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

Verified `2026-03-18` (post orchestrator runs).

`active`

- `active/06-world-class-builder-roadmap.md` — master roadmap (phases 1-4)
- `active/10-world-class-builder-phase-4-learning-moat.md` — ~90% done (all 6 workstreams delivered, remaining: production QA)

`review-needed`

- None currently.

`archived`

- `archived/01-design-system-registry.md` — **COMPLETED 2026-03-03**
- `archived/02-custom-domain-self-service.md` — **COMPLETED 2026-03-03**
- `archived/03-v0-env-vars-proper-sdk.md` — **COMPLETED 2026-03-03**
- `archived/04-deploy-sse-webhooks.md` — **COMPLETED 2026-03-03**
- `archived/05-template-search-ui.md` — **COMPLETED 2026-03-03**
- `archived/07-world-class-builder-phase-1-trust-launch.md` — completed
- `archived/08-world-class-builder-phase-2-site-planning.md` — completed
- `archived/11-next-vercel-build-plan-core-config.md` — completed
- `archived/12-next-vercel-build-plan-server-routes.md` — completed
- `archived/13-next-vercel-build-plan-ui-performance.md` — completed
- `archived/14-critical-runtime-fixes.md` — **COMPLETED 2026-03-17**
- `archived/15-builder-robustness.md` — **COMPLETED 2026-03-17**
- `archived/09-world-class-builder-phase-3-smb-growth.md` — **COMPLETED 2026-03-18**
- `archived/16-provider-adapter-architecture.md` — **COMPLETED 2026-03-17**
- `archived/2026-03-bug-recheck-sweep.md` — completed
- `archived/2026-03-openclaw-rollout-roadmap.md` — completed
- `archived/world-class-commit-selection-report.md` — recovery artifact
- `archived/world-class-branch-map-2026-03-13-to-now.md` — recovery artifact

Plans 14-16 originated from the external deep-research audit
(`docs/analyses/2026-03-deep-research-buggar-overlapp.md`).

These are planning artifacts, not runtime documentation. New plan files should
be created in `docs/plans/active/`, not in this root folder.
