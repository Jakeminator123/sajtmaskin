# Plans

This area now uses explicit lifecycle buckets instead of treating every plan as
equally current.

## Buckets

- `active/`
  Execution-ready plans that should still steer implementation.
- `review-needed/`
  Older or partial plans that may still contain value, but need a reality check
  before reuse.
- `archived/`
  Completed or superseded plans kept only for traceability.

## Transitional note

The active numbered plans still physically live in `docs/plans/` root while the
folder structure is being normalized. Until they are moved, treat
`docs/architecture/agent-roadmap-and-handoff.md` as the canonical status map.

## Current status map

`active`

- `06-world-class-builder-roadmap.md`
- `07-world-class-builder-phase-1-trust-launch.md`
- `08-world-class-builder-phase-2-site-planning.md`
- `09-world-class-builder-phase-3-smb-growth.md`
- `10-world-class-builder-phase-4-learning-moat.md`

`review-needed`

- no numbered plans currently sit in this bucket

`archived`

- `archived/01-design-system-registry.md`
- `archived/02-custom-domain-self-service.md`
- `archived/03-v0-env-vars-proper-sdk.md`
- `archived/04-deploy-sse-webhooks.md`
- `archived/05-template-search-ui.md`
- `archived/11-next-vercel-build-plan-core-config.md`
- `archived/12-next-vercel-build-plan-server-routes.md`
- `archived/13-next-vercel-build-plan-ui-performance.md`

These are planning artifacts, not runtime documentation. New plan files should
be created in `docs/plans/active/`, not in this root folder.
