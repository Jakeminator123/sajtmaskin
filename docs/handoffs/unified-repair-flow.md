# Unified Repair Flow Handoff

Status: Active (2026-03-21)

## Summary

Consolidated the split repair logic (syntax-only server LLM loop + opt-in client
autofix) into a single unified chain where:

- Machine fixers run first (deterministic, fast, always on)
- The existing `runLlmFixer` runs broader (syntax + preview + quality-gate diagnostics)
  with a shared budget (default 2 LLM passes)
- Client autofix remains as a safety net (now enabled by default)

## New files

| File | Role |
|------|------|
| `src/lib/gen/autofix/react-hook-import-fixer.ts` | Deterministic fixer for missing React hook imports (`useState`, `useEffect`, etc.) and DOM global shadowing |
| `src/lib/gen/autofix/repair-diagnostics.ts` | Unified diagnostic format: converts syntax, preview, quality-gate errors into `RepairDiagnostic[]` |
| `src/lib/gen/autofix/shared-repair.ts` | Shared repair helper: machine autofix first, then LLM fixer with budget cap |
| `src/lib/gen/autofix/*.test.ts` | 20 regression tests covering all new modules |

## Modified files

| File | Change |
|------|--------|
| `src/lib/gen/autofix/pipeline.ts` | Added `react-hook-import-fixer` (step 3a) and `dom-shadow-fixer` (step 3a2) |
| `src/lib/gen/autofix/fixer-prompt.ts` | System prompt documents `[syntax]`, `[preview]`, `[quality-gate]` error sources |
| `src/lib/gen/defaults.ts` | Added `BROAD_REPAIR_MAX_PASSES` (default 2); codex reasoning `high` (was `xhigh`) |
| `src/lib/gen/stream/finalize-version.ts` | Added broad repair step 2b after syntax validation |
| `src/lib/gen/stream/finalize-preflight.ts` | Replaced inline LLM loop with shared repair |
| `src/lib/hooks/chat/useAutoFix.ts` | Autofix enabled by default; limits 2/reason, 3/chat |
| `src/lib/hooks/chat/post-checks.ts` | Sandbox quality gate always runs (not skipped when post-check autofix queued) |

## Configuration

| Env var | Default | Range | What it controls |
|---------|---------|-------|------------------|
| `SAJTMASKIN_BROAD_REPAIR_MAX_PASSES` | 2 | 1-6 | LLM repair passes in the shared repair helper |
| `SAJTMASKIN_AUTOFIX_SYNTAX_MAX_PASSES` | 6 | 1-20 | Legacy syntax-only LLM loop (still used in `validate-and-fix.ts`) |

## How the repair chain works

1. Generation stream completes -> `finalizeAndSaveVersion` starts
2. Step 1: Machine autofix (`runAutoFix`) -- deterministic per-file fixes
3. Step 2: Syntax validation + legacy LLM loop (`validateAndFix`)
4. Step 2b: If errors remain, shared repair (`runSharedRepair`) with broad budget
5. Steps 3-7: URL expansion, images, preflight, version save, telemetry
6. Client receives SSE done event with version + preflight status
7. Client post-checks run; sandbox quality gate always fires
8. If quality gate or preview fails, client autofix sends repair message

## What this fixes

The exact bug that triggered this work: `ReferenceError: useState is not defined`
in a generated `ContactForm` component. The model wrote `useState(...)` without
`import { useState } from "react"`. The old pipeline missed this because:
- `react-import-fixer` only caught `React.*` usage
- `esbuild.transform` does not flag unresolved identifiers
- Client autofix required opt-in (`?autofix` or localStorage)

Now: the deterministic `react-hook-import-fixer` catches it before any LLM call.
If it somehow slips through, the shared LLM repair helper gets a chance (2 passes).
If that also fails, client autofix sends a repair follow-up (enabled by default).

## Follow-up / related

- Scaffold research dedup and dossier checklist caps were addressed in the scrape/rebuild handoff (`scrape-cleanup-rebuild.md`).
- Dossiers remain metadata-first (no vendored `selected_files/` trees unless you add them).
- `GRUND/ggg/` is a user test project — do not commit.

## See also

- [`local-operator-guide.md`](local-operator-guide.md) — operator FAQ (sandbox env, component library vs mirrors)
