# R2-18 — Dynamic context vs lineage/dump matrix

## Verdict

**Bug:** `computeLineageHash` och `serializePackageForDump` täcker inte flera fält som faktiskt renderas i dynamic context. Störst: `dossierSelection`, `capabilityModifyHint`, `componentReferences`, `designThemePreset`.

## Evidence

| Field | Prompt effect | Hash/dump |
|---|---|---|
| `dossierSelection` | `renderDossierBlocks` | saknas |
| `capabilityModifyHint` | `renderCapabilityModifyHintBlock` | saknas |
| `componentReferences` | `renderComponentReferencesBlock` | saknas |
| `designThemePreset` | Visual identity text | saknas i hash/dump |
| `imageGenerations` | unused | info only |

## Severity / confidence

**P2 / 92%** för dossier + capability modify; **P2 / 88%** för component references.

## Minimal fix

Utöka hash + dump med stabil serialisering av alla prompt-shaping fields; spegla även hash-inputs som dumpen saknar.

## Triage tags

`lineage`, `observability-gap`, `prompt-bloat`

**Model:** composer-2-fast
