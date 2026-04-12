---
name: codebase-review-swarm
description: >-
  Launches 8 parallel agents that each deep-review a slice of the Sajtmaskin
  codebase and write .txt improvement reports. Use when the user asks for a
  broad code review, improvement suggestions, quality audit, or says
  "review swarm", "förbättringsförslag", "granska hela flödet".
---

# Codebase Review Swarm

Launch **8 parallel Task agents** that each own a specific domain of the Sajtmaskin codebase.
Every agent writes a `.txt` report to `reviews/` in the repo root.
After all agents finish, summarize highlights for the user.

## When to use

- User asks for broad improvement suggestions across the codebase.
- User says "review swarm", "granska allt", "förbättringsförslag", or similar.

## Pre-flight

1. Create `reviews/` in the repo root if it doesn't exist:
   ```bash
   mkdir -p reviews
   ```
2. Note the current date for filenames (YYYY-MM-DD).

## The 8 agents

Launch **all 8 as parallel Task calls** in a single message. Each agent is `subagent_type: "explore"` (read-only) with `model: "fast"`.

Every agent prompt MUST include:
- The **full instructions** from its section below (scope, key files, checklist).
- An instruction to write its report to `reviews/<NN>-<slug>-<date>.txt`.
- An instruction to return a one-paragraph summary of the top 3 findings.
- The standard footer (see **Report format** below).

---

### Agent 1 — Scaffold & Matcher (`01-scaffold`)

**Scope:** `src/lib/gen/scaffolds/`, `src/lib/builder/scaffold-hint.ts`

Checklist:
- Are all manifests consistent (superFamily, variants, tags, files)?
- Does `matcher.ts` keyword scoring cover all families without over-weighting any single one?
- Are embedding locale entries present for every registered scaffold?
- Is variant selection tested? Edge cases (no variants, all scores zero)?
- Fallback chain: does it make sense that `content-site` is the new default?
- Are industry scaffolds discoverable enough via keywords and hints?

---

### Agent 2 — Orchestration & Prompt Chain (`02-orchestration`)

**Scope:** `src/lib/gen/orchestrate.ts`, `src/lib/gen/system-prompt.ts`, `src/lib/gen/promptOrchestration.ts`, `config/prompt-static/`

Checklist:
- Is `scaffoldContext` correctly assembled (including variant hints)?
- Token budget allocation: are scaffolds starved or bloated?
- Dynamic context block ordering and priority.
- System prompt coherence: any contradictory instructions?
- Is the brief→spec→prompt chain clean or are there redundant passes?
- Prompt-static fragments: any stale, duplicate, or conflicting files?

---

### Agent 3 — Generation Engine & Streaming (`03-engine`)

**Scope:** `src/lib/gen/stream/`, `src/lib/providers/own-engine/`, `src/lib/own-engine/`

Checklist:
- SSE stream lifecycle: any unclosed streams, missing error events?
- Autofix loop: max passes, deterministic vs LLM escalation logic.
- Finalize pipeline: file merge, CSS validation, quality gate flow.
- Plan-mode vs direct-mode branching: any dead paths?
- Contract gate: does it correctly block/allow based on pre-generation contracts?
- Error recovery: what happens on timeout, OOM, or provider 5xx?

---

### Agent 4 — Preview & Deploy (`04-preview`)

**Scope:** `src/lib/builder/preview-session/`, `src/lib/gen/preview/`, `src/components/builder/preview-panel/`, `src/app/api/*sandbox*`, `src/app/api/*preview*`

Checklist:
- VM lifecycle: create → heartbeat → destroy. Any orphaned sessions?
- Shim-preview fallback: is it still needed? Dead code?
- Preview refresh logic: double-refreshes, stale URLs?
- Deploy pipeline: pre-checks, error surfaces, naming conventions.
- Legacy `sandbox` naming: any new code that should use `preview`/`VM`?
- SSE events (`sandboxPending`, `sandboxUrl`): consistent with frontend consumers?

---

### Agent 5 — Builder UI & State (`05-builder-ui`)

**Scope:** `src/app/builder/`, `src/components/builder/`, `src/app/builder/useBuilderState.ts`, `src/app/builder/useBuilderPageController.ts`

Checklist:
- State shape: is `useBuilderState` growing too large? Split candidates?
- Props drilling vs context: which components get too many props?
- Wizard (IntakeWizard): validation, accessibility, mobile UX.
- Chat panel: message rendering, streaming states, error display.
- Performance: any re-render hotspots (large memo dependencies, inline objects)?
- Dead or duplicate state fields.

---

### Agent 6 — API Routes & Data Layer (`06-api-data`)

**Scope:** `src/app/api/`, `src/lib/db/`, `src/lib/api/`

Checklist:
- Auth/guards: any unprotected mutation routes?
- v0 → engine route migration: which handlers are still in `api/v0/` vs re-exported?
- DB services: query patterns, N+1 risks, missing indexes.
- Error responses: consistent shape? Proper HTTP status codes?
- Rate limiting or abuse prevention on AI routes.
- Env/secret usage: any hardcoded keys or leaked values?

---

### Agent 7 — Config, Env & DX (`07-config-dx`)

**Scope:** `config/`, `scripts/`, `docs/ENV.md`, `src/lib/env.ts`, `config/env-policy.json`, `package.json`, `tsconfig.json`

Checklist:
- env.ts serverSchema vs actual `.env.example` vs `env-policy.json` parity.
- Unused config keys or stale prompt-static fragments.
- Script health: do all scripts in `package.json` still work?
- TypeScript config: strict settings, path aliases, include/exclude.
- Dev tooling: linting rules, pre-commit hooks, CI gaps.
- Documentation drift: do READMEs match current structure?

---

### Agent 8 — Tests, Quality & Gaps (`08-tests`)

**Scope:** `src/**/*.test.ts`, `e2e/`, `isolated_tests/`, `tests/`

Checklist:
- Test coverage: which critical paths have zero tests?
- Scaffold matcher: are keyword scores and variant selection tested?
- Orchestration: is the prompt chain tested end-to-end or only in isolation?
- E2E: do Playwright tests cover the wizard → generation → preview flow?
- Golden/snapshot tests: are they up to date after recent changes?
- Test utilities: any shared mocks missing `superFamily` or other new fields?

---

## Report format

Each agent writes a `.txt` file with this structure:

```
═══════════════════════════════════════════════════
  SAJTMASKIN CODE REVIEW — <AREA NAME>
  Date: <YYYY-MM-DD>
═══════════════════════════════════════════════════

## Summary
<2-3 sentence overview>

## Findings

### 1. <Title> [SEVERITY: critical/warning/info]
File(s): <path(s)>
Issue: <description>
Suggestion: <what to do>

### 2. ...
(continue for each finding)

## Quick wins (easiest high-value fixes)
- ...

## Larger refactors (needs planning)
- ...
```

## After all agents

1. Read all 8 `.txt` files from `reviews/`.
2. Summarize highlights: group by severity (critical → warning → info).
3. Present the top 10 actionable items to the user.
4. Mention that full reports are in `reviews/`.

## Notes

- All agents are **read-only** (`subagent_type: "explore"`). They do NOT edit code.
- Reports go to `reviews/` which should be gitignored or treated as ephemeral.
- The skill uses `model: "fast"` to keep cost low; switch to default for deeper analysis.
- Agents should be **thorough** (`"very thorough"` exploration level).
