# Agent Roadmap And Handoff

This file is the operational handoff index for plan artifacts. Use it when a new
agent needs to understand which plans are active, which ones need review, and
which ones are old references.

Status re-verified against the current plan set on `2026-03-17`.

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
| `07-world-class-builder-phase-1-trust-launch.md` | `archived` | Completed trust/launch phase: version lifecycle, readiness, diagnostics, preview labeling, deploy gating |
| `08-world-class-builder-phase-2-site-planning.md` | `archived` | Completed planning-layer phase for the own-engine path; remaining future parity/orchestration work should be treated as new roadmap scope |
| `09-world-class-builder-phase-3-smb-growth.md` | `active` | Phase 3 SMB product scope |
| `10-world-class-builder-phase-4-learning-moat.md` | `active` | Phase 4 differentiation and learning systems scope |
| `11-next-vercel-build-plan-core-config.md` | `archived` | Completed phased optimization plan (core Next.js config) |
| `12-next-vercel-build-plan-server-routes.md` | `archived` | Completed phased optimization plan (server/API improvements) |
| `13-next-vercel-build-plan-ui-performance.md` | `archived` | Completed phased optimization plan (UI rendering improvements) |
| `14-critical-runtime-fixes.md` | `active` | Token budgets, credit commit, config drift, Vercel cancellation -- from deep-research audit |
| `15-builder-robustness.md` | `active` | Builder entry edge case, clarification persistence -- from deep-research audit |
| `16-provider-adapter-architecture.md` | `active` | Own-engine / v0 separation: model extraction, stream contract, plan-mode isolation |

## Current active-phase notes

- Repository-local execution traces for future multi-agent automation now belong
  under `.cursor/orchestrator/run/` rather than `docs/plans/`. Treat those dated
  run folders as operational ledgers, not as canonical roadmap docs.
- Completed operational sweep:
  `docs/plans/archived/2026-03-bug-recheck-sweep.md` records the March 2026
  `jakob` bug recheck implementation pass. The implementation is complete and the
  file is now physically archived.
- Phase `7` is archived: lifecycle-aware readiness, diagnostics, preview
  labeling, and deploy gating are implemented and part of the active builder
  path.
- Phase `8` is complete for the own-engine path and can now be treated as
  archived roadmap work. Planner `uiParts` now round-trip through engine chat
  storage, raw chat reload restores the review card, and the stale
  `usePlanExecution.ts` path has been removed. See
  `docs/analyses/phase-08-plan-persistence-and-orchestration.md` for the
  closure trace.
- Phase `9` remains active, but it is now well past kickoff. The builder has
  substantial Kodvy editing coverage (metadata, hero, services, FAQ,
  testimonials, stats, process, products, pricing, categories, nav, CTA, blog
  metadata, footer links), structured post-check follow-up for editorial /
  business / SEO / analytics, first practical analytics/business/setup slices,
  initial compare / restore behavior, and targeted QA around awaiting-input and
  PreviewPanel save flows. The remaining work is mainly polish, broader manual
  QA, and a few judgment calls on any final high-signal editing gaps. See
  `docs/analyses/phase-09-smb-growth-implementation-status.md`.

## Read order for a new agent

1. `docs/README.md`
2. `docs/architecture/structure-and-terminology.md`
3. `docs/architecture/documentation-lifecycle.md`
4. `docs/architecture/project-settings-and-builder-questions.md`
5. `docs/architecture/generation-loop-and-error-memory.md`
6. `docs/plans/README.md`
7. The relevant `docs/plans/active/` plan files

## Legacy carryovers already absorbed

- Phase `1` should absorb remaining domain readiness, env-var readiness, and
  deployment-event hardening from legacy plans `02` to `04`
- Phase `2` can treat context-aware template recommendations as an optional
  planning/onboarding extension rather than a fresh template-search rebuild
- Phase `3` should start from the fact that generic pageview collection already
  exists
- Archived plans `11` through `13` provide useful performance groundwork, but
  do not change the `07` -> `08` -> `09` -> `10` execution order

## Latest run: 2026-03-17 critical-runtime-fixes

Plans 14 and 15 were executed in a single orchestrator run. Key changes:

- **Plan 14** (4 workloads, all done): credit commit, token defaults, config
  warning, Vercel cancellation. Can be moved to `archived` after deploy
  verification.
- **Plan 15** (2 workloads, all done): clarification persistence, builder
  entry hardening. Can be moved to `archived` after manual QA.
- **Plan 16** (0 workloads started): provider adapter architecture. This is the
  remaining active plan from the deep-research audit and should be treated as
  a separate orchestrator run.

Commit: `c70661a` pushed to `origin/main`.

## Handoff notes for next agent

### Immediate verification needed

1. **TypeScript build**: the pre-push hook failed due to `npx` not being in
   PATH (volta issue). Run `pnpm tsc --noEmit` manually to confirm no type
   errors were introduced.
2. **Deploy verification**: confirm Vercel deploy succeeds with the new
   `supportsCancellation` in `vercel.json` and the lowered token defaults.
3. **Token default impact**: monitor first few generations after deploy.
   ENGINE_MAX_OUTPUT_TOKENS dropped from 262k to 32k. If truncated outputs
   appear, consider bumping to 65k or adding tier-based caps.

### Recommended next pass (Plan 16 + remaining Phase 9 + Phase 10)

Plan 16 (provider adapter architecture) is the cleanest next target:
1. Extract model selection to `src/lib/models/` (safe rename)
2. Isolate plan-mode into its own handler (reduces route complexity)
3. Define `BuilderStreamEvent` contract (unifies own-engine + v0)

After Plan 16, return to Phase 9 remaining gaps:
- Team editor
- SEO generation guarantees
- Analytics provider setup flows
- Pack-specific guided UI
- Content-level version diff

Phase 10 is long-horizon work. Start only after Phase 9 is substantially done.

### Environment notes

- `volta`/`npx` are not in the shell PATH used by Cursor agents; use `pnpm`
  directly for any node tooling
- `.j_to_agent/` is the user's preferred channel for providing external files
  to agents; treat it as read-only input
- `.cursorignore` was significantly tightened; agents should read ignored files
  by explicit path when needed, not expect them in search results

## Working rule

When picking up old roadmap work:

- start from an `active` plan if one exists
- treat `review-needed` plans as historical hints, not instructions
- treat `.cursor/orchestrator/run/` artifacts as execution history unless the
  conclusions have been promoted into `docs/`
- move fully completed or clearly superseded material to `docs/plans/archived/`
- update this file whenever a numbered plan changes status
