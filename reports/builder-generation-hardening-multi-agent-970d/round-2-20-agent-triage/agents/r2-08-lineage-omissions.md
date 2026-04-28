## R2-08 — Lineage omissions validation

### Verdict

Mostly validated: `lineageHash` / dump omit prompt-shaping fields such as `capabilityModifyHint`, `dossierSelection`, `componentReferences`, `designThemePreset`; `requestedCapabilityTiers` is lower impact because it is not currently rendered into dynamic context.

### Evidence

| Area | Code fact |
|------|-----------|
| Hash inputs | `src/lib/gen/generation-input-package.ts` hashes prompt, brief, scaffold context, route plan, build spec, theme/palette/refs, variant; no dossier/modify/component refs |
| Dynamic context | `build-dynamic-context.ts` renders dossier blocks, capability modify hint, component references |
| Dump | `serializePackageForDump` omits same fields and also omits some hash inputs |

### Severity / confidence

P2, confidence 90%. Observability / reproducibility bug, not direct user-facing failure.

### Minimal fix

Add every dynamic prompt-shaping field to `computeLineageHash` and `serializePackageForDump`; use stable fingerprints for large dossier payloads.

### Triage tags

`lineage`, `observability-gap`, `prompt-dump`, `dossier-pipeline`

**Model:** composer-2-fast (subagent)
