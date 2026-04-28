## R2-10 — Follow-up plan mode vs frozen variant

### Verdict

**Validated.** Follow-up plan path builds `OrchestrationInput` without `persistedVariantId`, `followUpIntent`, and `chatId`; codegen path includes them. Planner context can therefore drift from frozen codegen variant.

### Evidence

| Area | Evidence |
|------|----------|
| Plan early return | `src/lib/api/engine/chats/follow-up-orchestration-input.ts` returns `commonInput` for `mode === "plan"` before adding lock/intent fields. |
| Codegen parity | Codegen branch adds `persistedVariantId`, `chatId`, `followUpIntent`, contracts, prior quality target. |
| Orchestrate effect | `finalizeOrchestrationPrompts` uses those fields for `lockedVariantForFollowUp`. |
| Tests | Existing tests require plan mode to omit codegen-only keys, encoding current drift. |

### Severity / confidence

**P2**, confidence **90%**.

### Minimal fix

Treat variant/intent lock fields as shared follow-up context, not codegen-only; update tests accordingly.

### Triage tags

`variant-planner-drift`, `mode-split`, `route-freeze`

**Model:** composer-2-fast (subagent)
