# Agent Roadmap And Handoff

This file is the operational handoff index for plan artifacts. Use it when a new
agent needs to understand which plans are active, which ones need review, and
which ones are old references.

## Status legend

| Status | Meaning |
|------|---------|
| `active` | Current roadmap material that should still steer implementation |
| `review-needed` | Older or partial plan that may still contain value, but must be checked against current code first |
| `archived` | Completed or superseded plan kept only for traceability |

## Current numbered plan map

| Plan file | Status | Notes |
|------|--------|-------|
| `01-design-system-registry.md` | `review-needed` | Older tactical plan; parts of the design-system wiring exist, but this is not a trustworthy execution guide anymore |
| `02-custom-domain-self-service.md` | `review-needed` | Domain groundwork exists, but the plan needs a fresh end-to-end truth check before reuse |
| `03-v0-env-vars-proper-sdk.md` | `review-needed` | Partially implemented and partly overtaken by the broader own-engine env-var work |
| `04-deploy-sse-webhooks.md` | `review-needed` | Large parts appear implemented, but it should be verified before treating it as done |
| `05-template-search-ui.md` | `review-needed` | Search and embeddings groundwork exists, but the full UI plan is not a clean current roadmap |
| `06-world-class-builder-roadmap.md` | `active` | Strategic top-level roadmap |
| `07-world-class-builder-phase-1-trust-launch.md` | `active` | Phase 1 implementation scope |
| `08-world-class-builder-phase-2-site-planning.md` | `active` | Phase 2 planning layer scope |
| `09-world-class-builder-phase-3-smb-growth.md` | `active` | Phase 3 SMB product scope |
| `10-world-class-builder-phase-4-learning-moat.md` | `active` | Phase 4 differentiation and learning systems scope |

## Read order for a new agent

1. `docs/README.md`
2. `docs/architecture/structure-and-terminology.md`
3. `docs/architecture/documentation-lifecycle.md`
4. `docs/architecture/project-settings-and-builder-questions.md`
5. `docs/architecture/generation-loop-and-error-memory.md`
6. `docs/plans/README.md`
7. The relevant `active` plan files

## Working rule

When picking up old roadmap work:

- start from an `active` plan if one exists
- treat `review-needed` plans as historical hints, not instructions
- move fully completed or clearly superseded material to `docs/plans/archived/`
- update this file whenever a numbered plan changes status

## Migration note

The folder structure now reserves explicit buckets for `active`,
`review-needed`, and `archived` plan material. Some numbered plans still live in
`docs/plans/` root during migration, so this file is the canonical status map
until those files are physically moved.
