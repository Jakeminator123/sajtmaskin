## Agent IF-03 — Scaffold/variant freeze bugs

### Findings

| Severity | Location | Bug / risk | Conf. |
|----------|----------|------------|-------|
| High | `src/lib/gen/orchestrate.ts` | Same split-brain as IF-01: base mode can be `init` while finalized prompt/variant path acts `followUp`. | 88% |
| Medium | `src/lib/api/engine/chats/follow-up-orchestration-input.ts` | Plan mode returns `commonInput` before adding `persistedVariantId`, `followUpIntent`, `chatId`; planner can drift variant while codegen locks. | 85% |
| Medium | `src/lib/api/engine/chats/chat-message-stream-post.ts` | `snapshotVariantId` only read from `orchestration_snapshot.variantId`; code comment notes no history fallback. Missing snapshot can default to stable but wrong variant after restart/pre-tracking chats. | 75% |
| Low | `src/lib/gen/orchestrate.ts` | Manual scaffold request may be ignored when `persistedScaffoldId` exists unless ignore flag is set; may be intentional. | 60% |

### Evidence

- `finalizeOrchestrationPrompts` uses `generationMode ?? (input.persistedScaffoldId ? "followUp" : "init")`.
- `buildFollowUpOrchestrationInput` returns early for `mode === "plan"` before lock-specific fields.
- Code comment near `snapshotVariantId` explicitly mentions missing fallback from event history.

### Suggested fixes

1. Share one resolved mode between base and finalized prompt context.
2. Pass `persistedVariantId`, `followUpIntent`, `chatId` in plan mode too.
3. Implement snapshot variant fallback or persist variant in a stable row/field.

**Model:** composer-2-fast (subagent)
