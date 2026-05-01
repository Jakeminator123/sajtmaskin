# Bug-backlog (konsoliderad)

Kanonisk lista efter sammanslagning av de tidigare rålistorna: `BUG-SWARM-BACKLOG-MASTER.md`, `BUG-SWARM-BACKLOG.md` och `gpt_sammanställnin.txt`. De rålistorna är borttagna; den här filen är nu enda aktiva backloggen.

## Legend

| Markering | Status | Regel |
| --- | --- | --- |
| `[x]` | Avslutad | Läs `Status`-kolumnen för om raden är `Fixad`, `Fixad i HEAD` eller `Inte bug`. |
| `[ ]` | Öppen | Bug, risk eller städpunkt som inte ska bockas av förrän den är verifierad/fixad. |

Källor: `G#` = gamla GPT/masterlistan, `U#` = gamla UI/media-svärmlistan, `N#` = inkommande defensiv triage 2026-05-01, `R#` = äldre kodrapport inskickad 2026-05-01.

Defensiv triage använder samma backlogg-system men med en extra bedömning:

| Bedömning | Regel |
| --- | --- |
| Bekräfta | Kod/docs visar ett reellt kvarvarande problem eller en tydlig regression-gate. Behåll som aktiv rad. |
| Edge | Plausibelt men behöver reproduktion eller smal verifiering. Behåll som verifieringsrad, inte byggblocker. |
| Avfärda / kassera | Dubblett, redan fixat, by-design eller inte ett relevant edge case. Räkna inte som aktiv buggrisk. |

## Triage för nästa agent

| Grupp | Antal | Hantering |
| --- | ---: | --- |
| Totalt | 129 | Alla rader i tabellen nedan. |
| Avslutade (`[x]`) | 65 | Filtrera bort från aktiv bugfix. |
| Öppna (`[ ]`) | 64 | Kandidater för fortsatt triage/fix. |
| Explicit `Inte bug` | 13 | Avskrivna eller naming/copy/fallback-beslut; ska inte räknas som aktiv buggrisk. |

| Aktiv prioritet | Kvar | Kommentar |
| --- | ---: | --- |
| P0 | 0 | Inga kvarvarande P0-rader. |
| P1 | 3 | Autofix-stubbar, F2 runtime/UI-smoke och simplified-brief kvalitet. |
| P2 | 18 | F3/dossier/env/verify/policy-risker + follow-up-budget/status-projektion. |
| P3 | 43 | UI-race, cache/search/scrape, copy/naming/städ. |

### Avskrivet / inte bug

| Källa | Fynd | Bedömning |
| --- | --- | --- |
| G#6 | Dep-completer missar CSS/`require()`/dynamic import | Inte bug / fixad; test täcker fallen. |
| G#23 | `feature-runtime` env keys blockerar inte F3 | Inte bug / beslutad arkitektur; bara `build`-enforcement blockerar. |
| G#41, G#42 | `/api/v0/*` finns kvar | Inte bug; API-version/naming debt. |
| G#43, U#40 | `TemplateCatalogSource = "v0"` | Inte bug; naming debt. |
| G#44 | `ModelProviderFamily` innehåller `v0` | Inte bug; naming debt. |
| G#45, U#76 | `demoUrl`, `webhook:v0`, `v0-catalog` kvar | Inte bug; terminologistäd senare. |
| G#69, U#25 | Unsplash `placehold.co` fallback | Inte bug / fallback. |
| G#72, U#67, U#68 | Date formatting locale/timezone varierar | Inte bug; rapportpolicy. |
| U#8 | F3PlaceholderToggle saknar skeleton | Inte bug; UX debt/polish. |
| U#22 | Transcribe accepterar `video/mp4` | Inte bug; Whisper hanterar video-containers. |
| U#26 | Unsplash POST gör upp till 3 externa sökningar | Inte bug; redan hårt cappad. |
| U#48 | OpenClaw tips kräver modul-restart | Inte bug; modul-init-beteende. |
| U#74 | Shadcn category emojis enterprise | Inte bug; copy/brand-städ. |

### Öppen men inte akut bug

| Källa | Fynd | Typ |
| --- | --- | --- |
| G#18 | Dubbla env-docs och genererad `.env.local`-sanning | Docs-städ. |
| G#55 | `/api/ai/spec` naming debt | Naming debt. |
| G#58, U#80 | "Bygg nu" / "F3" / "Bygg integrationer" copy-blandning | Copy-/terminologistäd. |
| U#23 | Transcribe språkfallback bara sv/en | Produkt-gap. |
| U#63 | Backoffice domain-map / manuella paths | Backoffice-städ. |
| U#66 | `console.info` hot paths brus | Logg-städ. |

## Defensiv nytriage 2026-05-01

