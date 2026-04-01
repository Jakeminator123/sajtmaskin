# Preview Host

Den har mappen ar ett avgransat spar for en framtida separat tjanst som ansvarar for stateful preview/sandbox-runtime. Tanken ar att den ska kunna lyftas ut till ett eget repo senare utan att blanda ihop sig med Sajtmaskins `src/`.

## Detta som alternativ till sandbox

Detta spar ska ses som ett **alternativ till nuvarande sandbox-sparet**.

Tanken ar inte att ersatta own-engine, buildern eller `files_json`, utan att ersatta sjalva runtime-lagret som idag startar preview i sandbox.

I praktiken betyder det:

- Sajtmaskin fortsatter aga generering och versioner
- `engine_versions.files_json` fortsatter vara kanonisk artifact
- `preview-host` blir en separat tjanst for preview-sessioner, leases, status och senare riktig runtime

## Status (2026-04-01)

### Vad som fungerar

- Fly-app `vm-fly-jakem` koer pa `performance-2x` (2 ded CPU, 4 GB RAM) i `arn` (Stockholm)
- 10 GB krypterad Fly volume monterad pa `/data` for workspaces och session-store
- `preview-host` tar emot projekt via HTTP, koer `npm install` + `npm run dev` pa Fly-maskinen
- preview-URL `https://vm-fly-jakem.fly.dev/<projectId>` serverar riktiga SSR-renderade Next.js-sajter
- Sajtmaskins huvudapp har tier-2-providerlager som valjer `preview_host` framfor Vercel Sandbox
- vantesida visas i iframen medan projektet bootar (auto-reload var 4:e sekund)
- workspace-caching: `node_modules` ateranvands om `package.json` inte andrats
- icke-blockerande boot: runtime-processen dor inte av readiness-timeout

### Vad som inte fungerar annu

- **Sessions-persistens over deploy/restart**: sessioner lagras delvis i minne och tappas vid Fly-restart/deploy. Session-store pa volymen har metadata men runtime-stateocken (barnprocesser) forsvinner. Det gor att builderns iframe tappar previewn efter varje deploy.
- **CSP-header**: `frame-src` i huvudappens CSP-policy listar bara `*.vercel.run` / `*.vercel.app`, inte `*.fly.dev`. Det ger report-only-varningar i konsolen (blockerar inte iframen an men bor fixas).
- **Forsta boot ar seg** (2-5 min for riktiga Next-projekt med tunga deps som `three.js`). Workspace-caching hjalper vid andra koerningen men forsta ar fortfarande lang.
- **Autofix-loopen**: nar preview misslyckas triggar buildern autofix-reparation som genererar nya versioner. Det kan skapa 3-4 versioner i snabb folid som alla forsoker boota pa Fly parallellt.

### Tier 2 / export — vanliga generiska fel (inte VM-specifika)

- **`next` is not recognized** efter nedladdning: kör `npm install` fore `npm run dev` (samma som lokalt).
- **`npm audit fix`**: valfritt rad fran npm, inte ett krav for preview.
- **Readiness** vantar pa HTTP 200 HTML med tillrackligt med synlig text i `<body>`; tom sida efter nagra forsok loggas som varning men accepteras (annars blockerar vi legitima RSC-/compile-faser for lange).
- **basePath / CSS som saknas i iframen**: publik URL ar `https://...fly.dev/{projectId}/...`. Utan `basePath` pekar HTML pa `/_next/...` mot hostroten (404) → sidan ser ut som "ren HTML". Runtime satter `SAJTMASKIN_PREVIEW_BASE_PATH=/{projectId}` och proxyn skickar **full** path till `next dev`; `next.config.ts` maste respektera env (scaffold + patch pa workspace vid boot).

### Drift pa Fly

| Resurs | Varde |
|--------|-------|
| Maskin | `performance-2x` (2 CPU, 4 GB) |
| Volume | `preview_host_data`, 10 GB, `/data` |
| Region | `arn` (Stockholm) |
| Secret | `PREVIEW_HOST_DATA_DIR=/data` |
| Kostnad | ca 60-70 USD/man om maskinen star pa 24/7 |

### Env i Sajtmaskins `.env.local` (repo-roten)

```env
SAJTMASKIN_PREVIEW_HOST_BASE_URL=https://vm-fly-jakem.fly.dev
SAJTMASKIN_TIER2_RUNTIME=preview_host
NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES=fly.dev
```

Lagg **inte** `PREVIEW_HOST_DATA_DIR`, `PREVIEW_HOST_API_KEY` eller `DATA_DIR` i repo-rotens `.env.local`. De hor till Fly-tjansten.

## Nasta steg nu

Nu ar vi forbi forsta deployen. Det viktigaste nasta steget ar inte fler features direkt, utan att gora prototypen **mer korrekt** for hur den faktiskt fungerar idag.

### Varfor detta behov finns

Sessioner skrivs till **JSON-fil** (atomiskt rename) under `PREVIEW_HOST_DATA_DIR` (default `./data` i containern).

