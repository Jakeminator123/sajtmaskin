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

Some numbered plans still physically live in `docs/plans/` root while the
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

- `01-design-system-registry.md`
- `02-custom-domain-self-service.md`
- `03-v0-env-vars-proper-sdk.md`
- `04-deploy-sse-webhooks.md`
- `05-template-search-ui.md`

These are planning artifacts, not runtime documentation. New plan files should
be created in `docs/plans/active/`, not in this root folder.
