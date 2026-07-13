# Preview Host

Den har mappen ar ett avgransat spar for preview-host-tjansten som nu ar den primara tier-2-previewvagen nar `SAJTMASKIN_PREVIEW_HOST_BASE_URL` ar satt. Tanken ar fortfarande att den ska kunna lyftas ut till ett eget repo senare utan att blanda ihop sig med Sajtmaskins `src/`.

## Detta spar relativt preview-systemet

Detta spar ska ses som den **nuvarande primara preview-host/VM-vagen** for tier-2 live-preview, medan vissa `sandbox`-namn i huvudappen fortfarande ar legacy-kontrakt och naming debt.

Tanken ar inte att ersatta own-engine, buildern eller `files_json`, utan att vara det separata runtime-lager som startar och ager tier-2 preview.

I praktiken betyder det:

- Sajtmaskin fortsatter aga generering och versioner
- `engine_versions.files_json` fortsatter vara kanonisk artifact
- `preview-host` blir en separat tjanst for preview-sessioner, leases, status och senare riktig runtime

## ID och nycklar

- **`appProjectId`** = Sajtmaskins riktiga projekt-id per anvandarprojekt. Det hor hemma i buildern, tenant/ownership och projekt-env.
- **`chatId`** = own-engine-chattens id. Det ar **den faktiska runtime-/path-nyckeln i preview-host idag**.
- Preview-hosts publika path ar darfor **`https://...fly.dev/{chatId}`**, inte `/{appProjectId}`.
- Under rollout accepterar preview-host fortfarande legacy-faltet **`projectId`** i inkommande payload, men det tolkas som alias for **`chatId`**.

## Status (2026-04-07)

### Vad som fungerar

