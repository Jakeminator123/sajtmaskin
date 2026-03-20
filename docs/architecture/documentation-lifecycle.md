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

- `active`: `docs/plans/active/17-repo-separation-and-independence.md`
- `review-needed`: no current numbered or dated plan sits in this bucket
- `archived`: see `docs/plans/archived/` and `docs/plans/README.md` for the current archived set

## Schema rule

`docs/schemas/` should contain only canonical, reasonably stable schema docs.

If a schema note is exploratory, partially true, or comparing alternatives:

- put it in `docs/analyses/` if it is still active thinking
- put it in `docs/old/schemas/` if it is historical or superseded

## Update checklist

When making a large structural or documentation change:

1. Update the canonical doc in `docs/architecture/` instead of creating a
   parallel note.
2. If the change affects vocabulary or parallel-agent coordination, update
   `docs/architecture/structure-and-terminology.md`.
3. Update the relevant README or index in the same turn.
4. Make the lifecycle status explicit if the document is a plan.
5. Avoid leaving root-level notes whose status is unclear.

## Final sweep rule

When a workstream closes with a final sweep:

1. Re-check relevant canonical docs even if they were not directly edited during the run.
2. Include the nearest useful `README.md` files and schema docs for the changed area.
3. Prefer compact reality-sync fixes over adding new prose.
4. If the drift is broad or uncertain, note it as follow-up instead of guessing.
