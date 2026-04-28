# Multi-agent investigation: builder generation hardening (970d)

**Agents:** 32 × **Composer 2 Fast** (`composer-2-fast`) subagents, read-only codebase review.  
**Scope:** Dynamic vs static prompt, tokens, orchestration, timeouts, eval drift, ignored paths — aligned with your pasted plan (Nordtak / `builder-generation-hardening`).

**Workspace limit:** `logs/generationslogg/` and `data/prompt-dumps/` are **not present** in this environment (and are typically gitignored). Agents could **not** read your two latest run folders or `.env.local`. Use explicit paths on your machine (`@`-attach or copy `timeline.ndjson` + prompt dump into a non-ignored path) for run-specific proof.

## Per-agent reports

| ID | File | Focus |
|----|------|--------|
| 01 | [agents/agent-01-scaffold-truncation.md](./agents/agent-01-scaffold-truncation.md) | `// ... truncated` mid-TSX |
| 02 | [agents/agent-02-home-recovery-gap.md](./agents/agent-02-home-recovery-gap.md) | Trivial home vs `tryRecoverMissingHomeRoute` |
| 03 | [agents/agent-03-autofix-heavy-load.md](./agents/agent-03-autofix-heavy-load.md) | `autofix.heavy_load` vs verifier gate |
| 04 | [agents/agent-04-dynamic-static-budget.md](./agents/agent-04-dynamic-static-budget.md) | `buildDynamicContext` / token budgets |
| 05 | [agents/agent-05-orchestration-overlap.md](./agents/agent-05-orchestration-overlap.md) | Stacked repair / verify |
| 06 | [agents/agent-06-evals-vs-prod.md](./agents/agent-06-evals-vs-prod.md) | Why evals green, prod red |
| 07 | [agents/agent-07-linux-vs-local-env.md](./agents/agent-07-linux-vs-local-env.md) | Env parity |
| 08 | [agents/agent-08-token-time-hypothesis.md](./agents/agent-08-token-time-hypothesis.md) | maxTokens vs reasoning time |
| 09 | [agents/agent-09-dom-jsx-fixer.md](./agents/agent-09-dom-jsx-fixer.md) | `dom-builtin-jsx-fixer` |
| 10 | [agents/agent-10-first-token-watchdog.md](./agents/agent-10-first-token-watchdog.md) | No `engine.first_token_slow` |
| 11 | [agents/agent-11-merge-llm-only.md](./agents/agent-11-merge-llm-only.md) | `LLM_ONLY_PATHS` |
| 12 | [agents/agent-12-inspirational-4k-cap.md](./agents/agent-12-inspirational-4k-cap.md) | `Math.min(maxChars, 4000)` |
| 13 | [agents/agent-13-cursorignore-paths.md](./agents/agent-13-cursorignore-paths.md) | `.cursorignore` / access |
| 14 | [agents/agent-14-verifier-fixer-chain.md](./agents/agent-14-verifier-fixer-chain.md) | Single fix gate + repair pass |
| 15 | [agents/agent-15-autofix-duplicate-return.md](./agents/agent-15-autofix-duplicate-return.md) | No top-level return fixer |
| 16 | [agents/agent-16-plan-repo-mapping.md](./agents/agent-16-plan-repo-mapping.md) | YAML todos → files |
| 17 | [agents/agent-17-system-prompt-lengths.md](./agents/agent-17-system-prompt-lengths.md) | `prompt-cache` logging |
| 18 | [agents/agent-18-finalize-runner-order.md](./agents/agent-18-finalize-runner-order.md) | Phase order / latency |
| 19 | [agents/agent-19-llm-repair-gate.md](./agents/agent-19-llm-repair-gate.md) | `runLlmRepairGate` |
| 20 | [agents/agent-20-complete-project-home-gate.md](./agents/agent-20-complete-project-home-gate.md) | Assembly vs char gate |
| 21 | [agents/agent-21-thinking-latency.md](./agents/agent-21-thinking-latency.md) | Thinking defaults |
| 22 | [agents/agent-22-imports-lucide-blocks.md](./agents/agent-22-imports-lucide-blocks.md) | Imports checklist + Lucide |
| 23 | [agents/agent-23-generationslogg-paths.md](./agents/agent-23-generationslogg-paths.md) | `GENERATIONSLOGG` layout |
| 24 | [agents/agent-24-compare-two-runs.md](./agents/agent-24-compare-two-runs.md) | How to diff two runs |
| 25 | [agents/agent-25-too-much-to-build.md](./agents/agent-25-too-much-to-build.md) | Signal overlap |
| 26 | [agents/agent-26-wall-clock-timeouts.md](./agents/agent-26-wall-clock-timeouts.md) | 8m50 vs manifest |
| 27 | [agents/agent-27-partial-file-repair.md](./agents/agent-27-partial-file-repair.md) | Partial-file LLM loop |
| 28 | [agents/agent-28-recurring-patterns.md](./agents/agent-28-recurring-patterns.md) | `fix-patterns.json` |
| 29 | [agents/agent-29-preview-blocked-linkage.md](./agents/agent-29-preview-blocked-linkage.md) | Home → `previewBlocked` |
| 30 | [agents/agent-30-max-chat-system-chars.md](./agents/agent-30-max-chat-system-chars.md) | API `system` cap |
| 31 | [agents/agent-31-user-plan-cross-check.md](./agents/agent-31-user-plan-cross-check.md) | Your plan vs repo |
| 32 | [agents/agent-32-world-class-alignment.md](./agents/agent-32-world-class-alignment.md) | `llm-flow-target-worldclass.md` |

## Consensus (aggregated)

| Hypothesis | Median agent confidence “this is a major contributor” | Notes |
|------------|----------------------------------------------------------|--------|
| Mid-file scaffold truncation poisons codegen | **~45%** (range 35–50 in agent 01) | Strong mechanism; needs log correlation |
| Trivial `app/page.tsx` + no recovery LLM pass | **~90%** | Code-proven gap |
| `autofix.heavy_load` does not skip verifier | **~95%** | Observability only |
| Token / output cap caused stop | **~15%** | Reasoning latency ≠ maxTokens |
| Linux vs Mac `.env` explains Nordtak | **~10%** | Low without diff |
| Evals pass, prod fails | **~75%** | Fixture / surface mismatch |
| “Too much to build” (overlapping signals) | **~70%** (heuristic) | route + dossier + scaffold stack |

**Overall confidence that the combined investigation identified the primary failure class for your described Nordtak run:** **72%** (scaffold truncation + downstream syntax/autofix storm + trivial home gate without recovery).

## Prioritized world-class actions (synthesized)

1. **Never emit invalid partial TSX** in scaffold serialization (your Prio A/B/C).  
2. **Home recovery for trivial content** (same `runLlmRepairGate` pattern as missing file).  
3. **Policy when `autofix.heavy_load`:** skip or shorten verifier / escalate LLM-fixer once.  
4. **First-token / reasoning UX:** emit explicit event from `stream-format.ts` (~120s) — code name optional.  
5. **Align inspirational layout budget** with `scaffoldChars` / product intent (4k cap nuance).  
6. **Eval:** add one anonymized Nordic B2B-style init prompt + golden prompt hash.

## Model disclosure

All 32 subagents were invoked with **`model: composer-2-fast`** (Cursor “Composer 2” family). No other agent models were used.
