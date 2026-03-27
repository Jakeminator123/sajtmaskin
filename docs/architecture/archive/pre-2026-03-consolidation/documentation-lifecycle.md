# Documentation Lifecycle

**Navigation hub:** [`docs/README.md`](../../../README.md) (terminology layers, env table, key links).

This document defines how planning docs, schema notes, and handoff material
should be routed in this repository so they do not pile up as one flat archive.

## Status model

Use these three states consistently:

| Status | Meaning | Canonical location |
|------|---------|--------------------|
| `active` | Current, execution-ready material that should guide work now | `docs/plans/active/` |
| `review-needed` | Older, partial, uncertain, or stale material that must be truth-checked before reuse | `docs/plans/review-needed/` |
| `avklarat` (även kallat *archived*) | Avklarade, ersatta eller rent historiska planer | `docs/plans/avklarat/` |

## Directory rules

| Area | What belongs here | What does not |
|------|-------------------|---------------|
| `docs/architecture/` | Canonical overviews, lifecycle policy, structural decisions, agent handoff docs | Temporary scratch notes or stale plans |
| `docs/schemas/` | Stable human-readable schema docs backed by runtime code | Draft or uncertain schema proposals |
| `docs/architecture/engine-status.md` | Own engine status, model tiers, scaffold system, generation capabilities | Temporary scratch notes or stale plans |
| `docs/plans/active/` | Plans that are still supposed to drive implementation | Completed or doubtful plans |
| `docs/plans/review-needed/` | Older plans that need a reality check | Canonical architecture docs |
| `docs/old/` | **Stub only** — pekar till arkiv; historiskt material ligger i `docs/plans/avklarat/2026-03-docs-old-archive/` | Nytt arbetsmaterial |

## Plan workflow

1. Create new execution plans in `docs/plans/active/`.
2. If implementation drifts, gets blocked, or becomes uncertain, move the plan to
   `docs/plans/review-needed/`.
3. When the work is completed or the plan is superseded, move it to
   `docs/plans/avklarat/`.
4. Update `docs/plans/README.md` and
   `docs/architecture/agent-roadmap-and-handoff.md` whenever a plan changes
   state.

## Current classification

Do **not** duplicate the plan inventory here — it goes stale quickly. Use:

- `docs/plans/README.md` — bucket list and short status map (authoritative file list)
- `docs/architecture/agent-roadmap-and-handoff.md` — read order, working rules, and narrative (not a duplicate plan table)

## Schema rule

`docs/schemas/` should contain only canonical, reasonably stable schema docs.

If a schema note is exploratory, partially true, or comparing alternatives:

- put exploratory notes under **`docs/plans/review-needed/`** or a short-lived branch folder; when superseded, move to **`docs/plans/avklarat/`** (or the historical bundle [`2026-03-docs-old-archive/`](../../../plans/avklarat/2026-03-docs-old-archive/) for the same role the old `docs/old/` tree served)
- put historical or superseded schema material next to other avklarat notes, or under **`docs/plans/avklarat/2026-03-docs-old-archive/schemas/`** if it matches that archive’s purpose

## Update checklist

When making a large structural or documentation change:

1. Update the canonical doc in `docs/architecture/` instead of creating a
   parallel note.
2. Update the relevant README or index in the same turn.
3. Make the lifecycle status explicit if the document is a plan.
4. Avoid leaving root-level notes whose status is unclear.