- Fly-app `vm-fly-jakem` koer pa 4 vCPU / 8 GB RAM (per `fly.toml [[vm]]`, uppskalat under M#fly1) i `arn` (Stockholm)
- Persistent Fly volume `preview_host_data` ar monterad pa `/data` for workspaces och session-store (nuvarande deploy: 20 GB)
- `preview-host` tar emot preview-payloads via HTTP, koer `npm install` + `npm run dev` pa Fly-maskinen
- `preview-host` kor ocksa en isolerad **verify-lane** for quality gate (`npm install` + `tsc` / `next build` / ev. `eslint`) i separat workspace
- preview-URL `https://vm-fly-jakem.fly.dev/<chatId>` serverar riktiga SSR-renderade Next.js-sajter
- Sajtmaskins huvudapp har tier-2-providerlager som valjer `preview_host` framfor Vercel Sandbox
- samma `chatId` ateranvander normalt samma preview-session/path; ny version restartar runtime med nya filer i stallet for att skapa en helt separat lane
- vantesida visas i iframen medan projektet bootar (auto-reload var 4:e sekund)
- workspace-caching: `node_modules` ateranvands om `package.json` inte andrats
- binary assets (bilder, fonts) stods via `base64:`-prefix i `filesJson`; `writeFilesIntoWorkspace` skriver dem som binara buffers
- verify-jobb serialiseras sinsemellan (`verifyQueue`), och ALLA installs (boot + verify) gar dessutom genom den globala `installQueue` (concurrency 1, se M#fly1-punkten nedan) sa att flera tunga `npm install`/`tsc` aldrig kor samtidigt
- `GET /admin/storage`, `GET /admin/sessions`, `POST /admin/cleanup` och `POST /admin/destroy-all` finns for drift och felsokning
- sessionstiden ar nu forenklad till cirka 1 timme pa bade host och app-sida
- cleanup stoppar nu stale runtime-processer innan utgangna sessioner, loggar och workspace-mappar tas bort
- **minnestryck (M#fly1, 2026-07-02):** alla installs (live-boot + verify) serialiseras genom en global `installQueue` (concurrency 1) sa att tva tunga `npm install` aldrig kor samtidigt; `fly.toml` har `swap_size_mb = 2048` som stotdampare. Varje install-forsok har en hard timeout (`PREVIEW_HOST_INSTALL_TIMEOUT_MS`, default 10 min; 0 = av) som dodar hela processtradet och later kon ga vidare — annars skulle en hangd install (t.ex. ett genererat `preinstall`-script) kila fast alla senare boots/verifies tills VM-omstart. Riktade guard-tester: `npm run test:guards`
- **idle-reaper:** en dev-runtime utan proxytrafik och utan oppen preview-WebSocket (≈ ingen oppen iframe) stoppas efter `PREVIEW_HOST_RUNTIME_IDLE_STOP_MS` (default 10 min; 0 = av) och sessionen markeras `hibernated` — nasta besok bootar om den via vantesidan. Svepintervall: `PREVIEW_HOST_RUNTIME_IDLE_SWEEP_INTERVAL_MS` (default 60 s). Klientens hibernate (pagehide/dold tab) ar fortfarande forsta forsvarslinjen; reapern ar VM-sidans skyddsnat nar det anropet inte nar fram
- **boot-serialisering per chat (prod-incident 2026-07-03):** alla runtime-boots for samma chat kedjas strikt efter varandra (`ensureRuntimeForChat`), och restart-boots som star i ko coalescas till EN boot som laser senaste filesJson nar den kor. Tidigare slapptes flera vantande restart-boots losa parallellt nar den pagaende booten blev klar → tva dev-servrar spawnades (EADDRINUSE), den forsta processen blev foraldralos och holl Next 16:s workspace-dev-lock ("Another next dev server is already running") tills sessionen hibernerade utan preview. `spawnDevServer` stoppar dessutom alltid ev. tidigare trackad child innan en ny spawnas (defense-in-depth). Guard-tester: `npm run test:guards`
- **prewarm-ownership (2026-07-11):** `prewarm:true` får bara skapa en oägd chat under persistent store-lås. Skelettet är aldrig publikt: HTTP visar hostens startsida och **alla** WebSocket-upgrades nekas tills riktig boot passerat readiness. Ett misslyckat realt övertagande visar stabil 503 utan refresh/restart-loop; explicit app-retry kan återgå till `starting`. Vanliga icke-prewarm-restarts fortsätter visa last-good. En host-lease per kanonisk app-rate-limit-identitet skyddar installkön före kreditsettlement; bootfel behåller cooldown, medan real claim/destroy/cleanup/expiry/reset släpper den. Kartan normaliseras/prunas och har fast kod-cap 4096; `/admin/storage` visar bara count/tidigaste expiry/cap. Guard + proxykontraktstest: `npm run test:guards` / `npm run test:proxy-contract`.

### Vad som inte fungerar annu

- **Deploy/restart**: sessionmetadata overlever pa volymen, men runtime-processerna maste fortfarande startas om. Recover bygger pa status/bootstrap och ar inte "magi" over deploy.
- **CSP-header**: `frame-src` i huvudappens CSP-policy listar bara `*.vercel.run` / `*.vercel.app`, inte `*.fly.dev`. Det ger report-only-varningar i konsolen (blockerar inte iframen an men bor fixas).
- **Forsta boot ar seg** (2-5 min for riktiga Next-projekt med tunga deps som `three.js`). Workspace-caching hjalper vid andra koerningen men forsta ar fortfarande lang.
- **Aktiv workspace-storlek**: ett levande preview-projekt kan fortfarande bli hundratals MB stort (framfor allt `node_modules` och dev-artifacts), sa diskforbrukningen sjunker forst efter cleanup eller destroy.
- **Cleanup ar nu stop-then-delete**: preview-host forsoker stanga stale dev-processer innan sessionmetadata och workspace tas bort. Misslyckas stoppet bevaras session/logg/workspace till nasta cleanup-pass i stallet for att rensa under en levande process.

### Tier 2 / export — vanliga generiska fel (inte VM-specifika)

- **`next` is not recognized** efter nedladdning: kör `npm install` fore `npm run dev` (samma som lokalt).
- **`npm audit fix`**: valfritt rad fran npm, inte ett krav for preview.
- **Readiness** vantar pa HTTP 200 HTML med tillrackligt med synlig text i `<body>`; tom sida efter nagra forsok loggas som varning men accepteras (annars blockerar vi legitima RSC-/compile-faser for lange).
- **basePath / CSS som saknas i iframen**: publik URL ar `https://...fly.dev/{chatId}/...`. Utan `basePath` pekar HTML pa `/_next/...` mot hostroten (404) → sidan ser ut som "ren HTML". Runtime satter `SAJTMASKIN_PREVIEW_BASE_PATH=/{chatId}` och proxyn skickar **full** path till `next dev`; `next.config.ts` maste respektera env (scaffold + patch pa workspace vid boot).
- **`/placeholder.svg` mot hostroten (404)**: motorn instruerar `<img src="/placeholder.svg?...">`. Webblasaren fragar da `https://...fly.dev/placeholder.svg`, inte under `/{chatId}/`. Preview-host svarar darfor pa `GET /placeholder.svg` med samma SVG som Sajtmaskin-huvudappens `/api/placeholder`. Baseline-scaffold inkluderar aven `app/api/placeholder` + rewrite for zip/export utan Fly.
- **Root-absoluta Next-interna requests (`/__nextjs_font/*`, `/_next/*`)**: Next dev-overlay/devtools begar egna assets (t.ex. `geist-latin.woff2`) pa hostroten UTAN chatId-prefix och struntar i basePath. Proxyn tolkade tidigare `__nextjs_font` som chatId → generisk JSON-404. Nu finns en Referer-fallback (`nextInternalRefererFallback` i `runtime.js`, HTTP + WS-upgrade): chatId hamtas fran Referer-headerns forsta path-segment och requesten proxas till `/{chatId}{originalPath}`. Utan Referer (strikt referrer-policy) faller den fortfarande till 404 — kosmetiskt, overlayn tar systemfont. Nar Referer finns proxas requesten till ratt runtime; `proxyPreviewRequest` strippar da ocksa `Origin` for interna Next-paths sa Next 16:s `blockCrossSiteDEV` inte 403:ar assetet (se Origin-strip-noten nedan).

### Drift pa Fly

| Resurs | Varde |
|--------|-------|
| Maskin | 4 vCPU, 8 GB RAM (`fly.toml [[vm]]`) + `swap_size_mb = 2048` |
| Volume | `preview_host_data`, 20 GB, `/data` |
| Region | `arn` (Stockholm) |
| Secret | `PREVIEW_HOST_DATA_DIR=/data` |
| Kostnad | ca 60-70 USD/man om maskinen står på 24/7 |

### Env i Sajtmaskins `.env.local` (repo-roten)

```env
SAJTMASKIN_PREVIEW_HOST_BASE_URL=https://vm-fly-jakem.fly.dev
SAJTMASKIN_PREVIEW_HOST_API_KEY=...
NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES=fly.dev
```

Lägg **inte** `PREVIEW_HOST_DATA_DIR`, `PREVIEW_HOST_API_KEY` eller `DATA_DIR` i repo-rotens `.env.local`. De hör till Fly-tjänsten.

## Nästa steg nu

Nu är vi förbi första deployen. Det viktigaste nästa steget är inte fler features direkt, utan att göra prototypen **mer korrekt** för hur den faktiskt fungerar idag.

### Varför detta behov finns

Sessioner skrivs till **JSON-fil** (atomiskt rename) under `PREVIEW_HOST_DATA_DIR` (default `./data` i containern).

- sätt samma katalog på en **Fly volume** om du skalar till flera machines
- för icke-lokal drift: sätt `PREVIEW_HOST_API_KEY` på servern och samma värde som `SAJTMASKIN_PREVIEW_HOST_API_KEY` i appen (`Authorization: Bearer ...` eller `X-Preview-Host-Key`)

### Nästa steg (handoff)

1. **Persistera sessions över restart**: sessioner måste sparas/återhämtas från volymen när `preview-host` startar om, så att builderns iframe inte tappar sin preview efter deploy.
2. **CSP-header**: lägg till `*.fly.dev` i `frame-src` i huvudappens CSP-konfiguration (`next.config` eller `middleware.ts`).
3. **Snabbare första boot**: förinstallera baseline-deps i Dockerfile eller cacha `node_modules` på volymen mer aggressivt.
4. **Autofix-loop**: throttla antal parallella preview-host-boots per chatt sa att autofix inte skapar 4 samtida install+dev-starter.
5. ~~**Observerbarhet**: tydligare loggning av Next.js stdout/stderr i runtime-loggar.~~ **Klart (2026-06-25):** `spawnDevServer` haller nu en ringbuffert (senaste ~60 rader) av `next dev` stdout/stderr och flushar en tail (~30 rader) till runtime-loggen vid **onormal** exit (krasch/boot-fel). Rena stopp (hibernate/destroy/restart) satter `ignoreExit` och dumpar inget, sa store:n floodas inte av HMR-brus.

### Kanda begransningar (acceptabla pa F2)

- **Forsta boot ar fortfarande seg pa tunga deps.** Workspace-cachen hjalper vid andra koerningen, men forsta `npm install` pa ett nytt projekt kan ta minuter.
- **Aktiv preview-workspace kan bli stor** — framfor allt pga `node_modules` och dev-artifacts. Diskanvandning sjunker forst efter cleanup eller destroy.

### Next.config-patch (AST + regex-fallback)

`patchNextConfigForPreviewBasePath` (i `src/runtime.js`) injicerar `basePath` + en `webpack`-mutator (som filtrerar bort `HotModuleReplacementPlugin` nar `SAJTMASKIN_PREVIEW_DISABLE_HMR=true`) i workspaceens `next.config.{ts,mjs,js}` vid varje boot. Detta fixar `basePath` for `/{chatId}`-prefixet.

**HMR-WebSocket-tystnad (2026-04-23):** Next 15:s app-router Fast Refresh ship:ar en egen WebSocket-klient som *inte* sitter i `HotModuleReplacementPlugin`, sa plugin-filtret rackte inte. I stallet gor `proxyPreviewUpgrade` i `src/runtime.js` en inline RFC 6455 101-handshake (`acceptAndHoldWebSocket`) for upgrade-requester till `/_next/(webpack|turbopack)-hmr` och haller sedan socketen oppen utan att skicka frames. Browsern ser sig som ansluten och slutar retry:a. Ingen ny dep kravs; handshaken ar en 10-raders SHA1+base64-snutt. Satt `SAJTMASKIN_PREVIEW_DISABLE_HMR=false` om du behover akta HMR mot VM:en.

**VIKTIGT — Next 16.2 + HMR-proxy kraver Origin-strip (2026-07-02):** Next 16:s dev-server (`blockCrossSiteDEV`) avvisar WS-upgrades till `/_next/*`/`/__nextjs*` vars `Origin` inte matchar dev-serverns hostname (har `127.0.0.1`) eller `allowedDevOrigins` → 403 som syns som **502** via Fly-edgen. Dessutom levererar Next 16.2 Reacts debugkanal (`REACT_DEBUG_CHUNK`) over HMR-socketen och **hydreringen vantar pa den** — utan ansluten HMR-WS forblir previewn dod SSR-HTML (inga klick fungerar, helt tyst, inga konsolfel). Bade `proxyPreviewUpgrade` (WS, innan `proxy.ws`) och `proxyPreviewRequest` (HTTP, innan `proxy.web`) strippar darfor `Origin`-headern for interna Next-paths (`/_next/*`, `/__nextjs*`, HMR); Origin-losa requests tillats av Next. HTTP-strippen (2026-07-11) tystar bl.a. 403 pa dev-overlayns root-absoluta `/__nextjs_font/*`. Detta betyder ocksa att den gamla stub-vagen (`acceptAndHoldWebSocket`) inte racker for Next 16.2-scaffolds: socketen ser ansluten ut men debugkanalen far ingen data, sa hydreringen stallar anda. Hall `SAJTMASKIN_PREVIEW_HMR_PROXY=true` for Next 16-projekt.

**Reboot-stabilitet (2026-06-25):** tre samverkande ändringar i `src/runtime.js` mot "white screen"/`socket hang up`/Fly `[PU02]`-spam vid restart:

- `proxy.on("error")` återhämtar nu **alla** recoverable transportfel (`ECONNREFUSED`, `ECONNRESET`/`socket hang up`, `EPIPE`, `ECONNABORTED`, `ETIMEDOUT`), inte bara `ECONNREFUSED`. En zombie-runtime som resettar mitt i ett svar recyclas (stop + restart om den lever, annars vanlig boot — dedupat mot pågående boot) och iframen får den vänliga auto-reloadande "Startar om preview"-sidan i stället för rå `{"error":"proxy_failed"}`-JSON.
- `proxyPreviewUpgrade` håller HMR-WebSocket:en tyst (via `acceptAndHoldWebSocket`) när HMR-proxyn är på men runtimen inte kör/bootar, i stället för att proxya mot en ej-lyssnande port (som annars gav ECONNREFUSED → destroy → klientens reconnect-storm = PU02-spam under hela reboot-fönstret).
- SIGTERM→SIGKILL-draina i `stopChildProcessTree` är nu konfigurerbar via `PREVIEW_HOST_RUNTIME_DRAIN_MS` (default 5000 ms = oförändrat); höj för att låta pågående svar hinna klart innan tvångsdöd.

Alla tre är bakåtkompatibla (default = dagens beteende) och kräver `fly deploy -a vm-fly-jakem` för att aktiveras.

**Inspector-bridge-injektion (opt-in, 2026-06-19):** nar `SAJTMASKIN_APP_ORIGIN` ar satt OCH ett dokument-anrop har `?inspect=1` buffrar `proxy.on("proxyRes")` (i `src/runtime.js`) HTML-svaret och injicerar `<script src="${SAJTMASKIN_APP_ORIGIN}/api/inspect-bridge?parent=...">` fore `</body>`. Allt annat (saknad env, ingen `?inspect=1`, icke-HTML eller komprimerade svar) ar ren passthrough -> oforandrat beteende. App-origin tas fran egen env, aldrig fran query, sa ingen kan be hosten injicera en godtycklig origin. Default av. Se `docs/plans/avklarat/2026-06-19-inspector-rendering-arkitektur.md`.

Patchen kor i tva lager:

1. **AST-laget** (`patchNextConfigViaAst`, acorn-baserat) parsar konfigen och injicerar i ratt object literal. Stoder fem shapes:
   - `const cfg = { … }`
   - `const cfg: NextConfig = { … }` (TS-typen strippas till same-length whitespace innan parse, sa AST-positioner mappar 1:1 till originalkallan)
   - `module.exports = { … }`
   - `export default { … }`
   - `export default function () { return { … } }`
2. **Regex-fallback** (`patchNextConfigViaRegex`) anropas endast om AST-parsen failar eller ingen kand object literal hittas. Skip-villkor (`SAJTMASKIN_PREVIEW_BASE_PATH` redan injicerat, `basePath:` redan satt, ingen config-fil) ar terminala — fallback retryas inte da, sa redan-patchade filer kan inte korrumperas.

Snapshot-test for alla fem shapes finns i `scripts/test-patch.mjs` (`node scripts/test-patch.mjs`).

Hot-reload mellan kod-andringar tappas medvetet — preview-host gor full iframe-reload via `refreshToken` vid varje ny generation anda. Satt `SAJTMASKIN_PREVIEW_DISABLE_HMR=false` om du behover akta HMR direkt mot VM:en (slar av bade plugin-filtret och handshake-hold:en).

## Det som nu finns har

Detta spar ar nu scaffoldat som en liten, helt separat prototyp:

- `package.json` - egen minimal Node-service, utan koppling till huvudappens scripts
- `src/server.js` - liten HTTP-server med persistent session-store, status-endpoint och valfri API-key
- `src/store.js` - filbaserad session-store med atomisk write
- `src/validate.js` - payload/schema-validering for start/update/hibernate/destroy
- `Dockerfile` - minsta mojliga container for Fly eller annan host
- `fly.toml` - forsiktig Fly-bas med `arn` som primary region
- `.dockerignore` - begransar containerkontexten
- `.gitignore` - ignorerar lokal `data/`-store

Det ar medvetet **inte** kopplat till Sajtmaskins vanliga scaffold-logik, template-library eller befintliga preview-runtime.

## Vad detta ar, enkelt uttryckt

Tank pa detta som en **egen liten server** som nu ager preview-sessioner och senare kan hardnas ytterligare.

Inte:

- generera kod
- vara builder-UI
- ersatta hela Sajtmaskin

Utan:

- ta emot ett `chatId` (legacy alias: `projectId`) och `versionId`
- skapa eller uppdatera en preview-session
- komma ihag `previewSessionId`, `previewUrl` och status
- senare kunna prata med riktig Docker/Machines-runtime

Just nu ar detta alltsa en **saker prototyp att bygga vidare pa**, inte den fardiga preview-motorn.

## Snabb lokal korning

Fran `preview-host/`:

- `npm start`
- `npm run dev`
- `npm run check`
- `npm run smoke`
- `npm run test:guards`
- `npm run test:proxy-contract`

## Rekommenderat nyborjarflode

Om du ar ny pa detta, kor i den har ordningen:

1. `cd preview-host`
2. `npm run check`
3. `npm run test:guards`
4. `npm run smoke`
5. `npm start`
6. oppna `http://localhost:8080/health`

Om `npm run smoke` gar igenom vet du att grundflodet fungerar:

- start
- get session
- update
- hibernate
- logs
- destroy

Viktiga test-endpoints i prototypen:

- `GET /health`
- `POST /preview/session/start`
- `POST /preview/session/update`
- `POST /preview/session/hibernate`
- `POST /preview/session/destroy`
- `GET /preview/session/:id`
- `GET /preview/session/:previewSessionId/status`
- `GET /preview/logs/:previewSessionId`
- `POST /preview/verify`

Detta ar nu en **minimal riktig sessionskontrolltjanst** for Tier 2-kontraktet. Det ar fortfarande **inte** en full runtime-motor: ingen riktig Docker-worker, ingen workspace-orkestrering och ingen multi-machine-store ar inkopplad an.

## Fly-drift nu

Fly-appen finns redan och kor som den aktiva tier-2-previewen. Det praktiska driftflodet nu ar:

1. ga in i `preview-host/`
2. kontrollera `fly.toml`
3. satt eller uppdatera `PREVIEW_HOST_API_KEY`
4. kor `fly deploy`
5. verifiera `GET /health`, `GET /admin/storage` och `GET /admin/sessions`

**Prewarm deployordning:** preview-hosten måste deployas och verifieras **före**
en app-release som kan skicka `prewarm:true`. Kör `npm run check`,
`npm run test:guards`, `npm run test:proxy-contract` och `npm run smoke`, deploya
Fly-hosten, verifiera health/admin-endpoints och deploya därefter appen. Sätt
inte `SAJTMASKIN_PREVIEW_PREWARM`; flaggan är fortsatt default OFF och får inte
aktiveras innan hostkontraktet finns live. Appens
`SAJTMASKIN_PREVIEW_HOST_API_KEY` måste vara konfigurerad för att skapa den
API-keyed lease-HMAC:en; utan nyckeln skippar appen bara optional prewarm.
Lease-cap 4096 är fast kodpolicy—det finns ingen
`PREVIEW_HOST_MAX_PREWARM_LEASES`-operator-env.

### Det som redan ar satt

- Fly-appnamn: `vm-fly-jakem`
- preview-base-url: `https://vm-fly-jakem.fly.dev`
- mountad volume-path: `/data`
- host-sidans `PREVIEW_HOST_DATA_DIR=/data` ligger i `fly.toml`, inte i repo-rotens `.env.local`

### Viktiga admin-endpoints

- `GET /health`
- `GET /admin/storage`
- `GET /admin/sessions`
- `POST /admin/cleanup`
- `POST /admin/destroy-all`

`/admin/storage` ar nu den snabbaste sanningskallan for:

- vilken disk/path hosten faktiskt anvander
- rootfs kontra `/data`
- hur mycket som ar upptaget pa filsystemet
- hur stora `workspaces` och `verify-workspaces` ar

### Vad som ar robust just nu

- Egen isolerad mapp och egen Node-service
- Aktiv Fly-VM med persistent volume pa `/data`
- Preview lanes nycklade per `chatId`
- Samma `chatId` ateranvander normalt samma session/path och restartar runtime vid ny version
- Verify-lane separat fran live-preview
- Verify-jobb koas lugnare pa single-VM-host
- Filbaserad session-store med atomisk write pa volume
- Cleanup, destroy-all, storage-insyn och sessionsinsyn
- Stale runtime-processer stoppas innan cleanup rensar session/workspace

### Vad som fortfarande ar bra att veta

- Forsta boot for tunga projekt kan fortfarande vara seg
- Ett aktivt preview-workspace kan bli stort, ofta framfor allt pga `node_modules`
- Runtime-processer maste fortfarande startas om over deploy; volymen sparar metadata, inte levande processer
- `frame-src` for `*.fly.dev` bor fortsatt hallas i synk i huvudappen

## Rekommenderad integrationsgrans

Preview-hosten ska fortsatt vara en separat HTTP-tjanst som Sajtmaskin anropar efter finalize.

Minsta viktiga kontrakt just nu:

- `POST /preview/session/start`
- `POST /preview/session/update`
- `POST /preview/session/hibernate`
- `POST /preview/session/destroy`
- `GET /preview/session/:id`
- `GET /preview/session/:previewSessionId/status`
- `GET /preview/sandbox/:previewSessionId/status` (legacy path-alias)
- `GET /preview/logs/:previewSessionId`
- `POST /preview/verify`

Alla `/preview/*`-endpoints kraver `PREVIEW_HOST_API_KEY` i icke-lokal miljo (Bearer eller `X-Preview-Host-Key`).

Payload in fran Sajtmaskin bor minst innehalla:

- `chatId` (legacy alias: `projectId`)
- `versionId`
- `filesJson`
- `dependencyFingerprint`
- `changeClass`
- `preferredBaseImage`
- `resumeStrategy`

Svar tillbaka bor minst innehalla:

- `chatId`
- `previewSessionId`
- `previewUrl`
- `startOutcome`
- `sessionExpiresAt`
- `status`

I huvudappen mappas preview-hostens interna `fresh` idag till produktens `recreated`, sa att engine-flodet bara exponerar `resumed | recreated` utat.

## Aktuell rekommendation

Det har ar inte langre bara ett experimentellt sidospår. Det ar den aktiva Fly-baserade preview-vagen for tier-2.

Det som bor hallas sant i dokumentation och drift framover ar:

- Sajtmaskin ager generering och `files_json`
- preview-host ager runtime-preview, status, cleanup och verify-lane
- `chatId` ar lane-nyckeln
- `/data` ar hostens preview-disk
- preview ska normalt leva hogst ungefär en timme per start/update-cykel om ingen ny cykel tar over
