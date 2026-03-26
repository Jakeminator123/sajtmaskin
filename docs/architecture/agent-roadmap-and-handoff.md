# Agent Roadmap And Handoff

This file is the operational handoff index for plan artifacts. Use it when a new
agent needs to understand which plans are active, which ones need review, and
which ones are old references.

**Maintenance:** The **authoritative list** of avklarat vs active plan *files* is
[`docs/plans/README.md`](../plans/README.md). Do not duplicate that inventory as a
wide table here — it goes stale. This document keeps **read order**, **working
rules**, and **narrative** that `plans/README` does not carry.

Status re-verified `2026-03-26` (hub + plan index + handoff drift). Earlier verification
`2026-03-18` after orchestrator runs `2026-03-18-plan9-10-completion`,
`2026-03-18-wl11-migrations-qa`, and `2026-03-18-plan-finalization-and-cleanup`.

## Status legend

| Status | Meaning |
|------|---------|
| `active` | Current roadmap material that should still steer implementation |
| `review-needed` | Older or partial plan that may still contain value, but must be checked against current code first |
| `avklarat` (*archived*) | Completed or superseded plan kept only for traceability |

## Current numbered plan map

| Plan file | Status | Notes |
|------|--------|-------|
| `17-repo-separation-and-independence.md` | `active` | **WS-1–WS-4 delivered** (v0 fallback off main builder path, Blob `StorageProvider`, direct provider calls). Remaining: WS-5/6 + env/docs cleanup — see plan file. |

**Archived numbered plans (`01`–`16`)** plus dated archives: filenames, completion labels, and provenance live in [`docs/plans/README.md`](../plans/README.md) under **`avklarat`**. For per-plan narrative that used to live only here, open the `.md` file in `docs/plans/avklarat/`.

## Current active-phase notes

- Repository-local execution traces for future multi-agent automation now belong
  under `.cursor/orchestrator/run/` rather than `docs/plans/`. Treat those dated
  run folders as operational ledgers, not as canonical roadmap docs.
- Completed operational sweep:
  `docs/plans/avklarat/2026-03-bug-recheck-sweep.md` records the March 2026
  `jakob` bug recheck implementation pass. The implementation is complete and the
  file is now physically archived.
- Phase `7` is archived: lifecycle-aware readiness, diagnostics, preview
  labeling, and deploy gating are implemented and part of the active builder
  path.
- Phase `8` is complete for the own-engine path and can now be treated as
  archived roadmap work. Planner `uiParts` now round-trip through engine chat
  storage, raw chat reload restores the review card, and the stale
  `usePlanExecution.ts` path has been removed. See
  `docs/plans/avklarat/2026-03-docs-old-archive/analyses/phase-08-plan-persistence-and-orchestration.md` for the
  closure trace.
- Phase `9` is now **archived / complete**. All remaining items delivered in
  orchestrator run `2026-03-18-plan9-10-completion`: team Kodvy editor,
  server-side SEO preflight with critical SEO as publish blockers, integration
  setup wizard, and content-level version diffs + rollback confirmation. The
  plan file has been moved to `docs/plans/avklarat/`.
- Phase `10` is now **LEVERERAT**. All six workstreams have code and DB tables
  are live. Remaining: production validation only. Plan archived.
- **Plan 17** (repo separation and independence) is the new active plan,
  derived from the STOR_MIGRATION analysis: v0 phase-out, Blob abstraction,
  AI Gateway replacement, dead code removal, and optional D-ID/OpenClaw scope
  reduction.
- Plan 17 progress update `2026-03-19`: WS-3 Blob abstraction is now delivered
  (`src/lib/storage/` + refactored consumers). Requested WS-5 audit of
  `src/**/*.json` over `1 MB` returned no matches, so no `.gitignore` or
  `git rm --cached` action was needed for that slice.

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

## Historical closure (March 2026)

Plans **14–16** (runtime/builder hardening), **9–10** (SMB growth + learning moat
workstreams), and v0-fallback stream extraction landed via orchestrator runs
**2026-03-17**–**2026-03-18** (e.g. commits `e3ba515`, `8aef51a` on `main` at the
time). Forensics: `docs/plans/avklarat/`, `git log`, and closure notes such as
`docs/plans/avklarat/2026-03-docs-old-archive/analyses/phase-08-plan-persistence-and-orchestration.md` — do not treat
the bullet list below as the live product checklist.

## Handoff notes for next agent

### What is done

*Snapshot from 2026-03-18; validate against `docs/architecture/engine-status.md` and code before assuming nothing moved.*

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
  - `src/lib/models/phase-routing.ts` -- per-phase routing (OpenAI pro/max/codex: planner+generator = tier model; fixer/verifier/deploy-assistant = gpt-4.1-mini; fast + anthropic unified per tier)
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

### New architecture docs (2026-03-18)

- `docs/architecture/prompt-tree.md` — full pipeline map from builder UI to
  generation, covering every prompt parameter, all layers, and the own-engine
  vs v0-fallback divergence.
- `docs/architecture/v0-soft-deprecation.md` — phased v0 deprecation plan with
  measurable stop/go gates, do-not-remove list for Vercel integrations, and
  complete file inventory for each phase.

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
- move fully completed or clearly superseded material to `docs/plans/avklarat/`
- update this file whenever a numbered plan changes status

