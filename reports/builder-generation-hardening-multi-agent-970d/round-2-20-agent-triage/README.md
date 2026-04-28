# Round 2: 20-agent init/follow-up triage

**Agents:** 20 x `composer-2-fast`, read-only.  
**Goal:** validate the first init/follow-up bughunt and triage findings so low-confidence singletons stay low while repeated mechanisms are amplified.

## Scoring rubric

`Score = SeverityWeight * Confidence * Corroboration`

| Component | Rule |
|-----------|------|
| SeverityWeight | P1=4, P2=3, P3=2, Info=1 |
| Confidence | Agent confidence as decimal; clamp practical reviews to 0.35-0.98 |
| Corroboration | `1 + 0.25 * (n - 1)`, cap 1.75, where `n` = independent agent reports supporting the same mechanism |
| Downrank | Singleton below 70% confidence gets `singleton-low-confidence` tag and no corroboration boost |
| Uprank | Repeated same mechanism across independent agents gets the boost; similar symptom with different cause does not count |

## Triage clusters

| Rank | Cluster | Severity | Conf. | Agents | n | Score | Triage |
|------|---------|----------|-------|--------|---|-------|--------|
| 1 | `generationMode` split-brain between base orchestration and finalized prompt/variant path | P1 | 0.90 | IF-01, IF-03, R2-01, R2-11 | 4 | **6.30** | Fix first |
| 2 | `repairPassIndex` fixed at 1 for repeated in-place repair, stale error-log rows | P1 | 0.89 | IF-07, R2-03, R2-13 | 3 | **5.34** | Fix first |
| 3 | Snapshot `briefSummary` can be absent/null and shallow-merge over follow-up continuity | P1 | 0.88 | IF-02, R2-02, R2-12 | 3 | **5.28** | Fix first |
| 4 | Builder status still DB-flag driven; event-bus projection unused in product UI | P1 | 0.92 | IF-10, R2-04, R2-14 | 3 | **5.52** | Fix first / may need transport |
| 5 | Lineage hash and dumps omit dynamic prompt-shaping state (`dossierSelection`, `capabilityModifyHint`, component refs, theme preset) | P2 | 0.91 | IF-08, R2-08, R2-18 | 3 | **4.10** | High value observability fix |
| 6 | Plan-mode follow-up omits variant/intent lock fields, so planner can drift from codegen | P2 | 0.88 | IF-03, R2-05, R2-10 | 3 | **3.96** | Fix with input parity |
| 7 | Follow-up merge can regress home richness; init-only `missingEmittedEssentials` does not apply | P2 | 0.84 | IF-05, R2-06 | 2 | **3.15** | Guard `LLM_ONLY_PATHS` on follow-up |
| 8 | Final follow-up user payload can exceed handoff cap after wrappers; client `meta.brief` can override snapshot | P2 | 0.83 | IF-06, R2-07, R2-17 | 3 | **3.74** | Split into cap + API-contract fixes |
| 9 | `clear-redesign` route semantics: route freeze ignores intent; doc/code mismatch | P2 | 0.76 | IF-04, R2-05, R2-15 | 3 | **3.42** | Product decision: code or docs |
| 10 | Multiple LLM repair entrypoints; server repair loop calls `runLlmFixer` outside `runLlmRepairGate` | P2 | 0.86 | IF-10, R2-20 | 2 | **3.23** | Fold into repair-gate work |
| 11 | Path normalization in follow-up merge can duplicate logical files (`app` vs `src/app`, slash variants) | P2 | 0.75 | IF-05, R2-16 | 2 | **2.81** | Add regression tests first |
| 12 | Light follow-up fast policy skips verifier/deep path for narrow copy/local-layout cases | P3 | 0.80 | IF-10, R2-19 | 2 | **2.00** | Intentional policy; product review |
| 13 | Non-streaming follow-up fallback misses `previewPending` sync | P3 | 0.88 | IF-09, R2-09 | 2 | **2.20** | Small UI parity fix |
| 14 | Locale-dedupe after freeze may drop one of two existing localized alternate routes | P3 | 0.55 | IF-04, R2-05 | 2 | **1.38** | Low-confidence edge; test before code |

## Recommended fix order

1. **Unify generation-mode resolution** in `orchestrate.ts` and add the P26 regression test (`persistedScaffoldId` + `previousFilesCount: 0`).
2. **Make repair pass identity monotonic** or prune by current `logPassId` / pass family after clean repair.
3. **Preserve or seed `briefSummary`** in snapshot merges; add null-clobber regression test.
4. **Decide status source**: wire event projection to UI or explicitly keep DB flags as source until transport exists.
5. **Complete lineage/dump fingerprint** for every field that changes dynamic prompt content.
6. **Follow-up parity fixes**: plan-mode lock fields, home-richness guard, wrapped prompt cap.

## Per-agent reports

| Agent | Focus |
|-------|-------|
| [R2-01](./agents/r2-01-mode-split-validation.md) | `generationMode` split-brain validation |
| [R2-02](./agents/r2-02-snapshot-clobber.md) | `briefSummary` null/shallow merge |
| [R2-03](./agents/r2-03-repair-index.md) | `repairPassIndex` and stale rows |
| [R2-04](./agents/r2-04-status-projection-ui.md) | DB flags vs event projection |
| [R2-05](./agents/r2-05-route-freeze.md) | route freeze / clear-redesign |
| [R2-06](./agents/r2-06-follow-up-home-regression.md) | follow-up home regression |
| [R2-07](./agents/r2-07-prompt-bloat.md) | handoff cap and `meta.brief` |
| [R2-08](./agents/r2-08-lineage-omissions.md) | lineage / dump omissions |
| [R2-09](./agents/r2-09-preview-pending-fallback.md) | preview pending fallback |
| [R2-10](./agents/r2-10-plan-mode-variant-lock.md) | plan-mode variant lock |
| [R2-11](./agents/r2-11-test-gap-mode-split.md) | test gap for mode split |
| [R2-12](./agents/r2-12-snapshot-test-gap.md) | test gap for snapshot null clobber |
| [R2-13](./agents/r2-13-stale-error-badges.md) | stale error badge broader check |
| [R2-14](./agents/r2-14-status-projection-actionability.md) | event projection wiring feasibility |
| [R2-15](./agents/r2-15-clear-redesign-semantics.md) | clear-redesign code/docs semantics |
| [R2-16](./agents/r2-16-path-normalization.md) | path normalization in follow-up merge |
| [R2-17](./agents/r2-17-brief-precedence.md) | `meta.brief` precedence / UI mitigation |
| [R2-18](./agents/r2-18-dynamic-context-hash-matrix.md) | DynamicContextOptions vs hash/dump |
| [R2-19](./agents/r2-19-light-followup-verifier.md) | light follow-up verifier skip |
| [R2-20](./agents/r2-20-scoring-rubric.md) | scoring proposal |

