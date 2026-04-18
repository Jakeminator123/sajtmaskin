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

- Fly-app `vm-fly-jakem` koer pa `performance-2x` (2 ded CPU, 4 GB RAM) i `arn` (Stockholm)
- Persistent Fly volume `preview_host_data` ar monterad pa `/data` for workspaces och session-store (nuvarande deploy: 20 GB)
- `preview-host` tar emot preview-payloads via HTTP, koer `npm install` + `npm run dev` pa Fly-maskinen
- `preview-host` kor ocksa en isolerad **verify-lane** for quality gate (`npm install` + `tsc` / `next build` / ev. `eslint`) i separat workspace
- preview-URL `https://vm-fly-jakem.fly.dev/<chatId>` serverar riktiga SSR-renderade Next.js-sajter
- Sajtmaskins huvudapp har tier-2-providerlager som valjer `preview_host` framfor Vercel Sandbox
- samma `chatId` ateranvander normalt samma preview-session/path; ny version restartar runtime med nya filer i stallet for att skapa en helt separat lane
- vantesida visas i iframen medan projektet bootar (auto-reload var 4:e sekund)
- workspace-caching: `node_modules` ateranvands om `package.json` inte andrats
- binary assets (bilder, fonts) stods via `base64:`-prefix i `filesJson`; `writeFilesIntoWorkspace` skriver dem som binara buffers
- verify-jobb koas lugnare pa enskild VM for att undvika att flera tunga `npm install`/`tsc` kor samtidigt
- `GET /admin/storage`, `GET /admin/sessions`, `POST /admin/cleanup` och `POST /admin/destroy-all` finns for drift och felsokning
- sessionstiden ar nu forenklad till cirka 1 timme pa bade host och app-sida
- cleanup stoppar nu stale runtime-processer innan utgangna sessioner, loggar och workspace-mappar tas bort

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

### Drift pa Fly

| Resurs | Varde |
|--------|-------|
| Maskin | `performance-2x` (2 CPU, 4 GB) |
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
5. **Observerbarhet**: lagg till tydligare loggning av Next.js stdout/stderr i runtime-loggar (just nu damps HMR-brus).

### Kanda begransningar (acceptabla pa F2)

- **Webpack-HMR WebSocket-spam i klient-konsolen** — *(Mitigerad 2026-04-18.)* Next.js dev-instansen i VM:en oppnar tidigare `wss://vm-fly-jakem.fly.dev/<chatId>/_next/webpack-hmr?id=...` som failade mot Fly's edge-proxy och spammade Chrome-konsolen. Nu inaktiveras HMR-pluginen automatiskt via `SAJTMASKIN_PREVIEW_DISABLE_HMR=true` (default-on i `spawnDevServer`). `patchNextConfigForPreviewBasePath` injicerar en `webpack`-mutator i preview-VM:ens `next.config` som filtrerar bort `HotModuleReplacementPlugin`. Sajten renderas som vanligt, hot-reload mellan kod-andringar tappas men preview-host gor full iframe-reload vid varje ny generation anda. Satt `SAJTMASKIN_PREVIEW_DISABLE_HMR=false` om du behover HMR for att debugga VM:en direkt.

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
- komma ihag `sandboxId`, `previewUrl` och status
- senare kunna prata med riktig Docker/Machines-runtime

Just nu ar detta alltsa en **saker prototyp att bygga vidare pa**, inte den fardiga preview-motorn.

## Snabb lokal korning

Fran `preview-host/`:

- `npm start`
- `npm run dev`
- `npm run check`
- `npm run smoke`

## Rekommenderat nyborjarflode

Om du ar ny pa detta, kor i den har ordningen:

1. `cd preview-host`
2. `npm run check`
3. `npm run smoke`
4. `npm start`
5. oppna `http://localhost:8080/health`

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
- `GET /preview/session/:sandboxId/status`
- `GET /preview/logs/:sandboxId`
- `POST /preview/verify`

Detta ar nu en **minimal riktig sessionskontrolltjanst** for Tier 2-kontraktet. Det ar fortfarande **inte** en full runtime-motor: ingen riktig Docker-worker, ingen workspace-orkestrering och ingen multi-machine-store ar inkopplad an.

## Fly-drift nu

Fly-appen finns redan och kor som den aktiva tier-2-previewen. Det praktiska driftflodet nu ar:

1. ga in i `preview-host/`
2. kontrollera `fly.toml`
3. satt eller uppdatera `PREVIEW_HOST_API_KEY`
4. kor `fly deploy`
5. verifiera `GET /health`, `GET /admin/storage` och `GET /admin/sessions`

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
- `GET /preview/session/:sandboxId/status`
- `GET /preview/logs/:sandboxId`
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
- `sandboxId`
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
