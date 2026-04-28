# Init / follow-up bughunt (10 x Composer 2)

**Agents:** 10 x `composer-2-fast`, read-only.  
**Scope:** init genesis vs follow-up delta semantics, frozen scaffold/variant/routes, repair behavior, prompt bloat, status truth.

## Top findings

| Rank | Severity | Finding | Confidence | Primary files |
|------|----------|---------|------------|---------------|
| 1 | P1 | Split-brain `generationMode`: `resolveOrchestrationBase` derives follow-up from `previousFilesCount`, while `finalizeOrchestrationPrompts` defaults follow-up from `persistedScaffoldId`. Same request can get init BuildSpec but follow-up system prompt/variant lock. | 88-92% | `src/lib/gen/orchestrate.ts` |
| 2 | P1 | Follow-up stream meta can write `briefSummary: null` and shallow-merge over prior snapshot, breaking Snapshot-Brief continuity. | 92% | `own-engine-build-session.ts`, `generation-stream.ts`, `orchestration-snapshot.ts` |
| 3 | P1 | `repairPassIndex` is always `1` for every in-place repair, so stale error pruning can leave old `Fel` rows after later repairs. | 88% | `generation-stream.ts`, `version-errors.ts` |
| 4 | P1 | Builder UI still primarily derives display status from DB flags, while event-bus projection exists but is not used in product UI. | 90-95% | `BuilderShellContent.tsx`, `VersionHistory.tsx`, `event-bus-projection.ts` |
| 5 | P2 | Plan-mode follow-up does not pass `persistedVariantId` / `followUpIntent` into orchestration, so planner can drift from frozen variant while codegen stays locked. | 85% | `follow-up-orchestration-input.ts` |
| 6 | P2 | Follow-up route freeze can ignore clear-redesign/delta-brief new pages and locale-dedupe can drop existing routes from route plan. | 65-78% | `route-plan-builder.ts`, `locale-dedupe.ts` |
| 7 | P2 | Follow-up merge can replace a rich home page with short-but-above-threshold content; init-only `missingEmittedEssentials` signal is absent on follow-up. | 80-95% | `finalize-merge.ts`, `version-manager.ts`, `finalize-preflight.ts` |
| 8 | P2 | Final wrapped follow-up user prompt can exceed prompt handoff caps after file context/continuity are prepended. | 82% | `chat-message-stream-post.ts`, `promptOrchestration.ts` |
| 9 | P2 | `lineageHash` / prompt dump omit follow-up-critical dynamic state such as capability modify hints / dossier selection and dumps overwrite latest files. | 88-95% | `generation-input-package.ts`, `prompt-dump.ts` |
| 10 | P2 | Repair ecosystem still has multiple LLM-fixer entrypoints; `runLlmFixer` is called directly in server repair loop outside `runLlmRepairGate`. | 85-88% | `repair-loop.ts`, `llm-repair-gate.ts` |

## Recommended fix order

1. **Unify generation-mode resolution**: compute one `resolvedMode` once and pass it through base + finalized prompt context.
2. **Preserve snapshot brief**: never shallow-merge `briefSummary: null` over a non-null snapshot.
3. **Make repair pass index monotonic per `versionId`** or prune stale rows by pass family/log id.
4. **Wire UI status to event projection** or explicitly document DB flags as source-of-truth until projection is productized.
5. **Follow-up home guard**: treat `LLM_ONLY_PATHS` regression on follow-up as essential-path regression, not only init scaffold leak prevention.

## Per-agent reports

| Agent | Report |
|-------|--------|
| IF-01 | [agents/if-01-discriminator-divergence.md](./agents/if-01-discriminator-divergence.md) |
| IF-02 | [agents/if-02-deep-brief-vs-snapshot.md](./agents/if-02-deep-brief-vs-snapshot.md) |
| IF-03 | [agents/if-03-scaffold-variant-freeze.md](./agents/if-03-scaffold-variant-freeze.md) |
| IF-04 | [agents/if-04-route-freeze-clear-redesign.md](./agents/if-04-route-freeze-clear-redesign.md) |
| IF-05 | [agents/if-05-follow-up-merge-llm-only.md](./agents/if-05-follow-up-merge-llm-only.md) |
| IF-06 | [agents/if-06-history-prompt-bloat.md](./agents/if-06-history-prompt-bloat.md) |
| IF-07 | [agents/if-07-repair-pass-behavior.md](./agents/if-07-repair-pass-behavior.md) |
| IF-08 | [agents/if-08-lineage-prompt-dump.md](./agents/if-08-lineage-prompt-dump.md) |
| IF-09 | [agents/if-09-builder-ui-mode-bugs.md](./agents/if-09-builder-ui-mode-bugs.md) |
| IF-10 | [agents/if-10-worldclass-gap.md](./agents/if-10-worldclass-gap.md) |

