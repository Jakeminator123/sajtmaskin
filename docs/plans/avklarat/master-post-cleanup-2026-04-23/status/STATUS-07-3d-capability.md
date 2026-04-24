# STATUS 07 - 3D capability injection (short, revised)

## Utfall

| Del | Status | Notering |
|---|---|---|
| Deterministisk dep-injection for `visual-3d` | Klar | `runAutoFix` injectar `three`, `@react-three/fiber`, `@react-three/drei` via capability-signal, utan LLM-beroende. |
| Extra warning for 3D-namnad cross-file stub utan capability | Klar | Extra warningrad skapas bredvid befintlig `merge:cross-file-stub`. |
| Sanity/regressiontester | Klar | Ny sanity-test for dossier->dep-flow + nya tester for 3D-stub-warning guardrails. |

## Faktiska kodandringar

| Fil | Andring |
|---|---|
| `src/lib/gen/autofix/dep-completer.ts` | Lade till capability->dependency-resolver for `visual-3d` och helper for package.json dependency-merge. |
| `src/lib/gen/autofix/pipeline.ts` | Tradar in `requestedCapabilities` i autofix-context och merger capability-deps i package.json. |
| `src/lib/gen/stream/finalize-version/pre-phases.ts` | Forwardar `requestedCapabilities` till `runAutoFix`. |
| `src/lib/gen/stream/finalize-version/runner.ts` | Extraherar capability-signal fran `orchestrationStreamMeta` (requestedCapabilities/briefSummary/fallback) och skickar till autofix. |
| `src/lib/providers/own-engine/generation-stream-post-finalize.ts` | Lagger extra 3D-stub-warning nar 3D-namn matchar men `visual-3d` saknas. |
| `src/lib/gen/autofix/dep-completer.test.ts` | Ny sanity-test for `visual-3d` -> dossier -> package.json dep-mutation. |
| `src/lib/providers/own-engine/generation-stream-post-finalize.test.ts` | Nya regressionstester for extra 3D warning och no-op nar `visual-3d` finns. |
| `src/lib/gen/stream/finalize-preflight.ts` | Mekanisk `prefer-const`-fix for att fa lint gron. |

## Explicit defer (inte gjort)

| Omrade | Status | Varfor defer |
|---|---|---|
| Tier-aware logic / question-classification | Inte gjort | Utanfor revised scope (framtida plan efter wave 5). |
| Andring av `selectDossiersForRequest` urvalslogik | Inte gjort | Befintlig deterministic selektion behalls. |
| Andring av capability-detection i plan-06-filer | Inte gjort | Hard constraint: detection-logik rordes inte. |
| Dossier-shell-redesign (`three-canvas-shell.tsx`) | Inte gjort | Ingen bekraftad bugg i shellen i denna leverans. |
| Prompt-redesign for 3D-scenkod | Inte gjort | Utanfor mekanisk plan-07-scope. |

## Planbekraftelse

Denna leverans foljer **short, revised** plan-07 och implementerar endast mekaniska hardening-steg. Ingen full/tier-aware expansion ar gjord.
