# Glossary — Sajtmaskin

Kort ordlista för termer som lätt blandas ihop. Bara begrepp som återkommer i flera docs/kodytor hör hemma här.

## Kärntermer

| Term | Kort |
|---|---|
| own-engine | Sajtmaskins egna codegen-flöde för buildern. |
| Init | Första riktiga genereringen i en chat. Väljer grund. |
| Follow-up | Delta på befintlig version. Ska bevara grund om inte användaren ändrar den. |
| Deep Brief | Init-brief: strukturerad sajtbrief före orkestrering. |
| Snapshot-Brief | Kompakt follow-up-brief från tidigare orchestration snapshot. |
| Scaffold | Runtime-startpunkt för projektet. |
| Scaffold Variant | Visuellt uttryck inom scaffold: typografi, theme, motif, prompt hints. |
| Variant-Lock | Follow-up återanvänder tidigare variant för att undvika design drift. |
| Capability | Intentnyckel som kan mappas till dossier, t.ex. `auth`, `payments`, `visual-3d`. |
| Dossier | Återanvändbar capability-modul med manifest, instruktioner och ev. filer. |
| BuildSpec | Runtime-policy för generationens scope, kvalitet, preview, verifiering och budget. |
| Dynamic Context | Request-specifik promptdel. |
| Core Rules | Statiska produktregler i `config/prompt-core/`. |
| System Prompt | Core Rules + Dynamic Context. |
| F2 / fidelity2 | Design/preview-läge. |
| F3 / fidelity3 | Integration/build/deploybarhetsläge. Explicit steg. |
| Preview / VM / preview_host | Live-runtime för iteration. Inte samma sak som deploy. |
| Normalize | Mekanisk kodstädning före LLM: URL-expansion, deterministiska fixers och diagnostikdriven import-repair. |
| RepairGate | Den enda LLM-repair-porten i finalize när Normalize och statiska kontroller lämnar residual. |
| RenderGate | F2-gate som bevisar att preview bootar/renderar; typecheck är Advisory utom render-risk-koder. |
| ReleaseGate | F3-gate för explicit integration/build/deploybarhet: typecheck, build, lint och env-krav är strikta. |
| Advisory | Synlig varning/degradation som inte blockerar promote/preview. |
| Blocker | Fel som stoppar promote, preview eller F3-release tills det är åtgärdat. |
| CapabilitySmoke | Capability-specifik DOM/render-smoke, t.ex. F2-kontroll av navigation, CTA, formulär och runtime-krasch. |
| Safe/risky autofix | Riskklass för Normalize-fixar: `safe` = smal hygienfix, `risky` = struktur-, cross-file-, dependency- eller LLM-mutation som behåller verifier-behov. |
| Finalize | Steget som gör LLM-output körbar, reparerad, verifierbar och sparbar. |
| Preflight | Teknisk kontroll före preview/persist/promote. |
| EngineEvent | Append-only runtime-händelse för versionens livscykel. |
| VersionStatus | UI-/API-projektion av EngineEvents och terminal DB-state. |
| Fast Edit Lane | Exakt deterministisk filändring utan LLM, sparad som minor-version. |
| Minor-version | Quick-edit-version under en major, t.ex. `v3.1`. |
| False-green | Systemet visar grönt trots blocker/degradation. Ska undvikas. |

## Kontrollbegrepp och kod-legacy

Kanoniska namn ovan styr docs och löptext. Kod-identifierare och telemetri-nycklar behåller legacy-namnen; mappa dem i text i stället för att döpa om dem.

| Kanoniskt | Betyder | Absorberar/mappas mot (kod-legacy, behålls i kod) |
|---|---|---|
| Normalize | Mekanisk kodstädning före LLM. | autofix, mekanisk autofix, url-expand, deterministisk import-repair |
| RepairGate | Enda LLM-repair-porten. | runLlmRepairGate/RepairLedger, LLM-fix, syntax-fixer, verifier-fixer, server-repair-LLM |
| RenderGate | F2: preview bootar/renderar; typecheck Advisory utom render-risk-koder. | quality gate (designPreview), preview-check |
| ReleaseGate | F3: typecheck + build + lint + env, strikt, explicit. | quality gate (integrationsBuild), build gate, readiness |
| Advisory | Synligt men ej blockerande. | warning, soft fail, degraded/typecheck_advisory |
| Blocker | Stoppar promote/preview. | hard fail, blocking, preview-blocking |
| CapabilitySmoke | Capability-specifik DOM/render-smoke. | product postcheck |

## Namnskuggor

| Säg inte bara | Skriv hellre |
|---|---|
| brief | `Deep Brief` eller `Snapshot-Brief` |
| context | `Dynamic Context` när promptblocket avses |
| contracts | `Contract Plan` eller `Orchestration Contract` |
| quality gate | `RenderGate` för F2 eller `ReleaseGate` för F3 |
| autofix | `Normalize`; `RepairGate` när en LLM-repair avses |
| warning / soft fail / degraded | `Advisory` |
| blocking / hard fail | `Blocker` |
| product postcheck | `CapabilitySmoke` |
| sandbox | `preview`, `VM` eller `preview_host` |
| template-library | `Scaffold`, `Dossier` eller `Mallar-tab` beroende på kontext |
| shadcn | `shadcn primitive` eller `UI Recipe` |
| 3D/game | `visual-3d`, `physics-3d` eller `interactive-game` |

## Legacy / undvik i ny text

| Undvik | Använd |
|---|---|
| AI Gateway | Direkt provider / modellregistry |
| Vercel Sandbox som preview | VM / `preview_host` |
| `demoUrl` för own-engine preview | `previewUrl` |
| Spec-first-kedjan | Deep Brief + orchestration |
| Directive Cascade | Core Rules + Dynamic Context + signalägare |
| `serverVerify` som quality-gate-lane | `RenderGate` (`designPreview`) eller `ReleaseGate` (`integrationsBuild`) |
