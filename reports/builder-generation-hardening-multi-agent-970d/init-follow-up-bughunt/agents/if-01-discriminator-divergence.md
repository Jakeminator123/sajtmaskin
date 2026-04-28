## Agent IF-01 — Init/follow-up discriminator divergence

### Findings

| Severity | Location | Bug / risk | Confidence |
|----------|----------|------------|------------|
| **P1** | `src/lib/gen/orchestrate.ts:408-414`, `src/lib/gen/orchestrate.ts:766-779` | `resolveOrchestrationBase` resolves mode from `deriveFollowUpStateFromInputs(...)`, while `finalizeOrchestrationPrompts` defaults to follow-up when `persistedScaffoldId` exists. With `persistedScaffoldId` + `previousFilesCount === 0` + omitted `generationMode`, BuildSpec/route/scaffold context can be **init** while system prompt / variant lock is **follow-up**. | **92%** |
| **P2** | `src/lib/gen/orchestrate.ts:149-153`, `src/lib/gen/orchestrate.ts:408-414` | `OrchestrationInput.generationMode` comment says default derives from `persistedScaffoldId`, but implementation uses previous-files predicate with legacy fallback only when count is omitted. | **88%** |
| **P3** | `src/lib/api/engine/chats/chat-message-stream-post.ts:1172-1175` | `resolveOwnEngineMaxSteps` uses `hasFollowUpBase`, which can diverge from orchestration mode in edge cases. | **70%** |

### Evidence

The same orchestration request can route through two mode formulas:

- Base: `generationMode ?? (isOrchestrationFollowUp ? "followUp" : "init")`
- Final prompt context: `generationMode ?? (input.persistedScaffoldId ? "followUp" : "init")`

`follow-up-orchestration-input.ts` only sets `generationMode: "followUp"` when `hasFollowUpBase` is true, leaving the split-brain edge possible for first codegen / contract-gated chats.

### Suggested fixes

1. Compute one `resolvedGenerationMode` once and pass it into both `resolveOrchestrationBase` and `finalizeOrchestrationPrompts`.
2. Update `OrchestrationInput` comments to match the real predicate.
3. Feed the same resolved boolean into `resolveOwnEngineMaxSteps`.

**Model:** composer-2-fast (subagent)
