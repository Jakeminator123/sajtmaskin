## R2-01 — generationMode split-brain validation

### Verdict

**Bug.** `resolveOrchestrationBase` and `finalizeOrchestrationPrompts` can resolve different modes for the same input.

### Evidence

| Area | Code fact |
|------|-----------|
| Base | `orchestrate.ts` uses `deriveFollowUpStateFromInputs` with `previousFilesCount`. |
| Final prompt | `finalizeOrchestrationPrompts` falls back to `persistedScaffoldId ? "followUp" : "init"`. |
| Trigger | `persistedScaffoldId` set, `previousFilesCount === 0`, `generationMode` omitted. |

### Severity / confidence

P1/P2 boundary, **90%** confidence.

### Minimal fix idea

Compute `resolvedMode` once or reuse the exact predicate in both phases.

### Triage tags

`mode-split-brain`, `variant-planner-drift`, `route-freeze-delta`

**Model:** composer-2-fast (subagent)
