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
| `01-design-system-registry.md` | `archived` | Legacy v0 registry-design-system plan; remaining ideas are optional follow-up, not current roadmap work |
| `02-custom-domain-self-service.md` | `archived` | Domain flow is largely implemented; any remaining domain readiness belongs under Phase 1 launch readiness |
| `03-v0-env-vars-proper-sdk.md` | `archived` | Env-var plan is implemented and overtaken; remaining work is maintenance plus Phase 1-3 hardening |
| `04-deploy-sse-webhooks.md` | `archived` | SSE/webhook architecture is implemented; remaining deployment-event access hardening is carried into Phase 1 |
| `05-template-search-ui.md` | `archived` | Template search UI is implemented; any future context-aware recommendations belong under Phase 2 planning/onboarding |
| `06-world-class-builder-roadmap.md` | `active` | Strategic top-level roadmap |
| `07-world-class-builder-phase-1-trust-launch.md` | `active` | Phase 1 implementation scope |
| `08-world-class-builder-phase-2-site-planning.md` | `active` | Phase 2 planning layer scope |
| `09-world-class-builder-phase-3-smb-growth.md` | `active` | Phase 3 SMB product scope |
| `10-world-class-builder-phase-4-learning-moat.md` | `active` | Phase 4 differentiation and learning systems scope |
| `11-next-vercel-build-plan-core-config.md` | `archived` | Completed phased optimization plan (core Next.js config) |
| `12-next-vercel-build-plan-server-routes.md` | `archived` | Completed phased optimization plan (server/API improvements) |
| `13-next-vercel-build-plan-ui-performance.md` | `archived` | Completed phased optimization plan (UI rendering improvements) |

## Current active-phase notes

- Phase `7` is complete enough to build on: lifecycle-aware readiness,
  diagnostics, preview labeling, and deploy gating are now part of the active
  builder path.
- Phase `8` now has a real planning/review surface in the own-engine path. The
  remaining completion gap is first-class server persistence of planner
  `uiParts` plus cleanup of the stale `usePlanExecution.ts` ownership model. See
  `docs/analyses/phase-08-plan-persistence-and-orchestration.md`.
- Phase `9` has started with SEO readiness, scaffold metadata defaults, and
  readiness surfacing, but editorial mode, analytics/conversion setup, SMB
  integration packs, and compare/restore are still ahead.

## Read order for a new agent

1. `docs/README.md`
2. `docs/architecture/structure-and-terminology.md`
3. `docs/architecture/documentation-lifecycle.md`
4. `docs/architecture/project-settings-and-builder-questions.md`
5. `docs/architecture/generation-loop-and-error-memory.md`
6. `docs/plans/README.md`
7. The relevant `active` plan files

## Legacy carryovers already absorbed

- Phase `1` should absorb remaining domain readiness, env-var readiness, and
  deployment-event hardening from legacy plans `02` to `04`
- Phase `2` can treat context-aware template recommendations as an optional
  planning/onboarding extension rather than a fresh template-search rebuild
- Phase `3` should start from the fact that generic pageview collection already
  exists
- Archived plans `11` through `13` provide useful performance groundwork, but
  do not change the `07` -> `08` -> `09` -> `10` execution order

## Working rule

When picking up old roadmap work:

- start from an `active` plan if one exists
- treat `review-needed` plans as historical hints, not instructions
- move fully completed or clearly superseded material to `docs/plans/archived/`
- update this file whenever a numbered plan changes status

## Migration note

The folder structure now reserves explicit buckets for `active`,
`review-needed`, and `archived` plan material. The active numbered plans still
live in `docs/plans/` root during migration, so this file is the canonical
status map until those files are physically moved.
