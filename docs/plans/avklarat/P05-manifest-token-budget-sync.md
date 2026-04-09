# P05: Manifest tokenBudget-synkronisering och modelljustering

## Problem 1: tokenBudget-diskrepans

`tokenBudgets` (top-level, rad 540-559) är den enda runtime-lästa sektionen.
Per-workload `tokenBudget` under `workloads[]` är bara dokumentation men är ur synk:

| Entry | tokenBudgets (runtime) | workloads (docs) |
|-------|------------------------|------------------|
| engine | 82768 | 82768 | OK |
| autofix | **24576** | **12288** | **Ur synk** |
| assist | 82768 | 82768 | OK |

`load-manifest.ts` läser INTE `workloads[].tokenBudget` för runtime; den läser bara
`tokenBudgets.*` och `postGenerationPasses.*`. Så detta är inte en runtime-bugg,
men dokumentationen vilseleder.

## Fix

**Alternativ A (rekommenderat):** Synka workloads-entries till samma defaults som top-level.
**Alternativ B:** Ta bort `tokenBudget` från workloads-entries helt (de läses aldrig av kod).

## Problem 2: gpt-4o-mini → gpt-5-mini

Tre workloads använder `gpt-4o-mini` (äldre modell):
- `project_analyze` → defaultModel `"gpt-4o-mini"`
- `inspector_ai_match` → defaultModel `"gpt-4o-mini"`
- `analyze_presentation` → fallbackModels `["gpt-4o-mini"]`

`gpt-5-mini` används redan av wizard/enrich, competitors, company-lookup.
Bör uppgraderas för enhetlighet.

## Filer

- `config/ai_models/manifest.json` — workloads-entries + tokenBudgets
- `src/lib/gen/defaults.ts` — fallback-strängar (matchar redan manifest via getter)

## Verifiering

- `manifest-parity.test.ts`
- `npm run typecheck`

## Status

**Klar.** Autofix workload tokenBudget synkad till 24576. gpt-4o-mini ersatt med
gpt-5-mini i project_analyze, inspector_ai_match och analyze_presentation fallback.
Tester gröna.

## Prioritet

Medel — dokumentationskvalitet + modellenhetlighet.
