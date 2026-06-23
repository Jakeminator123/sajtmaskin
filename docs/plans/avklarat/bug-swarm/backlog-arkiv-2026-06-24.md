# Bug-backlog — fryst historik (2026-06-24)

> **FRYST HISTORIK — uppdatera inte.** Aktiv buggsanning lever i [`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md) (repo-rot).
>
> Den här filen är en snapshot av backloggens **avslutade, avfärdade och historiska triage-rader** som flyttades ut ur rotfilen när den slimmades 2026-06-24. Git-historiken bär full detalj; den här filen bevarar raddatan så att inget tappas. Rader kan vara internt motsägelsefulla (t.ex. `[ ]` med "FIXAD" i prosan) — det var just den driften som städningen rättade. Se rotfilens "Aktiv kö" för vad som faktiskt är öppet.

## Git-verifierade fixar (var tidigare felaktigt `[ ]` i rotfilen)

Vid städningen 2026-06-24 verifierades följande "fixad i branch/PR"-påståenden mot `git log master`. Alla är mergade — de flyttades från öppna rader till avslutad historik:

| Spår | Fynd | Mergad som |
| --- | --- | --- |
| FEL-1, FEL-3, FEL-4, FEL-5, FEL-6 | Fast Edit Lane concurrency/host-race-härdning | `#223` (`e4b04c51a`) |
| FEL-2 | composer `baseVersionRef`-chaining i undo/redo/drop | `#222`/`#223`/`#224` |
| MB-1 | prompt-assist-allowlist återställd | `#223` (`e4b04c51a`) |
| MB-2 | Opus 4.8-brief temperature strippad | `#223` (`e4b04c51a`) |
| MB-3 | generator-fas routas till Opus 4.8 på anthropic-tier | `#226` (`a1b40eddb`) + `#227` (`68afa88ac`) |
| BB-1, BB-2 | route-tabs orphan add/remove (badge + `−`) | `#225` (`564b695b6`) |
| Control-plane / route P2 | 5 Codex P2 route-fynd | `#224` (`eaaa58ff2`) |
| G#40 (app-side) | SSRF DNS→privat IP i `safeFetch` | `#196` (`40d0c6b9f`) |
| B05 | `refuseDossierStubs` scope:ad till valda dossiers | `#211` (`fd6029a22`) |
| Inspect-bridge #203 | origin-validering + lämna alltid pick-mode | `#203` (`c4966d0b6`) |
| #190 | `company_profiles` orphan vid deleteProject | `#209` (`493dc0f3b`) |
| #198 | `visual-3d` bakom explicit 3D-request | `#198` (`fa9aac987`) |
| #199 | readiness surfar riktig typecheck-fail | `#199` (`4633a9cf4`) |
| #200 | saknade lucide-importer i post-merge-repair | `#200` (`ca0d9557b`) |
| #201 | deterministisk TS2304 known-import-fixer | `#201` (`b4e949965`) |

**Kvarvarande residualer** (ej fixade av ovan, lever vidare i rotfilens "Aktiv kö" eller "Beslut & policy"):

- G#40: connect-tid TOCTOU / DNS-rebinding (kräver IP-pinning) + worker-kopian (`services/inspector-worker`) ej deployad i prod. → Beslut & policy (deprio säkerhet).
- MB-4: plan-mode token-budget skalas mot tier-build-modellen, inte planner-fasen (low, pre-existing). → Aktiv kö.
- #197: inspect-bridge spoof-skydd förfalskbart (nonce/token krävs). → Beslut & policy (deprio säkerhet).

---

## Senaste fixvåg-not (2026-06-22, historisk)

Verifierade icke-säkerhetsbuggar stängda: `company_profiles`-orphan (#190), `cn` self-import + TS2304 (#201/#209), `physics-3d`-utan-`visual-3d` (#198/#209), inspect-bridge origin/pick-mode (#203), app-side SSRF (#196), och B05 `refuseDossierStubs` scope-fix (#211, inkl. eval/MCP-trådning).

---

## Full historisk G#/N#/R#/U#-lista (fryst 2026-06-24)

> Detta är den kompletta `## Lista`-tabellen som den såg ut före städningen. `[x]` = avslutad, `[ ]` = var öppen vid frysning (se rotfilen för aktuell status; flera `[ ]` här är sedan dess fixade per tabellen ovan).

| Klar | Status | Prio | Fynd | Källa | Beslut / nästa steg |
| --- | --- | --- | --- | --- | --- |
| [x] | Fixad i HEAD | P0 | `/api/download` owner-scope för ZIP | G#1, R#3 | Fixad: routen använder scoped version-helper och har test. |
| [x] | Fixad i HEAD | P0 | `/api/domains/save` deployment utan owner-scope | G#2, R#1 | Fixad via `setDeploymentDomainForRequest` och test. |
| [x] | Fixad / verifierad riktat | P0 | Full testsvit failar pga stale `domain-map.json` | G#3, N#H1 | Verifierat med `dashboard-domain-map.parity.test.ts` (2/2 gröna). |
| [x] | Fixad i HEAD | P1 | `companyProfile?companyName` global lookup | G#4, R#2 | Fixad med owner/session-scope och test. |
| [x] | Fixad i HEAD | P1 | Domain link/verify accepterar arbitrary `projectId` | G#5 | Fixad med projekt-scope och test. |
| [x] | Inte bug / fixad | P1 | Dep-completer missar CSS/`require()`/dynamic import | G#6, R#8 | Avskriven: test täcker side-effect CSS, CommonJS och dynamic imports. |
| [x] | Fixad i HEAD | P1 | `/api/text/analyze` auth ignorerad | G#7 | Fixad och testad. |
| [x] | Fixad nu | P1 | Same-sandbox preview update skickar inte om `.env.local` | G#8, R#5 | Fixad: update-path bygger om `.env.local` innan `updatePreviewHostSession`. |
| [x] | Fixad nu | P1 | Env merge kan skippas vid preview update | G#9, R#5 | Fixad med samma update-path som G#8; täckt av `preview-session.test.ts`. |
| [ ] | Öppen design-risk | P1 | F2 quality gate fångar inte runtime/UI-fel | G#10, N#4, N#H3, R#6 | BLOCKER-policy: `product-postcheck.ts` är flagg-styrd default-off + fail-open. Produktifiering = pipeline-/gate-beslut. Eskalerad. |
| [x] | Fixad nu | P1 | Ingen runtime smoke för WebGL/3D | G#11 | Fixad med statisk WebGL/R3F-readiness smoke. |
| [x] | Fixad nu | P1 | Ingen tydlig game/interactive capability | G#12, R#10 | Fixad: `needsGame` infereras, ger prompt-hint, räknas heavy. |
| [ ] | Öppen kvalitet-risk | P1 | Simplified brief fallback sänker premium/3D | G#13 | BLOCKER-policy: degraded-mode-signal är kvalitets-/pipeline-beslut. Eskalerad. |
| [ ] | Öppen bug | P1 | Autofix null-render/dossier stubs kan bli tyst success | N#1 | BLOCKER-policy: flag-gated `FEATURES.refuseDossierStubs`; kan flippa version-status röd. Eskalerad. |
| [x] | Fixad nu | P1 | Rate limit faller tillbaka till per-instance memory utan Redis | G#14, U#45 | Fixad: prod failar stängt utan Upstash REST om inte explicit flagga. |
| [x] | Fixad nu | P1 | `default-seed` kan ge predikterbara slug-lösen | G#15 | Fixad: lösen kräver seed/API-key/secret. |
| [ ] | Öppen städ | P2 | `process.env` drift utanför `env.ts` | G#16 | EDGE: ~100 filer; bred refaktor utan smalt fix. Öppen. |
| [ ] | Öppen design-risk | P2 | `allowPlaceholdersInF3` kan släppa stub secrets | G#17, N#H4 | BLOCKER-policy: opt-in toggle; säkerhet vs UX. Eskalerad. |
| [ ] | Öppen docs-städ | P2 | Dubbla env-docs och genererad `.env.local`-sanning | G#18 | EDGE: kräver canonical-källa-beslut. Öppen för docs-pass. |
| [ ] | Öppen drift-risk | P2 | Generated `.env.local` kan vinna över user env | G#19 | BLOCKER-policy: precedence = medvetet env-build-beslut. Eskalerad. |
| [ ] | Öppen bug | P2 | F3 Build Plan saknas när follow-up inte återinfererar integration | G#20, N#H2, R#7 | BLOCKER: rot = `renderTier3IntegrationBlock` härleder från `preGenerationContracts`, ej version-filer. Signal-ägar-fix. Eskalerad. |
| [ ] | Delvis fixad / BLOCKER | P2 | `/finalize-design` kan säga ready utan integrationkrav | G#21, N#H2, R#7 | DELVIS FIXAD: tom/oläsbara filer → `409 version_files_unavailable`. KVAR: detektionsfullständighet. Eskalerad. |
| [ ] | Öppen bug | P2 | Hard dossiers ger placeholder UI i stället för blocker | G#22, N#H4 | BLOCKER-policy: degraded-state-policy (ihop med G#17/G#35/G#51). Eskalerad. |
| [x] | Inte bug / beslutad | P2 | `feature-runtime` env keys blockerar inte F3 | G#23 | Avsiktligt: bara `build`-enforcement blockerar F3. |
| [x] | Fixad nu | P2 | Dossier verbatim-missing bara warning | G#24 | Fixad: selected dossier med saknad verbatim-fil failar prompt-compose. |
| [ ] | Öppen kvalitet-risk | P2 | Dossier/capability-threading svagt vissa paths | G#25, N#2, R#7 | BLOCKER: canonical-källa-konsolidering = arkitektur/ägarmatris. Eskalerad (ihop med G#26). |
| [ ] | Öppen bug | P2 | Init och follow-up har olika capability-universum | G#26, N#2 | BLOCKER: samma single-source-spår som G#25. Eskalerad. |
| [x] | Fixad i HEAD | P2 | `canvas` triggar 3D för 2D/dekorativa canvas | G#27 | Fixad: dekorativ 3D och physics delas, med tester. |
| [x] | Fixad nu | P2 | `needsPhysics` triggar inte heavy budget | G#28 | Fixad: ingår i canonical `HEAVY_CAPABILITY_KEYS`. |
| [x] | Fixad nu | P2 | Forms/auth/payments/parallax räknas inte som heavy | G#29 | Fixad: ingår i canonical heavy-listan. |
| [x] | Fixad nu | P2 | Kort prompt med spel/game/shadcn missar capability-kontext | G#30, R#10 | Fixad via `needsGame` + heavy context/prompt-hint. |
| [ ] | Öppen eval-bug | P1 | `arcade-with-klarna` failar med merge-syntax | E#1, R#10 | EDGE: kräver `eval:weird-smoke:dump` mot LLM-providers (nycklar+nät+kostnad). Behöver repro. |
| [ ] | Öppen verifier-risk | P2 | Warm tsc/eslint fail-open vid kall cache | G#31, N#4 | BLOCKER-policy: dokumenterat fail-open (`cache_cold`). Cold-cache blockerande = infra-beslut. Eskalerad. |
| [ ] | Öppen design-risk | P2 | Preview kan visas trots verifier-blocked draft | G#32, N#4 | BLOCKER-policy: runtime/UI-gate-ändring (ihop med N#6). Eskalerad. |
| [ ] | Öppen kvalitet-risk | P2 | LLM-verifier ser snippets, inte hela filer | G#33 | BLOCKER-policy: verifier-arkitektur + token-budget. Eskalerad. |
| [x] | Fixad nu | P2 | Partial-file repair capped vid 1 attempt | G#34 | Fixad: `partialFileRepairMaxAttempts` 1→2. |
| [ ] | Öppen prompt-risk | P2 | Recurring verifier-fynd saknas i nästa codegen-prompt | N#5 | BLOCKER-policy: nytt prompt-composition-steg. Eskalerad. |
| [ ] | Öppen UX-risk | P2 | Placeholder-bild maskerar trasigt original | G#35, U#72, N#H4 | BLOCKER-policy: degraded-state-policy. Eskalerad. |
| [ ] | Öppen regression-risk | P2 | Follow-up context-budget saknar hård regression-gate | N#3 | BLOCKER-policy: CI-/process-beslut. Eskalerad. |
| [x] | Fixad (Område 6) | P2 | Event-bus statusprojektion inte fullt inkopplad i builder-UI | N#6 | LÖST 2026-06-22: `useVersionStatus`/`busStatus` inkopplat; legacy resolver raderad. |
| [x] | Fixad nu | P2 | `upload-from-url` läser body före size-check | G#36, U#20 | Fixad: content-length precheck + streamad läsning med 4MB stopp. |
| [x] | Fixad nu | P2 | SVG/HTML tillåts i media-upload | G#37, U#15, U#16, R#13 | Fixad: `image/svg+xml`/`text/html` ur upload-allowlist. |
| [x] | Fixad nu | P2 | Project image upload tillåter SVG | R#13 | Fixad: `/api/projects/[id]/upload` speglar media-upload allowlist. |
| [ ] | Öppen policy-fråga | P2 | Publik PDF-parse-yta / 10MB input | G#38, R#12 | EDGE: auth fixad; CPU-/storlekspolicy = produktbeslut. Öppen. |
| [x] | Fixad nu | P2 | Transcribe loggar första 80 chars | G#39, U#21 | Fixad: loggar bara transcript-längd. |
| [x] | Fixad nu | P2 | `/api/transcribe` saknar auth | R#11 | Fixad: kräver user/guest-session före Whisper. |
| [ ] | Öppen säkerhetsrisk | P2 | Inspector SSRF-edge publik DNS → privat IP | G#40, U#50 | App-side FIXAD #196. Worker-kopian kvar men ej deployad. Residual: connect-tid TOCTOU. → Beslut & policy. |
| [x] | Inte bug | P3 | `/api/v0/*` finns kvar | G#41, G#42 | Avsiktlig API-version/naming debt. |
| [x] | Inte bug / naming debt | P3 | `TemplateCatalogSource = "v0"` | G#43, U#40 | Naming debt. |
| [x] | Inte bug / naming debt | P3 | `ModelProviderFamily` innehåller `v0` | G#44 | Naming debt. |
| [x] | Inte bug / naming debt | P3 | `demoUrl`, `webhook:v0`, `v0-catalog` kvar | G#45, U#76 | Terminologistäd senare. |
| [x] | Inte bug / föråldrad premiss | P3 | Root lockfile saknas | G#46 | Repo använder npm + `package-lock.json`; CI kör `npm ci`. |
| [x] | Fixad i HEAD | P3 | ESLint-varningar / sync setState / unused | G#47 | `npm run lint` grön i HEAD. |
| [x] | Fixad nu | P3 | Placeholder copy kvar i scaffoldfiler | G#48 | Fixad: `[Roll]`/`[Företag]` tillagda i `no-bracket-placeholders`. |
| [ ] | Öppen scaffold-risk | P3 | Dashboard `[Företagsnamn]` kan slinka igenom | G#49 | BLOCKER-policy: hård gate vs warning = gate-policybeslut. Eskalerad. |
| [ ] | Öppen scaffold-risk | P3 | Blog placeholder body | G#50 | EDGE: fri-text utan bracket-token kan ej detekteras utan false-positives. Öppen. |
| [ ] | Öppen scaffold-edge | P3 | Scaffold required files kan tappas i finalize/export | R#9 | EDGE: inga hårda bevis/repro. Behöver repro. |
| [ ] | Öppen UX-risk | P3 | Placeholder CTAs non-blocking | G#51, N#H4 | BLOCKER-policy: degraded-state-policy. Eskalerad. |
| [ ] | Öppen variant-risk | P3 | Variant pre-match keyword-only vs final logik | G#52 | EDGE: refaktor i variant-matchning. Öppen. |
| [ ] | Öppen typography-risk | P3 | Font materializer träffar mest baseline Inter | G#53 | EDGE: kräver eval-verifiering av variant→font. Behöver repro. |
| [ ] | Öppen typography-risk | P3 | Geist workaround kan sabotera variant-typografi | G#54 | EDGE: kräver kartläggning av påverkade varianter. Öppen. |
| [x] | Fixad nu | P3 | `/api/ai/spec` naming debt | G#55 | Fixad: spec-first-kedjan finns ej i kod; stale docs-rader borttagna. |
| [ ] | Öppen schema-risk | P3 | `variantNomination` nämns men produceras inte av schema | G#56 | BLOCKER: synka schema/prompt ELLER ta bort drift-detektion. Eskalerad. |
| [ ] | Öppen kvalitet-risk | P3 | Follow-up quality promotion svagare än init | G#57 | BLOCKER-policy: gate-policybeslut. Eskalerad. |
| [x] | Verifierad i HEAD | P3 | Blandning av "Bygg nu"/"F3"/"Bygg integrationer" | G#58, U#80 | Verifierad: CTA är canonical `"Bygg integrationer"` överallt. |
| [ ] | Öppen storage-risk | P3 | Builder localStorage keys utan versionsprefix | G#59, U#54 | EDGE: nycklar redan namespace-prefixade; versions-segment lågt värde. Öppen. |
| [ ] | Öppen observability-städ | P3 | Silent catches i dev/log readers | G#60, U#64 | EDGE: bred observability-städ. Öppen. |
| [x] | Fixad nu | P3 | Shadcn registry cache saknar maxstorlek | G#61, U#33 | Fixad: `MAX_CACHE_ENTRIES=256` + eviction. |
| [x] | Fixad nu | P3 | Shadcn cache key casing/whitespace dubletter | G#62, U#34 | Fixad: `buildRegistryCacheKey` normaliserar. |
| [ ] | Öppen registry-risk | P3 | Docs-only block godkänns som usable | G#63, U#36 | EDGE: avsiktlig fallback-semantik. Öppen. |
| [x] | Fixad i HEAD | P3 | Template embedding cache kräver restart/invalidate | G#64, U#37 | `invalidateEmbeddingsCache()` finns och inkopplad. |
| [x] | Inte bug / data saknar fält | P3 | Template keyword fallback söker inte description | G#65, U#38 | Katalogen exponerar inga description/tags-fält. |
| [ ] | Öppen scraper-risk | P3 | Webscraper `MAX_PAGES=4` missar viktig info | G#66, U#41 | EDGE: adaptiv MAX_PAGES = token-/produktavvägning. Öppen. |
| [x] | Fixad nu | P3 | Footer/contact/legal kapas av word caps | G#67, U#43 | Fixad (PR #142): `extractContactSignals` prependar kontakt/legal-block. |
| [x] | Fixad nu | P3 | Unsplash GET saknar hård cap på `count` | G#68, U#24 | Fixad: clamp 1-12. |
| [x] | Inte bug / fallback | P3 | Unsplash `placehold.co` fallback | G#69, U#25 | Avsiktlig dev/fallback. |
| [ ] | Öppen inspector-risk | P3 | Element crop kan missa små element vid DPI/zoom | G#70, U#52 | EDGE: kräver Playwright-repro. Behöver repro. |
| [ ] | Öppen PDF-UX | P3 | PDF report `window.open` + `document.write` | G#71, U#13 | EDGE: avsiktligt print-to-PDF (A4 @page). Öppen UX-beslut. |
| [x] | Inte bug / låg risk | P3 | Date formatting locale/timezone varierar | G#72, U#67, U#68 | Rapportpolicy. |
| [x] | Fixad nu | P3 | `generateUniqueFilename` använder `Math.random` | G#73, U#30 | Fixad: `crypto.randomUUID`. |
| [x] | Fixad i HEAD | P3 | Image validator HEAD-fallback missar CDNs | G#74, U#71 | HEAD 405/501 har GET fallback + tester. |
| [x] | Fixad nu | P3 | Domain manager polling/save-fail döljs | G#75, U#11, U#12 | Fixad (PR #143): synliga banners + generation-guards. |
| [x] | Fixad nu | P3 | ThinkingOverlay nested `setTimeout` rensas inte | U#1 | Fixad: cleanup i effect. |
| [x] | Fixad nu | P3 | ThinkingOverlay säger "visuell QA" fast default av | U#2 | Fixad: copy justerad. |
| [x] | Inte bug / fixad | P3 | MessageList elapsed interval render-loop | U#3 | `RepairProgressIndicator` cappar vid 300s + clearar. |
| [x] | Fixad i HEAD | P3 | PreviewPanelFrame debounce vid snabb URL-switch | U#4, N#H5 | Debounce + 6s hard-cap, timers rensas. |
| [x] | Fixad i HEAD | P3 | `usePreviewIframe` timers/refs race | U#5, N#H5 | Preview-ready timers rensas vid URL-/identity-byte. |
| [x] | Fixad nu | P3 | ProjectEnvVarsPanel parallella fetches utan abort | U#6, U#79, N#H5 | Fixad (PR #143): gemensam `loaderGenerationRef`. |
| [x] | Fixad i HEAD | P3 | SeoOptInPanel prefs-fetch stale | U#7, N#H5 | Cancelled-guard i cleanup. |
| [x] | Inte bug / UX debt | P3 | F3PlaceholderToggle saknar skeleton | U#8 | Ren polish. |
| [x] | Fixad nu | P3 | VersionHistory actions före mutate synkad | U#9, N#H5 | Fixad: väntar `mutate()` innan in-flight släpps. |
| [ ] | Öppen collaboration-risk | P3 | VersionCollaboration saknar optimistic conflict | U#10 | EDGE: server+klient+kontraktsbeslut. Öppen. |
| [x] | Fixad nu | P3 | Audit PDF inline SVG escaping | U#14, U#73 | Fixad: `escapeHtml` på score-key. |
| [x] | Fixad nu | P3 | Media upload tags JSON saknar shape-validering | U#17 | Fixad: array av strings, max 20. |
| [x] | Fixad nu | P3 | `upload-from-url` konstig `svg+xml`-filändelse | U#19 | Fixad via allowlist + extension map. |
| [x] | Inte bug | P3 | Transcribe accepterar `video/mp4` upp till 25MB | U#22 | Whisper hanterar video-containers. |
| [ ] | Öppen produkt-gap | P3 | Transcribe språkfallback bara sv/en | U#23 | EDGE: produktbeslut (vilka språk). Öppen. |
| [x] | Inte bug | P3 | Unsplash POST gör upp till 3 externa sökningar | U#26 | Hårt capad till max 3 termer. |
| [x] | Fixad nu | P3 | PDF extract fallback regex nonsens | U#27, R#12 | Fixad: `pdf-parse`-fel → `422`. |
| [x] | Fixad nu | P3 | PDF extract strippar icke-Latin-1 | U#28, R#12 | Fixad: bevarar Unicode. |
| [ ] | Öppen preview-risk | P3 | Media local fallback `/api/uploads/media` kanske ej nås av VM | U#29, N#H4 | EDGE: kräver preview-VM-repro. Behöver repro. |
| [x] | Fixad nu | P3 | Originalfiländelse / dubbeländelse okontrollerad | U#31 | Fixad: path-segment saneras, extensionless → `.bin`. |
| [x] | Fixad nu | P3 | Blob path använder rå `projectId` | U#32 | Fixad: path-segment saneras. |
| [x] | Fixad i HEAD | P3 | Registry async refresh stale vid misslyckad fetch | U#35 | Last-good med timestamp/status bevaras. |
| [x] | Fixad nu | P3 | Template search apps/games hint vs game capability | U#39 | Fixad ihop med G#12/G#30. |
| [ ] | Öppen scraper-risk | P3 | Webscraper prioriterar about/services/product/blog | U#42 | EDGE: heuristik-/produkttuning. Öppen. |
| [x] | Fixad nu | P3 | Webscraper strips `www.` jämförelse | U#44 | Fixad: `isSameSiteHost`. |
| [x] | Fixad nu | P3 | `x-forwarded-for` första IP som client-id | U#46 | Fixad: prod ignorerar `x-forwarded-for` om ej explicit flagga. |
| [ ] | Öppen prompt-budget-risk | P3 | OpenClaw chat 180k code context | U#47 | EDGE: prompt-budget-/pipeline-designval. Öppen. |
| [x] | Inte bug / dev ergonomics | P3 | OpenClaw tips kräver modul-restart | U#48 | Avsiktligt modul-init-beteende. |
| [ ] | Öppen session-risk | P3 | D-ID avatar ny `sessionId` om saknas | U#49 | EDGE: D-ID session-/billing-designfråga. Öppen. |
| [x] | Fixad nu | P3 | Inspector Playwright fallback rate bucket | U#51 | Fixad: separata buckets + session-krav. |
| [ ] | Öppen observability-risk | P3 | ErrorBoundary frontlog fire-and-forget | U#53 | EDGE: best-effort-telemetri; retry = loop-/brus-risk. Öppen. |
| [x] | Inte bug / UI-state | P3 | `admin-auth` i localStorage UI-state | U#55 | Admin-API kräver server-side admin session. |
| [ ] | Öppen consent-risk | P3 | cookie-banner mini-game consent | U#56 | EDGE: kräver app-bred audit av analytics-init. Behöver repro. |
| [x] | Fixad nu | P3 | VoiceRecorder/VideoRecorder exhaustive-deps av | U#57 | Fixad: latest-callback refs. |
| [x] | Fixad nu | P3 | LocationPicker exhaustive-deps av | U#58 | Avsiktlig run-once geo-bootstrap, motiverad. |
| [x] | Inte bug / fixad | P3 | ModelTraceOverlay URL/localStorage state | U#59 | localStorage-nyckel redan prefixad. |
| [x] | Fixad nu | P3 | `decodeStoragePathname` malformed `%` | U#61 | Fixad: tydligt storage-fel. |
| [x] | Fixad nu | P3 | Local storage delete false utan UI | U#62 | Fixad delvis: stale error rensas före nytt delete. |
| [ ] | Öppen backoffice-städ | P3 | Backoffice domain-map / manuella paths | U#63 | EDGE: backoffice-städ. Öppen. |
| [x] | Fixad nu | P3 | Metrics route token blind | U#65 | Fixad: 401 loggar token-miss utan tokenvärde. |
| [ ] | Öppen logg-städ | P3 | `console.info` hot paths brus | U#66 | EDGE: bred logg-städ med sampling-policy. Öppen. |
| [x] | Fixad nu | P3 | nanoid/Date fallback deploy-namn | U#69 | Fixad: `randomUUID`-fallback. |
| [x] | Fixad i HEAD | P3 | `getExtension` default `.png` | U#70 | Blob-service defaultar ogiltig extension → `.bin`. |
| [x] | Inte bug / copy debt | P3 | Shadcn category emojis enterprise | U#74 | Copy/brand-städ. |
| [x] | Fixad i HEAD | P3 | Template-search diakritik strip | U#75 | `normalizeForSearch` NFD + strip. |
| [ ] | Öppen preview-risk | P3 | `previewUrlHint` base path + chatId | U#77 | EDGE: täcks av tester; full verifiering kräver live preview-host. Behöver repro. |
| [x] | Inte bug / ej bekräftad | P3 | SSE ping `Date.now` var 15s loggar | U#78 | Ingen `console.*`-logg kopplad till pingen. |
| [x] | Fixad nu | P3 | `svävande`/`hovrande` ensamma triggar `needs3D` | N#7 | Fixad: ger `needsMotion`; spel-regex utökad. |

---

## Avskrivet / inte bug (historisk)

| Källa | Fynd | Bedömning |
| --- | --- | --- |
| G#6 | Dep-completer missar CSS/`require()`/dynamic import | Inte bug / fixad; test täcker fallen. |
| G#23 | `feature-runtime` env keys blockerar inte F3 | Inte bug / beslutad arkitektur. |
| G#41, G#42 | `/api/v0/*` finns kvar | Inte bug; API-version/naming debt. |
| G#43, U#40 | `TemplateCatalogSource = "v0"` | Inte bug; naming debt. |
| G#44 | `ModelProviderFamily` innehåller `v0` | Inte bug; naming debt. |
| G#45, U#76 | `demoUrl`, `webhook:v0`, `v0-catalog` kvar | Inte bug; terminologistäd. |
| G#69, U#25 | Unsplash `placehold.co` fallback | Inte bug / fallback. |
| G#72, U#67, U#68 | Date formatting locale/timezone | Inte bug; rapportpolicy. |
| U#8 | F3PlaceholderToggle saknar skeleton | Inte bug; UX debt. |
| U#22 | Transcribe accepterar `video/mp4` | Inte bug; Whisper hanterar video. |
| U#26 | Unsplash POST upp till 3 sökningar | Inte bug; hårt cappad. |
| U#48 | OpenClaw tips kräver modul-restart | Inte bug; modul-init. |
| U#74 | Shadcn category emojis enterprise | Inte bug; copy/brand-städ. |

---

## Defensiv nytriage 2026-05-01 (historisk mappning)

| Källa | Inkommande fynd | Backlogg-koppling | Beslut |
| --- | --- | --- | --- |
| N#1 | Autofix-stubbar / tomma ersättningsfiler | Ny P1-rad | Bekräfta — vägra dossier-stubbar eller markera blocker/degraded. |
| N#2 | Capability/dossier single source | G#25, G#26 | Bekräfta mot canonical källa. |
| N#3 | Follow-up context-budget | Ny P2-rad | Bekräfta som regression-gate. |
| N#4 | Tysta verify-skips | G#10, G#31, G#32 | Bekräfta; warm/cold cache + runtime/UI-gap falskt-grönt-risker. |
| N#5 | Recurring verifier-fynd in i nästa prompt | Ny P2-rad | Bekräfta (E3 i `Kvarvarande-uppgifter.md`). |
| N#6 | Event-bus UI-flip | Ny P2-rad | LÖST (Område 6). |
| N#H1 | Full testsvit / stale `domain-map.json` | G#3 | LÖST. |
| N#H2 | F3 readiness truth | G#20, G#21 | Bekräfta. |
| N#H3 | Product Postcheck default i preview/staging | G#10 | Bekräfta (flaggstyrd default-off, fail-open). |
| N#H4 | Placeholder/degraded-state policy | G#17, G#22, G#35, G#51, U#29 | Policyspår: placeholder får inte signalera success. |
| N#H5 | UI race cleanup | U#4, U#5, U#6, U#7, U#9 | LÖST (UI-race-städ). |

### Äldre rapportöverlapp 2026-05-01 (historisk)

| Källa | Inkommande fynd | Koppling | Beslut |
| --- | --- | --- | --- |
| R#1 | `/api/domains/save` owner-check | G#2 | Redan fixad i HEAD. |
| R#2 | `/api/company-profile?companyName=` scope | G#4 | Redan fixad. |
| R#3 | `/api/download` legacy owner-scope | G#1 | Redan fixad. |
| R#4 | Engine download-route | — | Ej bugg; tenant-scoped helper. |
| R#5 | Preview update + `.env.local` | G#8, G#9 | Redan fixad. |
| R#6 | F2 "grön" men runtime/UI-problem | G#10, N#4, N#H3 | Design-risk (Product Postcheck ej default blockerande). |
| R#7 | F3 env resolver överkrav/stale snapshot | G#20, G#21, G#25 | Edge; fokus snapshot-färskhet + follow-up-detektion. |
| R#8 | Dep-completer css/require/dynamic import | G#6 | Avfärda; test täcker. |
| R#9 | Scaffold required files tappas | Ny P3-rad | Edge; deterministisk preflight/export-verifiering om repro. |
| R#10 | Game/interactive-canvas capability-gap | G#12, G#30 | Avfärda; `needsGame` finns. |
| R#11 | `/api/transcribe` utan auth | Fixad 2026-05-01 | Kräver user/guest-session. |
| R#12 | `/api/text/extract` utan auth | G#38, U#27, U#28 | Delvis fixad; 10MB/CPU-policy kvar (G#38). |
| R#13 | Media upload MIME/tags | G#37, U#17 | Fixad 2026-05-01. |

---

## Grandmaster B01–B15 (pekare)

Full B-serie-detalj (verdikt-tabell, per-bugg-ankare, körordning) ligger i [`README.md`](README.md) i samma mapp. Kvarvarande öppna B-spår (B12, B13, B01-klient) lever i rotfilens "Behöver repro".

## Deferrad härdning / arkitektur (medvetet uppskjutet — pekare)

Dessa är arkitektur-/deploy-topologi-beslut, inte buggar. Kort pekare i rotfilens "Beslut & policy"; full detalj här:

| Allvar | Post | Vad | Beslut / blockare |
| --- | --- | --- | --- |
| Medel–hög (korrekthet) | B3 / E2 | Event-bus in-memory/efemär → multi-instans kan splittra status/finalize | Ofarlig på single-instance Render; risk på serverless/multi-instans. Deploy-topologi-beslut. |
| Låg–medel | B1 | S3 single-writer-status warn-only-lane → blockerande `test:ci` | Lane-arkitekturbeslut. Deterministiskt test, flyttbart. |
| Låg (hygien) | B4 | Canvas auto-PR via `GITHUB_TOKEN` → ingen CI på den PR:en | Dedikerad `CANVAS_PR_TOKEN` (secret-beslut, protected path). |
| — | F4 / F5 | Odefinierade bus-emits / manifest `perTier*`-Zod-validering | Se closing-handoff Appendix C. |
| Hög (säkerhet) | B7 / #140 | DB+Blob-gate-PR bot-fynd (Codex P1 + Bugbot High) | Annans infra-spår; öppen PR #140. |

### Appendix — policybeslut (systemet funkar som det är)

| Post | Vad | Status |
| --- | --- | --- |
| B05 / A7-2 | `refuseDossierStubs` kod-default OFF (env satt i Vercel) | Beslut: flippa kod-default eller ej. Kod-fix (scope) mergad #211. |
| B07 | publik vs privat media | Valt **öppet**; säkerhet som eget senare pass. |
| B08 | quality-gate fail-open | Valt **släpp igenom**; felet loggas via `console.warn`. |

### Observationer (repo-städ-pass 2026-06-22, historisk)

| Prio | Fynd | Beslut |
| --- | --- | --- |
| Låg | `error_log_events` append-only utan auto-gallring | Gallrings-/TTL-policy som eget pass. |
| Låg | Test-läckage: `ver_1`/`ver_golden_1`/`ver_test_1` skriver `data/runs/` mot riktig cwd | Lokal-only (gitignorad); test-hygien. |
| Låg | `config/dashboard/` namnskuld (load-bearing) | Samma spår som U#63; eget pass. |
| P3 (data-hygien) | `company_profiles` orphan vid projekt-radering | FIXAD #190. |