Inkommande rapporten pekar främst på falskt gröna states. Raderna nedan är inte en ny separat backlogg; de mappar till huvudlistans källor och anger om fyndet ska bekräftas, hållas som edge-verifiering eller kasseras.

| Källa | Inkommande fynd | Backlogg-koppling | Defensiv koll | Beslut |
| --- | --- | --- | --- | --- |
| N#1 | Autofix-stubbar / tomma ersättningsfiler | Ny P1-rad | Bekräfta | `cross-file-import-checker.ts` har fortfarande PascalCase null-render fallback och TODO för dossier-exposed path-stubbar. Inte kassera: vägra dossier-stubbar eller markera dem blocker/degraded. |
| N#2 | Capability/dossier single source | G#25, G#26 | Bekräfta | Dossier-pipen är default-on, men init/follow-up och capability-bridge ska verifieras mot en canonical källa. |
| N#3 | Follow-up context-budget | Ny P2-rad | Bekräfta som regression-gate | `eval:followup` och budgetering finns, men backloggen behöver en gate så budgeten inte växer igen. |
| N#4 | Tysta verify-skips | G#10, G#31, G#32 | Bekräfta | R2-guard hjälper, men warm/cold cache och runtime/UI-gap är fortfarande falskt-grönt-risker. |
| N#5 | Recurring verifier-fynd in i nästa prompt | Ny P2-rad | Bekräfta | Finns kvar som E3 i `Kvarvarande-uppgifter.md`; inte duplicerat i huvudlistan förrän nu. |
| N#6 | Event-bus UI-flip | Ny P2-rad | Bekräfta | `selectVersionStatus(events)` finns, men builder-UI importerar fortfarande äldre DB-statusresolver på centrala ytor. |
| N#H1 | Full testsvit / stale `domain-map.json` | G#3 | Bekräfta tills testsvit passerar | Håll P0 tills full suite visar om fixture-driften är borta; om pass: stäng som fixad. |
| N#H2 | F3 readiness truth | G#20, G#21 | Bekräfta | `/finalize-design` har `ready: true` när inga requirements detekteras; edge är om follow-up missar integrationkrav. |
| N#H3 | Product Postcheck default i preview/staging | G#10 | Bekräfta | Product Postcheck är flaggstyrd default-off och fail-open; produktifiering hör till runtime/UI-gaten. |
| N#H4 | Placeholder/degraded-state policy | G#17, G#22, G#35, G#51, U#29 | Bekräfta som policyspår | Dubblett över flera rader, men behåll som sammanhållande policy: placeholder får inte signalera success. |
| N#H5 | UI race cleanup | U#4, U#5, U#6, U#7, U#9 | Edge | Håll som P3-verifieringar. Kassera enskild rad om kodläsning visar abort/token redan finns eller repro saknas efter smal test. |

### Äldre rapportöverlapp 2026-05-01

Den här rapporten var delvis äldre än nuvarande HEAD. Raderna nedan är kritiskt mappade: redan fixade saker blir inte nya aktiva buggar.

| Källa | Inkommande fynd | Backlogg-koppling | Defensiv koll | Beslut |
| --- | --- | --- | --- | --- |
| R#1 | `/api/domains/save` owner-check | G#2 | Avfärda som aktiv bug | Redan fixad i HEAD via scoped deployment-helper + test. |
| R#2 | `/api/company-profile?companyName=` scope | G#4 | Avfärda som aktiv bug | Redan fixad: `companyName` går via `getCompanyProfileByNameForOwner(...)` med user/session-scope. |
| R#3 | `/api/download` legacy owner-scope | G#1 | Avfärda som aktiv bug | Redan fixad: legacy-routen använder `getEngineVersionForChatByIdForRequest(...)`. |
| R#4 | Engine download-route | Ingen aktiv rad | Avfärda | Ej bugg; route använder redan tenant-scoped helper. |
| R#5 | Preview update + `.env.local` | G#8, G#9 | Avfärda som aktiv bug | Redan markerad fixad: update-path bygger om `.env.local` innan preview-host update. |
| R#6 | F2 "grön" men runtime/UI-problem | G#10, N#4, N#H3 | Bekräfta | Fortfarande design-risk: F2 behöver runtime smoke/Product Postcheck som inte är default blockerande. |
| R#7 | F3 env resolver överkrav/stale snapshot | G#20, G#21, G#25 | Edge | Resolvern är inte längre ren hard-registry; fokusera på snapshot-färskhet och follow-up-detektion. |
| R#8 | Dep-completer missar css/require/dynamic import | G#6 | Avfärda | Test täcker side-effect CSS, CommonJS och dynamic imports. |
| R#9 | Scaffold required files tappas | Ny P3-rad | Edge | Inga hårda bevis i denna pass; lägg som deterministisk preflight/export-verifiering om repro finns. |
| R#10 | Game/interactive-canvas capability-gap | G#12, G#30 | Avfärda som aktiv bug | `needsGame` finns nu, räknas heavy och har tester/prompt-hint. Behåll bara framtida produktbatch om spelpolicyn ska höjas. |
| R#11 | `/api/transcribe` utan auth | Fixad 2026-05-01 | Bekräfta/fixad | Routen kräver nu befintlig user eller guest-session innan OpenAI-anrop. |
| R#12 | `/api/text/extract` utan auth | G#38, U#27, U#28 | Delvis fixad | Auth/session-guard, PDF-fallback och Unicode-bevarande är fixade; 10MB/CPU-policy ligger kvar på G#38. |
| R#13 | Media upload MIME/tags | G#37, U#17 + project-upload-rad | Fixad 2026-05-01 | `/api/media/upload` hade redan blockat SVG/HTML och tags shape-validerats; `/api/projects/[id]/upload` blockar nu också `image/svg+xml`. |

