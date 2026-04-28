# R2-05 - Route freeze / clear-redesign

**Verdict:** one concrete plan-mode bug plus route-freeze ambiguity.

| Finding | Severity | Confidence | Tags |
|---------|----------|------------|------|
| Plan mode strips `followUpIntent`, so `clear-redesign` does not reach variant-lock semantics in planning | P2 | 90% | `variant-planner-drift`, `route-freeze-delta` |
| `clear-redesign` does not unfreeze routes because `buildRoutePlan` has no `followUpIntent` parameter | P2/P3 | 75% | `route-freeze-delta` |
| Locale dedupe can drop one of two existing locale alternate routes after freeze | P3 | 45% | `route-freeze-delta`, `low-confidence` |

**Evidence:** `buildFollowUpOrchestrationInput` plan mode returns common input before codegen fields; `finalizeOrchestrationPrompts` uses `followUpIntent ?? "neutral"` for variant lock; `buildRoutePlan` keys freeze only on `generationMode` + `existingRoutePaths`.

**Minimal fix:** include `followUpIntent` in plan input; decide whether `clear-redesign` should route-unfreeze or only scaffold/variant-unfreeze and update code/docs accordingly.

**Model:** composer-2-fast
