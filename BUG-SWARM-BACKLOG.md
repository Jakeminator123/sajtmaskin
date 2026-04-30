# Bug-backlog (konsoliderad)

Kanonisk lista efter sammanslagning av de tidigare rålistorna: `BUG-SWARM-BACKLOG-MASTER.md`, `BUG-SWARM-BACKLOG.md` och `gpt_sammanställnin.txt`. De rålistorna är borttagna; den här filen är nu enda aktiva backloggen.

## Legend

| Markering | Status | Regel |
| --- | --- | --- |
| `[x]` | Avslutad | Läs `Status`-kolumnen för om raden är `Fixad`, `Fixad i HEAD` eller `Inte bug`. |
| `[ ]` | Öppen | Bug, risk eller städpunkt som inte ska bockas av förrän den är verifierad/fixad. |

Källor: `G#` = gamla GPT/masterlistan, `U#` = gamla UI/media-svärmlistan.

## Lista

| Klar | Status | Prio | Fynd | Källa | Beslut / nästa steg |
| --- | --- | --- | --- | --- | --- |
| [x] | Fixad i HEAD | P0 | `/api/download` owner-scope för ZIP | G#1 | Fixad i senaste commit: routen använder scoped version-helper och har test. |
| [x] | Fixad i HEAD | P0 | `/api/domains/save` deployment utan owner-scope | G#2 | Fixad i senaste commit via `setDeploymentDomainForRequest` och test. |
| [ ] | Öppen verifiering | P0 | Full testsvit failar pga stale `domain-map.json` | G#3 | Kör full testsvit när backloggfixarna är klara. |
| [x] | Fixad i HEAD | P1 | `companyProfile?companyName` global lookup | G#4 | Fixad i senaste commit med owner/session-scope och test. |
| [x] | Fixad i HEAD | P1 | Domain link/verify accepterar arbitrary `projectId` | G#5 | Fixad i senaste commit med projekt-scope och test. |
| [x] | Inte bug / fixad | P1 | Dep-completer missar CSS/`require()`/dynamic import | G#6 | Avskriven: test täcker side-effect CSS, CommonJS och dynamic imports. |
| [x] | Fixad i HEAD | P1 | `/api/text/analyze` auth ignorerad | G#7 | Fixad i senaste commit och testad. |
| [x] | Fixad nu | P1 | Same-sandbox preview update skickar inte om `.env.local` | G#8 | Fixad: update-path bygger om `.env.local` via `buildPreviewEnvLocalContents()` innan `updatePreviewHostSession`. |
| [x] | Fixad nu | P1 | Env merge kan skippas vid preview update | G#9 | Fixad med samma update-path som G#8; täckt av `preview-session.test.ts`. |
| [ ] | Öppen design-risk | P1 | F2 quality gate fångar inte runtime/UI-fel | G#10 | Lägg separat runtime smoke/postcheck, inte bara typecheck. |
| [ ] | Öppen testlucka | P1 | Ingen runtime smoke för WebGL/3D | G#11 | Lägg WebGL/Canvas-smoke i verifiering utan att röra live-builder. |
| [ ] | Öppen produktbugg | P1 | Ingen tydlig game/interactive capability | G#12 | Lägg canonical capability eller styrning för spel/interactive canvas. |
| [ ] | Öppen kvalitet-risk | P1 | Simplified brief fallback sänker premium/3D | G#13 | Begränsa fallback eller markera som degraded mode i generationen. |
| [ ] | Öppen drift-risk | P1 | Rate limit faller tillbaka till per-instance memory utan Redis | G#14, U#45 | Kräv Redis i prod eller gör fallback tydligt degraded. |
| [x] | Fixad nu | P1 | `default-seed` kan ge predikterbara slug-lösen | G#15 | Fixad: lösen kräver `KOSTNADSFRI_PASSWORD_SEED`, `KOSTNADSFRI_API_KEY` eller explicit secret. |
| [ ] | Öppen städ | P2 | `process.env` drift utanför `env.ts` | G#16 | Audita mot `src/lib/env.ts` och `config/env-policy.json`. |
| [ ] | Öppen design-risk | P2 | `allowPlaceholdersInF3` kan släppa stub secrets | G#17 | Låt bara explicita dev/test-lägen tillåta placeholders. |
| [ ] | Öppen docs-städ | P2 | Dubbla env-docs och genererad `.env.local`-sanning | G#18 | Konsolidera docs runt `docs/ENV.md` och env-policy. |
| [ ] | Öppen drift-risk | P2 | Generated `.env.local` kan vinna över user env | G#19 | Dokumentera/ändra precedence i preview-env-byggaren. |
| [ ] | Öppen bug | P2 | F3 Build Plan saknas när follow-up inte återinfererar integration | G#20 | Återanvänd Snapshot-Brief + faktisk version/imports. |
| [ ] | Öppen bug | P2 | `/finalize-design` kan säga ready utan integrationkrav | G#21 | Readiness ska spegla faktiska F3-krav. |
| [ ] | Öppen bug | P2 | Hard dossiers ger placeholder UI i stället för blocker | G#22 | Blocka eller degradera explicit när required integration saknas. |
| [ ] | Öppen design-risk | P2 | `feature-runtime` env keys blockerar inte F3 | G#23 | Bestäm vilka env-krav som ska vara blockerande. |
| [ ] | Öppen kvalitet-risk | P2 | Dossier verbatim-missing bara warning | G#24 | Gör blockerande för required dossier-innehåll. |
| [ ] | Öppen kvalitet-risk | P2 | Dossier/capability-threading svagt vissa paths | G#25 | Verifiera init/follow-up/dossier bridge. |
| [ ] | Öppen bug | P2 | Init och follow-up har olika capability-universum | G#26 | Konsolidera capability-källa och följ ägarmatrisen. |
| [x] | Fixad i HEAD | P2 | `canvas` triggar 3D för 2D/dekorativa canvas | G#27 | Fixad i tidigare commit: dekorativ 3D och physics delas, med tester. |
| [ ] | Öppen bug | P2 | `needsPhysics` triggar inte heavy budget | G#28 | Koppla physics-capability till budget/build intent. |
| [ ] | Öppen produkt-risk | P2 | Forms/auth/payments/parallax räknas inte som heavy | G#29 | Definiera vilka capabilities som höjer budget. |
| [ ] | Öppen produkt-risk | P2 | Kort prompt med spel/game/shadcn missar capability-kontext | G#30 | Lägg prompt-heuristik i canonical owner, inte i konsument. |
| [ ] | Öppen verifier-risk | P2 | Warm tsc/eslint fail-open vid kall cache | G#31 | Faila tydligare eller kör kall-cache fallback. |
| [ ] | Öppen design-risk | P2 | Preview kan visas trots verifier-blocked draft | G#32 | UI ska skilja preview-materialisering från verifierad version. |
| [ ] | Öppen kvalitet-risk | P2 | LLM-verifier ser snippets, inte hela filer | G#33 | Ge verifieraren rätt filkontext eller begränsa claimen. |
| [ ] | Öppen kvalitet-risk | P2 | Max 1 partial-file repair attempt | G#34 | Höj/kontextualisera repair-budget. |
| [ ] | Öppen UX-risk | P2 | Placeholder-bild maskerar trasigt original | G#35, U#72 | Visa placeholder som degraded state, inte success. |
| [x] | Fixad nu | P2 | `upload-from-url` läser body före size-check | G#36, U#20 | Fixad: content-length precheck + streamad läsning med 4MB stopp. |
| [x] | Fixad nu | P2 | SVG/HTML tillåts i media-upload | G#37, U#15, U#16 | Fixad: `image/svg+xml` och `text/html` tas bort ur upload-allowlist. |
| [ ] | Öppen policy-fråga | P2 | Publik PDF-parse-yta / 10MB input | G#38, U#27, U#28 | Bestäm om text-extract ska kräva auth och språkbevarande parse. |
| [x] | Fixad nu | P2 | Transcribe loggar första 80 chars | G#39, U#21 | Fixad: loggar bara transcript-längd. |
| [ ] | Öppen säkerhetsrisk | P2 | Inspector SSRF-edge publik DNS -> privat IP | G#40, U#50 | Verifiera DNS-rebind/private-IP-guard. |
| [x] | Inte bug | P3 | `/api/v0/*` finns kvar | G#41, G#42 | Avsiktlig API-version/naming debt, inte runtime-bugg. |
| [x] | Inte bug / naming debt | P3 | `TemplateCatalogSource = "v0"` | G#43, U#40 | Inte bug; kan städas separat om glossary/legacy-plan kräver. |
| [x] | Inte bug / naming debt | P3 | `ModelProviderFamily` innehåller `v0` | G#44 | Inte bug; naming debt. |
| [x] | Inte bug / naming debt | P3 | `demoUrl`, `webhook:v0`, `v0-catalog` kvar | G#45, U#76 | Inte bug; terminologistäd senare. |
| [ ] | Öppen reproducibility-risk | P3 | Root lockfile saknas | G#46 | Verifiera root package-manager-beslut innan fix. |
| [ ] | Öppen städ | P3 | ESLint-varningar / sync setState / unused | G#47 | Kör lint och fixa inom scope. |
| [ ] | Öppen scaffold-risk | P3 | Placeholder copy kvar i scaffoldfiler | G#48 | Greppa scaffoldcopy och ersätt konkret text. |
| [ ] | Öppen scaffold-risk | P3 | Dashboard `[Företagsnamn]` kan slinka igenom | G#49 | Gör blocker eller materialisering. |
| [ ] | Öppen scaffold-risk | P3 | Blog placeholder body | G#50 | Byt defaulttext eller verifiera bort. |
| [ ] | Öppen UX-risk | P3 | Placeholder CTAs non-blocking | G#51 | Markera som warning/blocker beroende på lane. |
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
| [ ] | Öppen UI-bug | P3 | ThinkingOverlay nested `setTimeout` rensas inte vid unmount | U#1 | Rensa timer refs i cleanup. |
| [ ] | Öppen copy-risk | P3 | ThinkingOverlay säger "visuell QA" fast default kan vara av | U#2 | Koppla copy till faktisk flagga. |
| [ ] | Öppen perf-risk | P3 | MessageList elapsed interval kan trigga render-loop | U#3 | Begränsa intervallet till aktiva messages. |
| [ ] | Öppen UI-race | P3 | PreviewPanelFrame debounce + hard-cap vid snabb URL-switch | U#4 | Abortera gamla loads och verifiera URL-token. |
| [ ] | Öppen UI-race | P3 | `usePreviewIframe` timers/refs race tier2/shim | U#5 | Samla timers/abort i en state machine. |
| [ ] | Öppen UI-race | P3 | ProjectEnvVarsPanel parallella fetches utan gemensam abort | U#6, U#79 | Lägg request-token/abortcontroller. |
| [ ] | Öppen UI-race | P3 | SeoOptInPanel prefs-fetch stale vid snabb open/close | U#7 | Abortera prefs-fetch vid close/unmount. |
| [x] | Inte bug / UX debt | P3 | F3PlaceholderToggle saknar skeleton | U#8 | Inte bug; ren polish. |
| [ ] | Öppen UI-race | P3 | VersionHistory actions före mutate synkad | U#9 | Disable actions eller optimistic state tills mutate klart. |
| [ ] | Öppen collaboration-risk | P3 | VersionCollaboration saknar optimistic conflict | U#10 | Lägg conflict UI eller etag/version guard. |
| [ ] | Öppen PDF-risk | P3 | Audit PDF inline SVG escaping | U#14, U#73 | Escape/testa SVG-innehåll. |
| [x] | Fixad nu | P3 | Media upload tags JSON saknar shape-validering | U#17 | Fixad: endast array av strings sparas, max 20 tags. |
| [x] | Fixad nu | P3 | `upload-from-url` kan skapa konstig `svg+xml`-filändelse | U#19 | Fixad via allowlist + explicit extension map. |
| [x] | Inte bug | P3 | Transcribe accepterar `video/mp4` upp till 25MB | U#22 | Avsiktligt: Whisper hanterar video-containers. |
| [ ] | Öppen produkt-gap | P3 | Transcribe språkfallback bara sv/en | U#23 | Lägg fler språk eller gör valet explicit. |
| [x] | Inte bug | P3 | Unsplash POST gör upp till 3 externa sökningar | U#26 | Redan hårt capad till max 3 termer. |
| [ ] | Öppen PDF-risk | P3 | PDF extract fallback regex nonsens | U#27 | Byt fallback eller returnera tydligt unsupported. |
| [ ] | Öppen i18n-risk | P3 | PDF extract strippar icke-Latin-1 | U#28 | Bevara Unicode-text. |
| [ ] | Öppen preview-risk | P3 | Media local fallback `/api/uploads/media` kanske ej nås av VM | U#29 | Kräv Blob för preview eller visa tydligt degraded state. |
| [x] | Fixad nu | P3 | Originalfiländelse / dubbeländelse okontrollerad | U#31 | Fixad delvis vid blob-namn: path-segment saneras och extensionless filer defaultar till `.bin`, inte `.png`. |
| [x] | Fixad nu | P3 | Blob path använder rå `projectId` | U#32 | Fixad: blob path-segment för user/project/filename saneras innan upload. |
| [ ] | Öppen cache-risk | P3 | Registry async refresh stale vid misslyckad fetch | U#35 | Behåll last-good med timestamp/status. |
| [ ] | Öppen search-risk | P3 | Template search apps/games hint vs saknad game capability | U#39 | Lös ihop med G#12/G#30. |
| [ ] | Öppen scraper-risk | P3 | Webscraper prioriterar about/services/product/blog | U#42 | Justera ranking efter domain/site-type. |
| [ ] | Öppen scraper-risk | P3 | Webscraper strips `www.` jämförelse | U#44 | Normalisera host jämnt. |
| [ ] | Öppen rate-limit-risk | P3 | `x-forwarded-for` första IP används som client-id | U#46 | Lita bara på trusted proxy/header-policy. |
| [ ] | Öppen prompt-budget-risk | P3 | OpenClaw chat 180k code context | U#47 | Lägg sammanfattning/chunking. |
| [x] | Inte bug / dev ergonomics | P3 | OpenClaw tips kräver modul-restart | U#48 | Avsiktligt modul-init-beteende; kan dokumenteras. |
| [ ] | Öppen session-risk | P3 | D-ID avatar ny `sessionId` om saknas | U#49 | Persist/återanvänd session tydligare. |
| [ ] | Öppen rate-limit-risk | P3 | Inspector Playwright fallback rate bucket | U#51 | Separera buckets för fallback/dyr path. |
| [ ] | Öppen observability-risk | P3 | ErrorBoundary frontlog fire-and-forget | U#53 | Lägg retry/visible degraded state om post misslyckas. |
| [ ] | Öppen auth-audit | P3 | `admin-auth` i localStorage UI-state | U#55 | Bekräfta att detta inte är auth-sanning. |
| [ ] | Öppen consent-risk | P3 | cookie-banner mini-game consent | U#56 | Verifiera att tracking inte startar före consent. |
| [ ] | Öppen React-städ | P3 | VoiceRecorder/VideoRecorder exhaustive-deps av | U#57 | Fixa hooks eller dokumentera stabila deps. |
| [ ] | Öppen React-städ | P3 | LocationPicker exhaustive-deps av | U#58 | Fixa hooks eller dokumentera stabila deps. |
| [ ] | Öppen debug-risk | P3 | ModelTraceOverlay URL/localStorage state | U#59 | Prefixa/sanera debug-state. |
| [x] | Fixad nu | P3 | `decodeStoragePathname` malformed `%` | U#61 | Fixad: malformed percent-encoding ger tydligt storage-fel i stället för rå `URIError`. |
| [ ] | Öppen UX-risk | P3 | Local storage delete false utan UI | U#62 | Visa toast/fel. |
| [ ] | Öppen backoffice-städ | P3 | Backoffice domain-map / manuella paths | U#63 | Synka med `backoffice/shared.py` om ytan rörs. |
| [ ] | Öppen observability-risk | P3 | Metrics route token blind | U#65 | Logga token-miss utan läckage och returnera rätt status. |
| [ ] | Öppen logg-städ | P3 | `console.info` hot paths brus | U#66 | Gå över till debug-log med sampling. |
| [ ] | Öppen naming-risk | P3 | nanoid/Date fallback deploy-namn | U#69 | Gör deterministic eller collision-safe. |
| [ ] | Öppen extension-risk | P3 | `getExtension` default `.png` | U#70 | Tvinga extension från MIME i upload-paths. |
| [x] | Inte bug / copy debt | P3 | Shadcn category emojis enterprise | U#74 | Inte bug; copy/brand-städ. |
| [ ] | Öppen search-risk | P3 | Template-search diakritik strip | U#75 | Lägg Unicode-aware normalisering. |
| [ ] | Öppen preview-risk | P3 | `previewUrlHint` base path + chatId | U#77 | Verifiera URL-byggare mot preview-host. |
| [ ] | Öppen logg-städ | P3 | SSE ping `Date.now` var 15s loggar | U#78 | Sampla eller sänk loggnivå. |