### Rekommenderad körordning efter nytriage

| Ordning | Agent-jobb | Effekt |
| --- | --- | --- |
| 1 | Fixa full testsvit / stale `domain-map.json` | Gör master pålitlig innan fler agent-run. |
| 2 | Stoppa dossier-stubbar från att bli tyst success | Höjer faktisk output-kvalitet och minskar falskt grönt. |
| 3 | Återstående PDF-policy (`text-extract` fallback/i18n) | Auth är fixad; kvar är CPU-/parse-kvalitet och Unicode-bevarande. |
| 4 | Aktivera/produktifiera Product Postcheck | Fångar UI/runtime som typecheck missar. |
| 5 | F3 readiness truth | Stoppar falsk "redo att bygga". |
| 6 | Capability-universum init/follow-up | Minskar drift och bättre follow-ups. |
| 7 | Recurring verifier patterns | Billig promptkvalitetsvinst. |
| 8 | Event-bus UI-flip | Minskar status-mismatch i buildern. |

## Lista

| Klar | Status | Prio | Fynd | Källa | Beslut / nästa steg |
| --- | --- | --- | --- | --- | --- |
| [x] | Fixad i HEAD | P0 | `/api/download` owner-scope för ZIP | G#1, R#3 | Fixad i senaste commit: routen använder scoped version-helper och har test. |
| [x] | Fixad i HEAD | P0 | `/api/domains/save` deployment utan owner-scope | G#2, R#1 | Fixad i senaste commit via `setDeploymentDomainForRequest` och test. |
| [x] | Fixad / verifierad riktat | P0 | Full testsvit failar pga stale `domain-map.json` | G#3, N#H1 | Stale fixture-spåret verifierat med `npx vitest run 'src/lib/config/dashboard-domain-map.parity.test.ts'` (2/2 gröna). |
| [x] | Fixad i HEAD | P1 | `companyProfile?companyName` global lookup | G#4, R#2 | Fixad i senaste commit med owner/session-scope och test. |
| [x] | Fixad i HEAD | P1 | Domain link/verify accepterar arbitrary `projectId` | G#5 | Fixad i senaste commit med projekt-scope och test. |
| [x] | Inte bug / fixad | P1 | Dep-completer missar CSS/`require()`/dynamic import | G#6, R#8 | Avskriven: test täcker side-effect CSS, CommonJS och dynamic imports. |
| [x] | Fixad i HEAD | P1 | `/api/text/analyze` auth ignorerad | G#7 | Fixad i senaste commit och testad. |
| [x] | Fixad nu | P1 | Same-sandbox preview update skickar inte om `.env.local` | G#8, R#5 | Fixad: update-path bygger om `.env.local` via `buildPreviewEnvLocalContents()` innan `updatePreviewHostSession`. |
| [x] | Fixad nu | P1 | Env merge kan skippas vid preview update | G#9, R#5 | Fixad med samma update-path som G#8; täckt av `preview-session.test.ts`. |
| [ ] | Öppen design-risk | P1 | F2 quality gate fångar inte runtime/UI-fel | G#10, N#4, N#H3, R#6 | Bekräfta: Product Postcheck finns men är default-off/fail-open. Produktifiera runtime smoke/postcheck, inte bara typecheck. |
| [x] | Fixad nu | P1 | Ingen runtime smoke för WebGL/3D | G#11 | Fixad med statisk WebGL/R3F-readiness smoke: verifier blockerar R3F Canvas utan `"use client"` och Visual QA rapporterar `webgl-readiness`. |
| [x] | Fixad nu | P1 | Ingen tydlig game/interactive capability | G#12, R#10 | Fixad: `needsGame` infereras för spel/playable canvas, ger egen prompt-hint och räknas som heavy. |
| [ ] | Öppen kvalitet-risk | P1 | Simplified brief fallback sänker premium/3D | G#13 | Begränsa fallback eller markera som degraded mode i generationen. |
| [ ] | Öppen bug | P1 | Autofix null-render/dossier stubs kan bli tyst success | N#1 | Bekräfta: `cross-file-import-checker.ts` skapar fortfarande null-render-stubbar och har TODO för dossier-exposed path-stubbar. Vägra dossier-stubbar eller gör dem blocker/degraded i stället för tyst success. |
| [x] | Fixad nu | P1 | Rate limit faller tillbaka till per-instance memory utan Redis | G#14, U#45 | Fixad: produktion failar stängt utan Upstash REST om inte `SAJTMASKIN_RATE_LIMIT_ALLOW_MEMORY_IN_PROD` sätts explicit. |
| [x] | Fixad nu | P1 | `default-seed` kan ge predikterbara slug-lösen | G#15 | Fixad: lösen kräver `KOSTNADSFRI_PASSWORD_SEED`, `KOSTNADSFRI_API_KEY` eller explicit secret. |
| [ ] | Öppen städ | P2 | `process.env` drift utanför `env.ts` | G#16 | Audita mot `src/lib/env.ts` och `config/env-policy.json`. |
| [ ] | Öppen design-risk | P2 | `allowPlaceholdersInF3` kan släppa stub secrets | G#17, N#H4 | Bekräfta som policyspår: låt bara explicita dev/test-lägen eller tydlig degraded/publicera-ändå-UX tillåta placeholders. |
| [ ] | Öppen docs-städ | P2 | Dubbla env-docs och genererad `.env.local`-sanning | G#18 | Konsolidera docs runt `docs/ENV.md` och env-policy. |
| [ ] | Öppen drift-risk | P2 | Generated `.env.local` kan vinna över user env | G#19 | Dokumentera/ändra precedence i preview-env-byggaren. |
| [ ] | Öppen bug | P2 | F3 Build Plan saknas när follow-up inte återinfererar integration | G#20, N#H2, R#7 | Bekräfta: återanvänd Snapshot-Brief + faktisk version/imports så F3-krav inte tappas vid follow-up. |
| [ ] | Öppen bug | P2 | `/finalize-design` kan säga ready utan integrationkrav | G#21, N#H2, R#7 | Bekräfta: readiness ska spegla faktiska F3-krav; särskilt edge där `spec.requirements.length === 0` beror på missad integration-detektion. |
| [ ] | Öppen bug | P2 | Hard dossiers ger placeholder UI i stället för blocker | G#22, N#H4 | Bekräfta: blocka eller degradera explicit när required integration saknas; placeholder UI får inte räknas som success. |
| [x] | Inte bug / beslutad | P2 | `feature-runtime` env keys blockerar inte F3 | G#23 | Avsiktligt: bara `build`-enforcement blockerar F3; `feature-runtime` surfacas som warning/info. Ändra dossier-enforcement till `build` om en nyckel ska blocka. |
| [x] | Fixad nu | P2 | Dossier verbatim-missing bara warning | G#24 | Fixad: selected dossier med saknad verbatim-fil failar prompt-compose i stället för att bara varna och fortsätta. |
| [ ] | Öppen kvalitet-risk | P2 | Dossier/capability-threading svagt vissa paths | G#25, N#2, R#7 | Bekräfta: verifiera init/follow-up/dossier bridge mot canonical capability-källa och snapshot-färskhet. |
| [ ] | Öppen bug | P2 | Init och follow-up har olika capability-universum | G#26, N#2 | Bekräfta: konsolidera capability-källa och följ ägarmatrisen. |
| [x] | Fixad i HEAD | P2 | `canvas` triggar 3D för 2D/dekorativa canvas | G#27 | Fixad i tidigare commit: dekorativ 3D och physics delas, med tester. |
| [x] | Fixad nu | P2 | `needsPhysics` triggar inte heavy budget | G#28 | Fixad: `needsPhysics` ingår i canonical `HEAVY_CAPABILITY_KEYS`. |
| [x] | Fixad nu | P2 | Forms/auth/payments/parallax räknas inte som heavy | G#29 | Fixad: `needsForms`, `needsAuth`, `needsPayments` och `needsParallax` ingår i canonical heavy-listan. |
| [x] | Fixad nu | P2 | Kort prompt med spel/game/shadcn missar capability-kontext | G#30, R#10 | Fixad via `needsGame` + heavy context/prompt-hint för korta spelprompter. |
| [ ] | Öppen eval-bug | P1 | `arcade-with-klarna` failar med merge-syntax | E#1, R#10 | FAIL 81%: scaffold/capability-route verkar korrekt, men merged syntax fick `Expected '(' / 'from' but found '-'` i `app/page.tsx`, `components/home-shell.tsx`, `components/snake-game.tsx`, `app/checkout/page.tsx`; LLM-fixer abortade. Nästa steg: kör `npm run eval:weird-smoke:dump` och jämför raw/fixed/merged/canonical files. |
| [ ] | Öppen verifier-risk | P2 | Warm tsc/eslint fail-open vid kall cache | G#31, N#4 | Bekräfta: faila tydligare eller kör kall-cache fallback så skip inte blir tyst success. |
| [ ] | Öppen design-risk | P2 | Preview kan visas trots verifier-blocked draft | G#32, N#4 | Bekräfta: UI ska skilja preview-materialisering från verifierad version. |
| [ ] | Öppen kvalitet-risk | P2 | LLM-verifier ser snippets, inte hela filer | G#33 | Ge verifieraren rätt filkontext eller begränsa claimen. |
| [x] | Fixad nu | P2 | Partial-file repair capped vid 1 attempt | G#34 | Fixad: `partialFileRepairMaxAttempts` höjt från 1 till 2 i `config/ai_models/manifest.json`; arkitektur-/LLM-docs uppdaterade. |
| [ ] | Öppen prompt-risk | P2 | Recurring verifier-fynd saknas i nästa codegen-prompt | N#5 | Bekräfta: ta 3-5 senaste verifier-fynd per chat som "Quality patterns to avoid"; matcha E3 i `Kvarvarande-uppgifter.md`. |
| [ ] | Öppen UX-risk | P2 | Placeholder-bild maskerar trasigt original | G#35, U#72, N#H4 | Bekräfta: visa placeholder som degraded state, inte success. |
| [ ] | Öppen regression-risk | P2 | Follow-up context-budget saknar hård regression-gate | N#3 | Bekräfta som gate-risk: `eval:followup` finns, men budgeten bör stoppa PR/agent-run som åter blåser upp Snapshot-Brief/file-context. |
| [ ] | Öppen UI-status-risk | P2 | Event-bus statusprojektion inte fullt inkopplad i builder-UI | N#6 | Bekräfta: `selectVersionStatus(events)` finns, men centrala UI-ytor läser fortfarande äldre DB-statusresolver. Koppla projectionen innan DB-flaggor fasas ut. |
| [x] | Fixad nu | P2 | `upload-from-url` läser body före size-check | G#36, U#20 | Fixad: content-length precheck + streamad läsning med 4MB stopp. |
| [x] | Fixad nu | P2 | SVG/HTML tillåts i media-upload | G#37, U#15, U#16, R#13 | Fixad för `/api/media/upload`: `image/svg+xml` och `text/html` tas bort ur upload-allowlist. Se separat project-upload-rad för kvarvarande edge. |
| [x] | Fixad nu | P2 | Project image upload tillåter SVG trots media-upload-policy | R#13 | Fixad: `/api/projects/[id]/upload` speglar nu media-upload allowlist och nekar `image/svg+xml`; regressionstest tillagt. |
| [ ] | Öppen policy-fråga | P2 | Publik PDF-parse-yta / 10MB input | G#38, R#12 | Delvis fixad: `text-extract` kräver nu user eller befintlig guest-session. Kvar: om 10MB PDF-input är rätt CPU-policy. |
| [x] | Fixad nu | P2 | Transcribe loggar första 80 chars | G#39, U#21 | Fixad: loggar bara transcript-längd. |
| [x] | Fixad nu | P2 | `/api/transcribe` saknar auth men kör kostnadsdrivet OpenAI-anrop | R#11 | Fixad: kräver user eller befintlig guest-session innan Whisper-anrop; regressionstest tillagt. |
| [ ] | Öppen säkerhetsrisk | P2 | Inspector SSRF-edge publik DNS -> privat IP | G#40, U#50 | Verifiera DNS-rebind/private-IP-guard. |
| [x] | Inte bug | P3 | `/api/v0/*` finns kvar | G#41, G#42 | Avsiktlig API-version/naming debt, inte runtime-bugg. |
| [x] | Inte bug / naming debt | P3 | `TemplateCatalogSource = "v0"` | G#43, U#40 | Inte bug; kan städas separat om glossary/legacy-plan kräver. |
| [x] | Inte bug / naming debt | P3 | `ModelProviderFamily` innehåller `v0` | G#44 | Inte bug; naming debt. |
| [x] | Inte bug / naming debt | P3 | `demoUrl`, `webhook:v0`, `v0-catalog` kvar | G#45, U#76 | Inte bug; terminologistäd senare. |
| [x] | Inte bug / föråldrad premiss | P3 | Root lockfile saknas | G#46 | Avskriven: repo använder npm + `package-lock.json`; CI kör `npm ci`. |
| [ ] | Öppen städ | P3 | ESLint-varningar / sync setState / unused | G#47 | Kör lint och fixa inom scope. |
| [ ] | Öppen scaffold-risk | P3 | Placeholder copy kvar i scaffoldfiler | G#48 | Greppa scaffoldcopy och ersätt konkret text. |
| [ ] | Öppen scaffold-risk | P3 | Dashboard `[Företagsnamn]` kan slinka igenom | G#49 | Gör blocker eller materialisering. |
| [ ] | Öppen scaffold-risk | P3 | Blog placeholder body | G#50 | Byt defaulttext eller verifiera bort. |
| [ ] | Öppen scaffold-edge | P3 | Scaffold required files kan tappas i finalize/export-path | R#9 | Edge: inga hårda bevis i denna pass. Lägg deterministiskt preflight-check + test bara om repro visar att required scaffold files tappas efter merge/export. |
| [ ] | Öppen UX-risk | P3 | Placeholder CTAs non-blocking | G#51, N#H4 | Bekräfta som degraded-state-policy: markera som warning/blocker beroende på lane. |
| [ ] | Öppen variant-risk | P3 | Variant pre-match keyword-only vs final logik | G#52 | Konsolidera selector/logg. |
| [ ] | Öppen typography-risk | P3 | Font materializer träffar mest baseline Inter | G#53 | Verifiera variant-font-parningar. |
| [ ] | Öppen typography-risk | P3 | Geist workaround kan sabotera variant-typografi | G#54 | Begränsa workaround till kända fall. |
| [ ] | Öppen naming debt | P3 | `/api/ai/spec` naming debt | G#55 | Utred om ytan används, annars döp om/ta bort. |
| [ ] | Öppen schema-risk | P3 | `variantNomination` nämns men produceras inte av schema | G#56 | Synka schema/docs/prompt. |
| [ ] | Öppen kvalitet-risk | P3 | Follow-up quality promotion svagare än init | G#57 | Jämför init/follow-up gates. |
| [ ] | Öppen copy-städ | P3 | Blandning av "Bygg nu", "F3", "Bygg integrationer" | G#58, U#80 | Konsolidera UI-copy med F2/F3-termer. |
| [ ] | Öppen storage-risk | P3 | Builder localStorage keys utan versionsprefix | G#59, U#54 | Lägg prefix/migration för stabila keys. |
| [ ] | Öppen observability-städ | P3 | Silent catches i dev/log readers | G#60, U#64 | Logga med låg brusnivå eller returnera explicit degraded state. |
| [ ] | Öppen cache-risk | P3 | Shadcn registry cache saknar maxstorlek | G#61, U#33 | Lägg max/TTL. |
| [ ] | Öppen cache-risk | P3 | Shadcn cache key casing/whitespace dubletter | G#62, U#34 | Normalisera cache keys. |
| [ ] | Öppen registry-risk | P3 | Docs-only block godkänns som usable | G#63, U#36 | Kräv renderbar component/source. |
| [ ] | Öppen cache-risk | P3 | Template embedding cache kräver restart/invalidate | G#64, U#37 | Lägg explicit invalidation. |
| [ ] | Öppen search-risk | P3 | Template keyword fallback söker inte description | G#65, U#38 | Inkludera description/tags. |
| [ ] | Öppen scraper-risk | P3 | Webscraper `MAX_PAGES=4` missar viktig info | G#66, U#41 | Gör cap adaptiv eller prioriterad. |
| [ ] | Öppen scraper-risk | P3 | Footer/contact/legal kapas av word caps | G#67, U#43 | Separera legal/contact från body-cap. |
| [x] | Fixad nu | P3 | Unsplash GET saknar hård cap på `count` | G#68, U#24 | Fixad: `count` clampas till 1-12 för GET och POST/fallback. |
| [x] | Inte bug / fallback | P3 | Unsplash `placehold.co` fallback | G#69, U#25 | Avsiktlig dev/fallback; kan bytas senare som produktbeslut. |
| [ ] | Öppen inspector-risk | P3 | Element crop kan missa små element vid DPI/zoom | G#70, U#52 | Kräver reproduktion i inspector-worker. |
| [ ] | Öppen PDF-UX | P3 | PDF report `window.open` + `document.write` | G#71, U#13 | Byt till blob/download eller server-renderad fil. |
| [x] | Inte bug / låg risk | P3 | Date formatting locale/timezone varierar | G#72, U#67, U#68 | Inte bug utan rapportpolicy; öppna ny produktfråga om determinism krävs. |
| [x] | Fixad nu | P3 | `generateUniqueFilename` använder `Math.random` | G#73, U#30 | Fixad: använder `crypto.randomUUID`. |
| [x] | Fixad i HEAD | P3 | Image validator HEAD-fallback missar CDNs | G#74, U#71 | Avskriven/fixad: HEAD 405/501 har GET fallback med byte-range och tester. |
| [ ] | Öppen UX-risk | P3 | Domain manager polling/save-fail döljs | G#75, U#11, U#12 | Visa save/link-status och fel tydligt. |
| [x] | Fixad nu | P3 | ThinkingOverlay nested `setTimeout` rensas inte vid unmount | U#1 | Fixad: nested fade-timeout sparas och rensas i effect-cleanup. |
| [x] | Fixad nu | P3 | ThinkingOverlay säger "visuell QA" fast default kan vara av | U#2 | Fixad: copy säger syntax- och kvalitetskontroller utan att lova visuell QA. |
| [x] | Inte bug / fixad | P3 | MessageList elapsed interval kan trigga render-loop | U#3 | Avskriven: `RepairProgressIndicator` cappar vid 300s och clearar interval i cleanup. |
| [x] | Fixad i HEAD | P3 | PreviewPanelFrame debounce + hard-cap vid snabb URL-switch | U#4, N#H5 | Avskriven/fixad: debounce + 6s hard-cap finns och timers rensas i cleanup. |
| [x] | Fixad i HEAD | P3 | `usePreviewIframe` timers/refs race tier2/shim | U#5, N#H5 | Avskriven/fixad: preview-ready timers rensas vid URL-/identity-byte innan nya timers sätts. |
| [ ] | Öppen UI-race | P3 | ProjectEnvVarsPanel parallella fetches utan gemensam abort | U#6, U#79, N#H5 | Edge: lägg request-token/abortcontroller om parallella fetches kan vinna stale. |
| [x] | Fixad i HEAD | P3 | SeoOptInPanel prefs-fetch stale vid snabb open/close | U#7, N#H5 | Avskriven/fixad: prefs-effect använder cancelled-guard i cleanup och undviker stale writes. |
| [x] | Inte bug / UX debt | P3 | F3PlaceholderToggle saknar skeleton | U#8 | Inte bug; ren polish. |
| [x] | Fixad nu | P3 | VersionHistory actions före mutate synkad | U#9, N#H5 | Fixad: pin/restore/accept-repair väntar nu in `mutate()` innan in-flight state släpps. |
| [ ] | Öppen collaboration-risk | P3 | VersionCollaboration saknar optimistic conflict | U#10 | Lägg conflict UI eller etag/version guard. |
| [ ] | Öppen PDF-risk | P3 | Audit PDF inline SVG escaping | U#14, U#73 | Escape/testa SVG-innehåll. |
| [x] | Fixad nu | P3 | Media upload tags JSON saknar shape-validering | U#17 | Fixad: endast array av strings sparas, max 20 tags. |
| [x] | Fixad nu | P3 | `upload-from-url` kan skapa konstig `svg+xml`-filändelse | U#19 | Fixad via allowlist + explicit extension map. |
| [x] | Inte bug | P3 | Transcribe accepterar `video/mp4` upp till 25MB | U#22 | Avsiktligt: Whisper hanterar video-containers. |
| [ ] | Öppen produkt-gap | P3 | Transcribe språkfallback bara sv/en | U#23 | Lägg fler språk eller gör valet explicit. |
| [x] | Inte bug | P3 | Unsplash POST gör upp till 3 externa sökningar | U#26 | Redan hårt capad till max 3 termer. |
| [x] | Fixad nu | P3 | PDF extract fallback regex nonsens | U#27, R#12 | Fixad: `pdf-parse`-fel returnerar tydligt unsupported (`422`) i stället för ad hoc stream-/BT/ET-regex. |
| [x] | Fixad nu | P3 | PDF extract strippar icke-Latin-1 | U#28, R#12 | Fixad: cleanup tar bara bort kontrolltecken och bevarar Unicode-text från parsern. |
| [ ] | Öppen preview-risk | P3 | Media local fallback `/api/uploads/media` kanske ej nås av VM | U#29, N#H4 | Bekräfta/edge: kräv Blob för preview eller visa tydligt degraded state; verifiera mot VM innan blocker. |
| [x] | Fixad nu | P3 | Originalfiländelse / dubbeländelse okontrollerad | U#31 | Fixad delvis vid blob-namn: path-segment saneras och extensionless filer defaultar till `.bin`, inte `.png`. |
| [x] | Fixad nu | P3 | Blob path använder rå `projectId` | U#32 | Fixad: blob path-segment för user/project/filename saneras innan upload. |
| [ ] | Öppen cache-risk | P3 | Registry async refresh stale vid misslyckad fetch | U#35 | Behåll last-good med timestamp/status. |
| [x] | Fixad nu | P3 | Template search apps/games hint vs saknad game capability | U#39 | Fixad ihop med G#12/G#30: spel/prompts får `needsGame` i canonical capability-inference. |
| [x] | Fixad nu | P3 | `svävande`/`hovrande` ensamma triggar `needs3D` (false positive) i `capability-inference.ts:127`; `platformerspel` matchar inte `needsGame`-regex (false negative). Verifierat med `inferCapabilities` 2026-05-01 mot prompt-set från `3d-motion-stub-fix`-planen. | N#7 | Fixad: `svävande`/`hovrande`/`flygande` ensamma ger `needsMotion`, inte `needs3D`; explicit `3D`/`WebGL` fortsätter ge `visual-3d`. `platformer-?spel`, `pac-?man-?spel`, `snake-?spel`, `tetris-?spel`, `quiz-?spel`, `arkadspel`, `minispel` matchar nu `needsGame`. |
| [ ] | Öppen scraper-risk | P3 | Webscraper prioriterar about/services/product/blog | U#42 | Justera ranking efter domain/site-type. |
| [ ] | Öppen scraper-risk | P3 | Webscraper strips `www.` jämförelse | U#44 | Normalisera host jämnt. |
| [x] | Fixad nu | P3 | `x-forwarded-for` första IP används som client-id | U#46 | Fixad: produktion ignorerar `x-forwarded-for` om inte `SAJTMASKIN_TRUST_X_FORWARDED_FOR` är explicit satt; `x-real-ip` prioriteras. |
| [ ] | Öppen prompt-budget-risk | P3 | OpenClaw chat 180k code context | U#47 | Lägg sammanfattning/chunking. |
| [x] | Inte bug / dev ergonomics | P3 | OpenClaw tips kräver modul-restart | U#48 | Avsiktligt modul-init-beteende; kan dokumenteras. |
| [ ] | Öppen session-risk | P3 | D-ID avatar ny `sessionId` om saknas | U#49 | Persist/återanvänd session tydligare. |
| [x] | Fixad nu | P3 | Inspector Playwright fallback rate bucket | U#51 | Fixad: inspector capture, element-map och AI-match har separata rate-limit buckets och kräver user eller befintlig guest-session. |
| [ ] | Öppen observability-risk | P3 | ErrorBoundary frontlog fire-and-forget | U#53 | Lägg retry/visible degraded state om post misslyckas. |
| [x] | Inte bug / UI-state | P3 | `admin-auth` i localStorage UI-state | U#55 | Avskriven: admin-API:er kräver server-side admin session; localStorage är bara UI-minne. |
| [ ] | Öppen consent-risk | P3 | cookie-banner mini-game consent | U#56 | Verifiera att tracking inte startar före consent. |
| [x] | Fixad nu | P3 | VoiceRecorder/VideoRecorder exhaustive-deps av | U#57 | Fixad: onstop-handlers använder latest-callback refs och eslint-disable för deps är borttagen. |
| [ ] | Öppen React-städ | P3 | LocationPicker exhaustive-deps av | U#58 | Fixa hooks eller dokumentera stabila deps. |
| [x] | Inte bug / fixad | P3 | ModelTraceOverlay URL/localStorage state | U#59 | Avskriven: localStorage-nyckeln är redan prefixad `sajtmaskin:model-trace-overlay`. |
| [x] | Fixad nu | P3 | `decodeStoragePathname` malformed `%` | U#61 | Fixad: malformed percent-encoding ger tydligt storage-fel i stället för rå `URIError`. |
| [x] | Fixad nu | P3 | Local storage delete false utan UI | U#62 | Fixad delvis i media drawer: gamla delete-fel rensas innan nytt delete-försök så stale error inte ligger kvar. |
| [ ] | Öppen backoffice-städ | P3 | Backoffice domain-map / manuella paths | U#63 | Synka med `backoffice/shared.py` om ytan rörs. |
| [x] | Fixad nu | P3 | Metrics route token blind | U#65 | Fixad: 401 loggar token-miss utan att logga tokenvärdet; route hade redan rätt status. |
| [ ] | Öppen logg-städ | P3 | `console.info` hot paths brus | U#66 | Gå över till debug-log med sampling. |
| [ ] | Öppen naming-risk | P3 | nanoid/Date fallback deploy-namn | U#69 | Gör deterministic eller collision-safe. |
| [x] | Fixad i HEAD | P3 | `getExtension` default `.png` | U#70 | Avskriven/fixad: blob-service defaultar redan ogiltig/saknad extension till `.bin`, inte `.png`. |
| [x] | Inte bug / copy debt | P3 | Shadcn category emojis enterprise | U#74 | Inte bug; copy/brand-städ. |
| [ ] | Öppen search-risk | P3 | Template-search diakritik strip | U#75 | Lägg Unicode-aware normalisering. |
| [ ] | Öppen preview-risk | P3 | `previewUrlHint` base path + chatId | U#77 | Verifiera URL-byggare mot preview-host. |
| [x] | Inte bug / ej bekräftad | P3 | SSE ping `Date.now` var 15s loggar | U#78 | Avskriven: backend skickar ping med timestamp men grep visar ingen `console.*`-logg kopplad till SSE-pingen. |
