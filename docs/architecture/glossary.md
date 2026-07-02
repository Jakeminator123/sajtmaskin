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
| Mekanisk autofix | Deterministiska fixers. |
| LLM-fix | Modellbaserad reparation när mekanik inte räcker. |
| Finalize | Steget som gör LLM-output körbar, reparerad, verifierbar och sparbar. |
| Preflight | Teknisk kontroll före preview/persist/promote. |
| Quality Gate | Pass/fail/degraded-gräns för preview eller integration build. |
| EngineEvent | Append-only runtime-händelse för versionens livscykel. |
| VersionStatus | UI-/API-projektion av EngineEvents och terminal DB-state. |
| Fast Edit Lane | Exakt deterministisk filändring utan LLM, sparad som minor-version. |
| Minor-version | Quick-edit-version under en major, t.ex. `v3.1`. |
| False-green | Systemet visar grönt trots blocker/degradation. Ska undvikas. |

## Namnskuggor

| Säg inte bara | Skriv hellre |
|---|---|
| brief | `Deep Brief` eller `Snapshot-Brief` |
| context | `Dynamic Context` när promptblocket avses |
| contracts | `Contract Plan` eller `Orchestration Contract` |
| quality gate | `F2/designPreview gate` eller `F3/integrationsBuild gate` |
| autofix | `mekanisk autofix` eller `LLM-fix` |
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
| `serverVerify` som quality-gate-lane | `designPreview` eller `integrationsBuild` |
