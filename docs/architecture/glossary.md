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
| Dossier | Återanvändbar capability-modul med manifest, instruktioner och ev. filer (`data/dossiers/{hard,soft}/`). Injiceras i own-engine-prompten. **Inte** en galleri-mall. UI-label (builderns "Dossiers"-panel): **"Byggblock"** — kodidentifierare, filnamn och API-routes behåller `dossier`-namnet. |
| Version-presence | Filbevis för dossiers: en dossier "finns i versionen" när dess server-filer (och minst en särskiljande fil) ligger i versionens `files_json` (`version-presence.ts`). Snapshot ∪ presence är den kanoniska "valda dossiers"-signalen för panel, readiness, finalize-design, F3-gate och deploy. |
| F3 capability-scope | F3-filter i orchestrate (`scopeF3DossierCapabilities`): bygget wirar bara capabilities från aktuellt meddelande ∪ godkända providers (durabelt via `f3ApprovedCapabilities` i snapshoten) ∪ filbevis. Golvet (can-only-grow) körs fortfarande — scopet FILTRERAR efteråt, enbart i F3. Spekulativa brief-/golv-capabilities droppas (`f3_capability_scope_dropped`). |
| Mock mode (dossier) | Deklarativt `mock`-fält (`canned`/`seed`/`success`/`none`) på hard-dossiers som beskriver hur den visuella ytan fungerar i F2/preview utan riktig nyckel. Driver dossierns egen degraderingskod + en promptrad (`describeMockMode`). F2-only, aldrig persisterat/deployat. Utelämnat = `none`. |
| Template (v0-mall) | Färdig v0-mall i galleriet (`/templates`, builderns Mallar-tab). "Templates" och "v0-mallar" är samma sak. Blob är enda källan i prod; importeras verbatim, ingen LLM vid init. Inte scaffold, inte dossier. |
| Template-referens | Klonat upstream-repo under `data/template-references/` — input till **dossier**-kuration (AI-utkast), hör inte till template-galleriet trots namnet. |
| BuildSpec | Runtime-policy för generationens scope, kvalitet, preview, verifiering och budget. |
| Dynamic Context | Request-specifik promptdel. |
| Core Rules | Statiska produktregler i `config/prompt-core/`. |
| System Prompt | Core Rules + Dynamic Context. |
| F2 / fidelity2 | Design/preview-läge. |
| F3 / fidelity3 | Integration/build/deploybarhetsläge. Explicit steg. |
| dossierEnvScope | Preflight-scope som gör `env.example` dossier-scopad: bara valda dossiers env-nycklar (+ projekt-lager) listas i stället för hela placeholder-katalogen. Skickas alltid från `preflight-phase.ts`. |
| pipeline-authored `.env.local` | Placeholder-`.env.local` som Sajtmaskins scaffold-merge själv injicerar i genererade projekt, identifierad via markörraden `PIPELINE_ENV_LOCAL_MARKER` (`env-local.ts`). Räknas ALDRIG som modell-emitterat "generated"-lager — annars läcker hela katalogen förbi `dossierEnvScope` och skuggar användarens env-panel-värden i preview. |
| buildBlockingKeys | Okonfigurerade env-nycklar vars dossier-`enforcement` är `build` — den enda uppsättningen som hård-blockerar F3-publicering (deploy-409 / readiness). Efter #468 i praktiken bara `clerk-auth`s nycklar. `feature-runtime`/`warn-only`/placeholder blockerar aldrig. |
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
| Error-log RAG | TF-IDF-retriever över historiska fault/fix-events. Init och follow-up injicerar `### Lessons from similar past builds` i system-prompten via cosine similarity på term-frekvenser. **Inte** embeddings/pgvector. I prod är indexet cross-tenant (rå `faultText` redakteras i renderingen). Styrs av `FEATURES.useErrorLogRag` (`NODE_ENV !== 'test'`). |

## Publicering och URL-nivåer

| Term | Kort |
|---|---|
| `previewUrl` | Nivå 1: VM-/preview_host-länken ("Öppna" under bygge). Delbar via Publik preview, men aldrig "publicerad sajt". |
| `liveUrl` | Nivå 2: stabil publicerad produktions-URL för en användarsajt. En per projekt; uppdateras vid ompublicering, byts inte. |
| `customDomain` | Nivå 3: kundens egen domän, kopplad till samma hosting-projekt som `liveUrl`. |
| Publicera | Deploy av aktuell version till produktion (skapar/uppdaterar `liveUrl`). Inte GitHub, inte domänköp. |
| Domänkoppling | Koppla + verifiera en domän mot kundprojektets hosting. Skilj från domänköp, som sker hos extern leverantör (Loopia m.fl.). |
| GitHubExport | Valfri export av en versions filer till användarens GitHub-repo (user eller org). Power-user-flöde, inte en del av Publicera. |
| SEO (release) | Release-feature: deterministisk SEO-injektion vid publicering via `applySeoToProjectFiles` (robots, sitemap, opengraph, layout-metadata) + brief-guidning. Tillhör F3/publicera-livscykeln. **Inte** en dossier/capability-modul. |

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
| template-library | `Scaffold`, `Dossier` eller `Template (v0-mall)` beroende på kontext |
| mall / template (ospecificerat) | `Template (v0-mall)` för galleriet · `Scaffold` för runtime-startpunkt · `Dossier` för capability-modul · `Template-referens` för dossier-kurationsinput |
| shadcn | `shadcn primitive` eller `UI Recipe` |
| 3D/game | `visual-3d`, `physics-3d` eller `interactive-game` |
| preview (om Vercels deploy-previews) | `Vercel deploy-preview` — reservera "preview" för VM-previewn |
| publicerad | bara när `liveUrl` finns; en delad `previewUrl` är inte "publicerad" |
| Vercel i användar-copy | skriv leverantörsneutralt ("publicera", "hosting", "domän") — Sajtmaskin är varumärket; Vercel är infrastruktur |

## Legacy / undvik i ny text

| Undvik | Använd |
|---|---|
| AI Gateway | Direkt provider / modellregistry |
| Vercel Sandbox som preview | VM / `preview_host` |
| `demoUrl` för own-engine preview | `previewUrl` |
| Spec-first-kedjan | Deep Brief + orchestration |
| Directive Cascade | Core Rules + Dynamic Context + signalägare |
| `serverVerify` som quality-gate-lane | `RenderGate` (`designPreview`) eller `ReleaseGate` (`integrationsBuild`) |
