# Agent IF-08 - Lineage hash / prompt-dump reproducibility

## Findings

| Severity | Location | Bug / risk | Confidence |
|----------|----------|------------|------------|
| High | `src/lib/gen/generation-input-package.ts` | `computeLineageHash` omits follow-up-critical dynamic state (`capabilityModifyHint`, dossier selection, requested capability tiers, orchestration contract). Same lineage can hide different dynamic prompt. | 88% |
| High | `src/lib/gen/generation-input-package.ts` | `serializePackageForDump` mirrors the same omissions, so prompt dump does not capture all state that shaped `buildDynamicContext`. | 90% |
| Medium | `src/lib/api/engine/chats/follow-up-orchestration-input.ts` | Follow-up hashes wrapped/optimized prompt, not raw user intent; useful as package fingerprint, misleading as user-intent A/B key. | 82% |
| Medium | `src/lib/gen/prompt-dump.ts` | Prompt dumps overwrite fixed filenames (`latest.md`, `generation-input-package.json`, `full-system.md`) so init/follow-up evidence is lost unless copied immediately. | 95% |
| Low | `src/lib/gen/stream/finalize-version/verifier-phase.ts` | Verifier/fixer error log events use `lineageHash: null`, reducing correlation with generation package. | 92% |

## Evidence

`computeLineageHash` hashes prompt, brief, scaffold context, route plan, contracts, BuildSpec, theme/palette/refs and variant id, but not the follow-up modify/dossier state. `buildGenerationInputPackage` passes the same limited set.

Follow-up orchestration stores both `prompt: optimizedMessage` and `rawPrompt`, but the lineage hash uses only `input.prompt`.

`prompt-dump.ts` documents fixed overwrite behavior.

## Suggested fixes

1. Extend lineage and dump serialization with stable follow-up signals: capability modify hints, dossier ids, requested capability tiers, generation mode, scaffold/variant lock fields.
2. Add `rawPrompt` to the lineage hash or rename lineage semantics to "wrapped package fingerprint".
3. Write per-run or per-lineage prompt dump folders when prompt dump is enabled.
4. Thread `lineageHash` into verifier/fixer error log events.

**Model:** composer-2-fast (subagent)