- satt samma katalog pa en **Fly volume** om du skalar till flera machines
- valfritt: `PREVIEW_HOST_API_KEY` pa servern + `Authorization: Bearer ...` (eller `X-Preview-Host-Key`) pa klienten

### Nasta steg (handoff)

1. **Persistera sessions over restart**: sessioner maste sparas/aterhamtas fran volymen nar `preview-host` startar om, sa att builderns iframe inte tappar sin preview efter deploy.
2. **CSP-header**: lagg till `*.fly.dev` i `frame-src` i huvudappens CSP-konfiguration (`next.config` eller `middleware.ts`).
3. **Snabbare forsta boot**: forinstallera baseline-deps i Dockerfile eller cacha `node_modules` pa volymen mer aggressivt.
4. **Autofix-loop**: throttla antal parallella preview-host-boots per chatt sa att autofix inte skapar 4 samtida install+dev-starter.
5. **Observerbarhet**: lagg till tydligare loggning av Next.js stdout/stderr i runtime-loggar (just nu damps HMR-brus).

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

Tank pa detta som en **egen liten server** som senare ska fa ansvar for preview-sessioner.

Inte:

- generera kod
- vara builder-UI
- ersatta hela Sajtmaskin

Utan:

- ta emot ett `projectId` och `versionId`
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
- `GET /preview/sandbox/:sandboxId/status`
- `GET /preview/logs/:sandboxId`

Detta ar nu en **minimal riktig sessionskontrolltjanst** for Tier 2-kontraktet. Det ar fortfarande **inte** en full runtime-motor: ingen riktig Docker-worker, ingen workspace-orkestrering och ingen multi-machine-store ar inkopplad an.

## Fly-drift nu

Fly-appen finns redan. Det praktiska driftflodet nu ar:

1. Ga in i `preview-host/`
2. valfritt: skapa en volume for `/data`
3. valfritt: satt `PREVIEW_HOST_API_KEY`
4. kor `flyctl deploy`
5. testa `/health`, `start`, `status` och `hibernate` pa den deployade URL:en

Vi ska **inte** koppla GitHub eller vanliga scaffold-floden for detta sparet i forsta laget.

### Det som redan ar satt

Just nu ar dessa val redan gjorda:

- Fly-appnamn: `vm-fly-jakem`
- Tankt preview-base-url: `https://vm-fly-jakem.fly.dev`

### Historik: varfor `flyctl deploy` gav `app not found`

Felet:

- `Error: app not found`

betyder i det har laget inte att `fly.toml` ar fel, utan att Fly inte annu har en skapad app-resurs med namnet `vm-fly-jakem`.

Med andra ord:

- `fly.toml` pekar pa ett appnamn
- men Fly-kontot har annu inte fatt appen skapad pa plattformen

Detta var normalt for forsta deployen om man gar direkt pa `flyctl deploy`.

### Nasta konkreta steg i terminalen

Fran `preview-host/`:

1. `flyctl auth whoami`
2. valfritt: `fly volumes create preview_host_data --size 1 -r arn -a vm-fly-jakem`
3. valfritt: `fly secrets set PREVIEW_HOST_API_KEY=... -a vm-fly-jakem`
4. `flyctl deploy`
5. oppna `https://vm-fly-jakem.fly.dev/health`

Flys officiella CLI-dokumentation for detta spar:

