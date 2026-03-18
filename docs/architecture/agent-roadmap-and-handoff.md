# Agent Roadmap And Handoff

This file is the operational handoff index for plan artifacts. Use it when a new
agent needs to understand which plans are active, which ones need review, and
which ones are old references.

Status re-verified against the current plan set on `2026-03-18`.
Updated after orchestrator runs `2026-03-18-plan9-10-completion` and
`2026-03-18-wl11-migrations-qa`.

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
| `10-world-class-builder-phase-4-learning-moat.md` | `active` | ~90% complete -- All 6 workstreams delivered. DB tables live. V0 fallback extracted. Remaining: manual QA and production validation. |
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
- Phase `9` is now **archived / complete**. All remaining items delivered in
  orchestrator run `2026-03-18-plan9-10-completion`: team Kodvy editor,
  server-side SEO preflight with critical SEO as publish blockers, integration
  setup wizard, and content-level version diffs + rollback confirmation. The
  plan file has been moved to `docs/plans/archived/`.
- Phase `10` is the only remaining active plan. All six workstreams have code:
  telemetry schema + finalize write, builder feedback UI, scaffold scoring +
  learning, collaboration/approval primitives, phase-aware model routing, and
  eval suite with CI gate. DB tables are live in Supabase. V0 fallback stream
  has been extracted to `src/lib/providers/v0-fallback/`. Remaining: manual QA
  of new UI components in live builder sessions and production validation.

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

## Latest session: 2026-03-18 Plan 9+10 completion and finalization

Five orchestrator runs completed and archived (3 from 2026-03-17, 2 from 2026-03-18):

1. **2026-03-17-architecture-cleanup**: Plans 14-16 baseline. Deploy SSE fix,
   abort signal threading, schema guards, plan-mode extraction, follow-up
   clarification extraction, import normalization.
2. **2026-03-17-stream-extraction**: v0 model compat shims removed, model
   selection test moved to neutral home.
3. **2026-03-17 continued**: Own-engine generation stream loop extracted to
   `src/lib/providers/own-engine/generation-stream.ts`. Plan 16 marked complete.
4. **2026-03-18-plan9-10-completion**: Plan 9 closed out (team editor, SEO
   guarantees, setup wizard, version diffs). All 6 Plan 10 workstreams
   delivered (telemetry, feedback, scaffold learning, collaboration, model
   routing, eval suite). 47 files, +3529 lines. Commit `e3ba515`.
5. **2026-03-18-wl11-migrations-qa**: V0 fallback stream extracted to provider
   module (-928 lines from routes). DB migrations applied to Supabase. React
   best practices QA. 11 files, +920/-960 lines. Commit `8aef51a`.

Key commits on `main`: `033e5a9` through `564821c`.

6. **2026-03-18 fix**: Critical client-bundle fix — scaffold-scoring.ts
   imported `pg` (Node.js-only) which broke the builder client bundle. Fixed
   by moving scoring integration from `matcher.ts` to `orchestrate.ts`
   (server-only). First eval baseline saved: 14/15 PASS, 95% avg score.

## Handoff notes for next agent

### What is done

- **Plans 01-09, 11-16**: all **COMPLETED** and archived
- **Plan 10** (learning moat): all 6 workstreams have code, DB tables live
- Own-engine provider modules:
  - `src/lib/providers/own-engine/plan-mode-response.ts`
  - `src/lib/providers/own-engine/follow-up-clarification.ts`
  - `src/lib/providers/own-engine/generation-stream.ts`
- V0-fallback provider module:
  - `src/lib/providers/v0-fallback/stream-adapter.ts`
- Model system:
  - `src/lib/models/catalog.ts` -- 4 canonical tiers
  - `src/lib/models/selection.ts` -- tier resolution
  - `src/lib/models/phase-routing.ts` -- planner/generator/fixer downgrades
- Generation telemetry:
  - `src/lib/db/schema.ts` -- `generation_telemetry` table
  - `src/lib/db/services/generation-telemetry.ts` -- CRUD + query
  - Written from `finalize-version.ts` on every generation
- Collaboration system:
  - `src/lib/db/schema.ts` -- `version_comments`, `version_approvals` tables
  - `src/lib/db/services/collaboration.ts` -- CRUD + query
  - API routes for comments, approval, summaries
  - `src/components/builder/VersionCollaboration.tsx` -- UI
- Builder feedback:
  - `src/components/builder/VersionFeedback.tsx` -- thumbs up/down + categories
  - API route + telemetry enrichment
- Scaffold learning:
  - `src/lib/gen/scaffolds/scaffold-scoring.ts` -- telemetry-based scores
  - `src/lib/gen/scaffolds/matcher.ts` -- consumes boost/penalty
- Eval suite:
  - 15 benchmark prompts, baseline comparison, CLI with CI gate
  - `npm run eval:suite`, `eval:gate`, `eval:baseline`
- SEO enforcement:
  - `src/lib/gen/validation/seo-preflight.ts` -- server-side checks
  - Critical SEO issues block publishing in readiness route
- Builder Kodvy editors:
  - 17 section editors including team editor
  - Integration setup wizard
  - Content-level version diffs
  - Rollback confirmation dialog
- Stream routes thinned:
  - Create: ~817 lines (from ~1840)
  - Follow-up: ~1018 lines (from ~1935)
- DB migrations applied to Supabase (3 new tables)
- All audit report bugs resolved

### What remains

#### Plan 10: Learning & Moat (~90% done)

All code is delivered. Remaining work:
- Manual QA of new UI components in live builder sessions
- Production validation that telemetry writes work end-to-end
- Tuning scaffold scoring thresholds after real data accumulates
- Setting up the first eval baseline (`npm run eval:baseline`)

This is production-validation work, not code-delivery work.

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
