# Documentation Lifecycle

This document defines how planning docs, schema notes, and handoff material
should be routed in this repository so they do not pile up as one flat archive.

## Status model

Use these three states consistently:

| Status | Meaning | Canonical location |
|------|---------|--------------------|
| `active` | Current, execution-ready material that should guide work now | `docs/plans/active/` |
| `review-needed` | Older, partial, uncertain, or stale material that must be truth-checked before reuse | `docs/plans/review-needed/` |
| `archived` | Completed, superseded, or purely historical material | `docs/plans/archived/` |

## Directory rules

| Area | What belongs here | What does not |
|------|-------------------|---------------|
| `docs/architecture/` | Canonical overviews, lifecycle policy, structural decisions, agent handoff docs | Temporary scratch notes or stale plans |
| `docs/schemas/` | Stable human-readable schema docs backed by runtime code | Draft or uncertain schema proposals |
| `docs/architecture/engine-status.md` | Own engine status, model tiers, scaffold system, generation capabilities | Temporary scratch notes or stale plans |
| `docs/plans/active/` | Plans that are still supposed to drive implementation | Completed or doubtful plans |
| `docs/plans/review-needed/` | Older plans that need a reality check | Canonical architecture docs |
| `docs/old/` | Archived historical material outside the plan lifecycle buckets | Active guidance |

## Plan workflow

1. Create new execution plans in `docs/plans/active/`.
2. If implementation drifts, gets blocked, or becomes uncertain, move the plan to
   `docs/plans/review-needed/`.
3. When the work is completed or the plan is superseded, move it to
   `docs/plans/archived/`.
4. Update `docs/plans/README.md` and
   `docs/architecture/agent-roadmap-and-handoff.md` whenever a plan changes
   state.

## Current classification

- `active`: `docs/plans/active/06-world-class-builder-roadmap.md`, `docs/plans/active/09-world-class-builder-phase-3-smb-growth.md`, and `docs/plans/active/10-world-class-builder-phase-4-learning-moat.md`
- `review-needed`: no current numbered or dated plan sits in this bucket
- `archived`: `docs/plans/archived/01-design-system-registry.md` through `docs/plans/archived/05-template-search-ui.md`, `docs/plans/archived/07-world-class-builder-phase-1-trust-launch.md`, `docs/plans/archived/08-world-class-builder-phase-2-site-planning.md`, `docs/plans/archived/11-next-vercel-build-plan-core-config.md` through `docs/plans/archived/13-next-vercel-build-plan-ui-performance.md`, plus `docs/plans/archived/2026-03-bug-recheck-sweep.md` and `docs/plans/archived/2026-03-openclaw-rollout-roadmap.md`

## Schema rule

`docs/schemas/` should contain only canonical, reasonably stable schema docs.

If a schema note is exploratory, partially true, or comparing alternatives:

- put it in `docs/analyses/` if it is still active thinking
- put it in `docs/old/schemas/` if it is historical or superseded

## Update checklist

When making a large structural or documentation change:

1. Update the canonical doc in `docs/architecture/` instead of creating a
   parallel note.
2. Update the relevant README or index in the same turn.
3. Make the lifecycle status explicit if the document is a plan.
4. Avoid leaving root-level notes whose status is unclear.