- `fly apps create`: [Fly Docs](https://fly.io/docs/flyctl/apps-create/)
- deploy: [Fly Docs](https://fly.io/docs/apps/deploy/)

## Vad som ar robust just nu

- Egen isolerad mapp
- Inga beroenden till huvudappens scaffoldlogik
- Eget `package.json`
- Enkel Dockerfil
- Enkel health check
- Filbaserad session-store med atomisk write
- Status-endpoint for provider-agnostisk recover
- Tydlig payload-validering
- Ett `smoke`-kommando som testar hela grundflodet

## Vad som kommer senare

Forst nar grundflodet ar stabilt ska vi lagga till:

- Fly volume eller Redis/Postgres for starkare durability over redeploy / machine-replacement
- riktig runtime bakom sessionerna
- fler-worker / multi-machine-strategi
- riktig `previewUrl`-routing
- skarpare builder-telemetri och rollout-regler

## Tydlig rekommendation

Min slutsats efter att ha last anteckningarna i `ovrigt/sanbox_vm_etc` och jamfort dem med hur Sajtmaskin redan fungerar ar:

- Om malet ar varm pool, samma sandbox per projekt, diff-sync, hibernation och stabil `previewUrl`, da ska du **inte** bygga v1 som en Docker-orkestrerad sandbox-pool inuti en Render-tjanst.
- Render-dokumentationen visar tydligt stod for Docker-deploys, private services och persistent disks, men jag hittar **inte** tydligt stod for nested Docker / privileged runtime. Disk-backed services ar dessutom single-instance och tappar zero-downtime deploys.
- Om du vill bygga precis det ni beskrivit i anteckningarna ar den rakaste vagen en **dedikerad Linux-VM** med Docker, Traefik, Redis och Postgres.
- Om Render ar ett hart krav redan nu ska du medvetet valja en **enklare modell** i v1: ingen egen Docker-pool i tjansten, inga undercontainrar, och betydligt mindre ambition kring warm-empty/warm-project.

Kort sagt:

- **Vill du ha full kontroll och samma sandbox tillbaka per projekt:** kor en egen VM.
- **Vill du absolut vara pa Render direkt:** bygg en enklare preview-runtime, inte hela den avancerade preview-hosten.

## Varfor detta ar ett separat spar

Sajtmaskin har redan en tydlig produktkedja:

- own-engine ager generering
- `engine_versions.files_json` ar kanonisk artifact
- buildern ager versionval, UI och preview-bootstrap

Det nya systemet ska darfor inte ta over generering eller lagring av koden. Det ska bara agera **runtime for preview**.

## Det nya systemet ska aga

- `project -> sandbox` affinity
- sandbox lease, heartbeat och TTL
- diff-klassificering for updates
- restart-policy
- preview lane kontra verify lane
- route-register och stabil `previewUrl`
- loggstream, healthchecks och hibernation

## Sajtmaskin ska fortsatt aga

- own-engine och prompt/generering
- `engine_chats`, `engine_messages`, `engine_versions`
- `files_json` som source of truth
- builder-UI och versionsval
- beslut om nar preview ska startas eller uppdateras

## Rekommenderad integrationsgrans

Preview-hosten bor vara en separat HTTP-tjanst som Sajtmaskin anropar efter finalize.

Foreslaget minsta kontrakt:

- `POST /preview/session/start`
- `POST /preview/session/update`
- `POST /preview/session/hibernate`
- `POST /preview/session/destroy`
- `GET /preview/session/:id`
- `GET /preview/sandbox/:sandboxId/status`
- `GET /preview/logs/:sandboxId`

Alla `/preview/*`-endpoints kan skyddas med `PREVIEW_HOST_API_KEY` (Bearer eller `X-Preview-Host-Key`).

Payload in fran Sajtmaskin bor minst innehalla:

- `projectId`
- `versionId`
- `filesJson`
- `dependencyFingerprint`
- `changeClass`
- `preferredBaseImage`
- `resumeStrategy`

Svar tillbaka bor minst innehalla:

- `sandboxId`
- `previewUrl`
- `startOutcome` = `resumed | recreated | fresh`
- `sessionExpiresAt`
- `status`

## Rekommenderad v1-arkitektur

Om du valjer den vagen jag tror mest pa:

- 1 Ubuntu-VM
- 1 preview-controller
- 1 worker-daemon pa samma host
- Docker Engine
- Traefik
- Redis
- Postgres
- 2 warm-empty sandboxes
- 1 wildcard subdomain for previews

Viktiga regler att lasa fast tidigt:

- preview ar **stateful per projekt**
- samma sandbox ska **ateranvandas sa langt det gar**
- snabb preview och strikt verify ar **olika lanes**
- `previewUrl` ska vara stabil inom aktiv session

## Restart- och diffpolicy

En enkel men bra klassificering i v1:

- `light`: komponenter, copy, CSS -> skriv filer, lat HMR gora jobbet
- `medium`: nya routes, layout, API-routes -> restart av dev-server
- `heavy`: `package.json`, lockfile, `next.config.*` -> reinstall eller ny sandbox
- `rebuild`: trasig runtime eller stor systemforandring -> skapa ny sandbox

Detta matchar resonemangen i anteckningarna och ligger nara hur Sajtmaskin redan tanker kring preview kontra verify.

## Render-sparet om du maste starta dar

Om du vill prova Render for att komma igang snabbt, gor det med **medvetet reducerad scope**:

- kor en private service eller web service med Docker image
- lagg workspace/cache pa persistent disk
- kor **inte** Docker-in-Docker som grundantagande
- kor en sandbox per projekt som process/workspace, inte en full egen container-pool
- acceptera att detta ar en overgangslosning, inte slutarkitekturen

Da far du:

- mindre ops i starten
- snabbare forsta leverans
- men mindre kontroll over isolation, reuse och scheduler-beteende

## Det jag tycker du ska gora nu

1. Las detta som ett beslut mellan **Render som enkel start** och **egen VM som riktig preview-host**.
2. Om den langsiktiga malbilden fortfarande ar warm pool + reuse + hibernation: valj egen VM direkt.
3. Hall den nya tjansten separat fran Sajtmaskins huvudapp och lat den konsumera `files_json` over HTTP.
4. Bygg bara v1: start, update, heartbeat/status, logs, hibernate, destroy.
5. Skjut upp Kubernetes, Firecracker, multi-host-scheduler och avancerad autoskalning.

## Min slutliga rekommendation

Det ni har resonerat fram ar tillrackligt specifikt for att jag tycker att du ska behandla detta som en **separat produkt-/infra-komponent**, inte som lite mer sandbox-kod inne i huvudappen.

Om du fragar mig vad jag sjalv hade valt:

- Jag hade skapat ett separat repo utifran den har mappen senare.
- Jag hade borjat med **en egen Linux-VM** for preview-hosten.
- Jag hade latit Render vara sekundart eller ett enklare fallback-spar, inte huvudmiljon for en Docker-styrd sandbox-pool.
