# Agent IF-10 — World-class init/follow-up bug risks

## Findings

| Severity | Location | Bug / risk | Confidence |
|----------|----------|------------|------------|
| High | `src/app/builder/BuilderShellContent.tsx`; `src/components/builder/VersionHistory.tsx` | Primary UI derives badges/labels from DB `verificationState` / `releaseState`, while event-bus projection exists but is not used in product UI. This risks stale `Fel` / wrong phase vs actual event truth. | 90-95% |
| Medium-High | `src/lib/gen/verify/repair-loop.ts`; `src/lib/gen/autofix/llm-repair-gate.ts` | `runLlmFixer` is called directly in repair loop outside `runLlmRepairGate`, so timeout/recurring-pattern behavior differs by path. | 85% |
| Medium-High | `verifier-phase.ts`, `partial-file.ts`, `finalize-preflight.ts`, `validate-and-fix.ts` | Several LLM repair gate entrypoints remain; ordering is not one orchestrated repair contract. | 88% |
| Medium | `src/lib/gen/stream/finalize-version/policy.ts` | `light_followup_fast_policy` skips deep finalize path, so verifier often does not run on light follow-ups. | 80% |
| Medium | `src/lib/api/engine/chats/chat-message-stream-post.ts` | `clear-redesign` runs server auto-brief, a fuller brief path than the follow-up target of snapshot inheritance + delta refresh. | 70% |
| Low-Medium | `src/lib/gen/system-prompt/sections/routing-and-tooling.ts` | Follow-up route block can still emit init-flavored wording like fully realize all planned routes. | 65% |

## Evidence

- `selectVersionStatus` appears to be used in tests/comments, not product UI.
- Repair loop directly invokes `runLlmFixer` while `llm-repair-gate.ts` wraps the same fixer with gate behavior.
- Verifier policy returns `run: false` when deep path is skipped.

## Suggested fixes

1. Productize `selectVersionStatus(versionEvents)` for builder status, or document DB flags as source-of-truth until projection is wired.
2. Route all LLM repairs through `runLlmRepairGate` or one higher-level repair orchestrator.
3. Decouple a cheap follow-up verifier from full deep path, if F2 requires verifier signal.
4. For follow-up route prompts, replace init route-realization wording with frozen-route / delta wording.

**Model:** composer-2-fast (subagent)
