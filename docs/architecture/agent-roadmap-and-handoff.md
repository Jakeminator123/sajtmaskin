# Agent Roadmap And Handoff

This file is the operational handoff index for plan artifacts. Use it when a new
agent needs to understand which plans are active, which ones need review, and
which ones are old references.

Status re-verified against the current plan set on `2026-03-18`.
Updated after orchestrator run `2026-03-18-plan9-10-completion`.

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
| `09-world-class-builder-phase-3-smb-growth.md` | `archived` | **COMPLETED** -- Team editor, SEO guarantees, integration setup wizard, version diff/rollback UX |
| `10-world-class-builder-phase-4-learning-moat.md` | `active` | ~80% complete -- Telemetry, feedback, scaffold learning, collaboration, model routing, eval gate all delivered. V0 fallback extraction optional. |
| `11-next-vercel-build-plan-core-config.md` | `archived` | Completed phased optimization plan (core Next.js config) |
| `12-next-vercel-build-plan-server-routes.md` | `archived` | Completed phased optimization plan (server/API improvements) |
| `13-next-vercel-build-plan-ui-performance.md` | `archived` | Completed phased optimization plan (UI rendering improvements) |
| `14-critical-runtime-fixes.md` | `archived` | **COMPLETED** -- Token budgets, credit commit, config drift, Vercel cancellation |
| `15-builder-robustness.md` | `archived` | **COMPLETED** -- Builder entry edge case, clarification persistence |
| `16-provider-adapter-architecture.md` | `archived` | **COMPLETED** -- Model extraction, stream contract, plan-mode isolation, generation stream extraction |

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

## Latest session: 2026-03-17/18 architecture cleanup + stream extraction

Three orchestrator runs completed and archived:

1. **2026-03-17-architecture-cleanup**: Plans 14-16 baseline. Deploy SSE fix,
   abort signal threading, schema guards, plan-mode extraction, follow-up
   clarification extraction, import normalization.
2. **2026-03-17-stream-extraction**: v0 model compat shims removed, model
   selection test moved to neutral home.
3. **2026-03-17 continued**: Own-engine generation stream loop extracted to
   `src/lib/providers/own-engine/generation-stream.ts`. Plan 16 marked complete.

Key commits on `main`: `033e5a9` through `8ab159d`.

## Handoff notes for next agent

### What is done

- **Plan 14** (runtime fixes): all 4 workstreams complete
- **Plan 15** (builder robustness): all 2 workstreams complete
- **Plan 16** (provider adapter): all 3 workstreams complete
- Own-engine provider modules created:
  - `src/lib/providers/own-engine/plan-mode-response.ts`
  - `src/lib/providers/own-engine/follow-up-clarification.ts`
  - `src/lib/providers/own-engine/generation-stream.ts`
- Model catalog/selection neutral at `src/lib/models/`; old shims deleted
- Builder stream contract documented at
  `src/lib/gen/stream/builder-stream-contract.ts`
- Stream routes thinned: create ~1380 lines, follow-up ~1380 lines (from ~1840/1935)
- All audit report bugs resolved

### What remains

#### Plan 9: SMB Growth -- COMPLETED

All remaining items delivered in orchestrator run `2026-03-18-plan9-10-completion`:
- Team Kodvy editor (name/role/bio)
- Server-side SEO preflight + critical SEO as publish blockers
- Integration setup wizard with guided flows
- Content-level version diffs + rollback confirmation dialog

#### Plan 10: Learning & Moat (~80% done)

All six workstreams delivered:
1. **Generation telemetry schema** -- `generation_telemetry` DB table, service layer, write from finalize flow
2. **Structured builder feedback** -- VersionFeedback component, feedback API route, wired into MessageList
3. **Scaffold learning** -- scaffold scoring from telemetry, boost/penalty in matcher, historical retry success
4. **Collaboration primitives** -- version comments, approval workflow, UI indicators in VersionHistory
5. **Phase-aware model routing** -- planner uses cheaper model, generator uses full tier, telemetry records routing
6. **Eval suite** -- 15 benchmarks, baseline comparison, CLI runner with CI gate

Remaining: DB migrations need to be run. Manual QA of new UI needed.

#### V0 fallback stream (~75% migration done, ~1-2 days)

The v0-fallback SSE loop in both stream routes still runs inline rather than
through a provider module like own-engine does. It works correctly but is not
yet extracted. This is optional cleanup, not a blocker.

### Environment notes

- Shell: PowerShell on Windows. Use `npm exec` instead of `npx`.
- `.j_to_agent/` is the user's preferred channel for providing external files
  to agents; treat it as read-only input.
- `.cursorignore` protects env files; agents should read ignored files by
  explicit path when needed.
- `alwaysApply` rules handle React best practices, progress reporting,
  terminology, and MCP routing automatically.

## Working rule

When picking up old roadmap work:

- start from an `active` plan if one exists
- treat `review-needed` plans as historical hints, not instructions
- treat `.cursor/orchestrator/run/` artifacts as execution history unless the
  conclusions have been promoted into `docs/`
- move fully completed or clearly superseded material to `docs/plans/archived/`
- update this file whenever a numbered plan changes status
