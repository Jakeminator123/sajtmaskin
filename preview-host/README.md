# Preview Host

`preview-host/` är den separata Node-tjänst som äger Sajtmaskins VM-baserade
preview-runtime och F3:s VM-verifiering. Huvudappen äger generering, versioner,
policy och promotion; preview-hosten konsumerar ett bestämt filsnapshot.

## Ansvar

| Huvudappen | Preview-hosten |
| --- | --- |
| Projekt, chat och persisterade versioner | Sessioner, workspace och runtimeprocess |
| BuildSpec och F2/F3-policy | Start, update, hibernate, destroy och cleanup |
| RenderGate-/ReleaseGate-beslut | Verify-resultat i separat workspace och runtime-status |
| `files_json` som versionsartefakt | Materialisering av exakt mottaget filsnapshot |

`chatId` är preview-lanens runtime-/pathnyckel. `projectId` accepteras endast som
legacy-alias där kontraktet fortfarande kräver kompatibilitet. En `previewUrl`
är en iterationslänk och aldrig automatiskt en publicerad `liveUrl`.

## Operativa invariants

- Icke-lokal `/preview/*`-trafik kräver `PREVIEW_HOST_API_KEY`.
- Workspace och sessionsmetadata ska ligga under `PREVIEW_HOST_DATA_DIR`.
- Boot och verify får inte dela muterbart workspace.
- Install och runtimeprocesser måste ha timeout, cleanup och process-tree-stop.
  `next dev` som aldrig accepterar HTTP ska faila splashen på
  `PREVIEW_HOST_RUNTIME_READY_CONNECT_MAX_MS` (90s), inte hela Fly-taket.
  Next-stdout-svansen ska skrivas till sessionsloggen vid stop/hibernate, inte
  bara vid krasch.
- Samma chat får inte bootas parallellt; en väntande restart ska använda senaste
  snapshotet.
- Ett runtime-byte under en öppen iframe ska signalera `reloadPage` på preview-
  sockets (HMR-stub eller reconnect). Preview-URL:en är stabil, så utan reload
  hydrerar klienten gammal JS mot den nya processens HTML. Saknas socket är
  signalen pending tills HMR reconnectar.
- En hot patch som bekräftar readiness ska använda samma pending-reload.
  Bekräftelse är att HTML-dokumentet serverades efter patch-skrivningen
  (`servedAt` per `documentId` / HMR-URL `id=`), inte att en HMR-socket
  registrerades efter skrivningen. Ett gammalt dokument vars socket dör och
  återansluter mellan write och readiness är inte färskt. Saknas dokument-id
  eller servertid: fail-closed → `reloadPage`. Bara dokument med
  `servedAt >` skrivtid ACK:as utan extra reload. Saknas socket är signalen
  pending tills reconnect.
- Prewarm är opt-in, får inte exponera skelettet publikt och måste deployas på
  hosten före aktivering i huvudappen.
- En webbläsarnavigering (`Sec-Fetch-Mode: navigate`) till `/:chatId/*` innan
  chattens session finns får hostens startsida (503, laddar om var 4:e sekund),
  aldrig rå JSON i iframen. Prober och fetch utan navigate-headers behåller
  JSON-404.
- Next dev-indikatorn är avstängd i förhandsvisningen (`devIndicators: false`,
  bara när `SAJTMASKIN_PREVIEW_BASE_PATH` är satt). Publicerade sajter påverkas inte.
- Saknade lokala TypeScript-, ESLint- eller Next-binaries är toolingfel, inte
  reparerbara kodfel.

Exakta payloadfält och statustyper ägs av runtimekoden och schemas, inte denna
README. Börja i `src/validate.js`, `src/runtime.js`, `src/store.js` och
huvudappens `src/lib/gen/preview/preview-host-client.ts`. `src/runtime.js` är
en fasad; implementationen ligger i ansvarsmoduler under `src/runtime/`
(shared, workspace-files, package-install, verify-jobs, process-lifecycle,
preview-proxy, storage-cleanup).

## Lokal verifiering

Kör från `preview-host/`:

```bash
npm run check
npm run test:guards
npm run test:patch
npm run smoke
```

Starta därefter tjänsten med `npm start` och verifiera `GET /health`.

`npm run test:release` kontrollerar byggmetadata, den riktiga health-routen och
deployens Git-snapshot utan att kontakta Fly.

## Primära endpoints

- `POST /preview/session/start`
- `POST /preview/session/update`
- `POST /preview/session/patch`
- `POST /preview/session/hibernate`
- `POST /preview/session/destroy`
- `GET /preview/session/:id`
- `GET /preview/session/:previewSessionId/status`
- `GET /preview/session/:previewSessionId/files-manifest`
- `GET /preview/logs/:previewSessionId`
- `POST /preview/verify`
- `GET /health`

Adminendpoints för storage, sessions, cleanup och destroy-all är operativa
verktyg och ska skyddas av samma hostnyckel i icke-lokal miljö.

`GET /admin/metrics[?hours=N]` (samma hostnyckel) ger samtidighetshistoriken
som backofficesidan "Samtidighet (byggen & maskiner)" läser: en sampling per
minut av startade gästmaskiner, förhandsvisningar med dev-process och aktiva
sessioner, plus en färsk `current`. Samplingen läser bara storen (inga
Machines-API-anrop), sparas som `metrics-history.ndjson` i datakatalogen
(`/data` på Fly) och avgränsas till 14 dagar. `PREVIEW_HOST_METRICS_SAMPLE_MS`
ändrar intervallet (default 60000). Ägare: `src/metrics-history.js`; guard:
`scripts/test-metrics-history.mjs`.

## Deployordning

1. Kör hostens fyra verifieringskommandon.
2. För lifecycle-tokenändringar: deploya huvudappen först. Appen accepterar
   tokenlösa svar från en äldre host och skickar token bara när den finns.
3. Deploya därefter preview-hosten och verifiera health/status, API-key och
   persistent volume. Nya hostsessioner får en token; update, patch, hibernate
   och destroy kräver då exakt samma token. Redan lagrade tokenlösa sessioner
   fortsätter fungera under övergången.
4. Aktivera eventuella andra hostfunktioner först när båda sidor stödjer samma
   kontrakt.

### Deploy till Fly

Hosten är Fly-appen `vm-fly-jakem` (`fly.toml`, Dockerfile, remote builder).
Vercel deployar inte hosten — en mergad hoständring är inte live förrän någon
kör deployen från ett träd som innehåller den.

```powershell
fly version            # winget install Fly.flyctl  (eller https://fly.io/docs/flyctl/install/)
fly auth whoami        # annars: fly auth login
npm --prefix preview-host run deploy
fly status -a vm-fly-jakem
curl.exe -s https://vm-fly-jakem.fly.dev/health
```

Deploykommandot hittar `fly` eller `flyctl` på PATH, hämtar full Git-SHA och
bygger från ett tillfälligt snapshot av den commitens hostfiler. Ändrade eller
nya build-inputfiler måste först committas; orelaterade lokala filer och
`node_modules` skickas inte. `npm --prefix preview-host run deploy -- --dry-run`
kontrollerar samma snapshot lokalt utan Fly-anrop. Docker använder `npm ci`
med hostens lockfil. Basbilden är fortfarande en rörlig Node-tag: samma
käll-SHA är inte ett löfte om identisk image-digest.

Wrappern skickar `PREVIEW_HOST_BUILD_SHA` som Docker build-arg. En direkt
Docker/Fly-build utan full SHA misslyckas; en manuellt angiven SHA är byggarens
uppgift, inte en oberoende attestering. Imagen innehåller `build-release.json`
och OCI-labeln `org.opencontainers.image.revision`. Health läser bara den
inbakade filen, aldrig huvudappens SHA eller runtime-env:

```json
{"release":{"sourceSha":"<40 tecken Git-SHA>","status":"identified"}}
```

Lokal start eller saknad/ogiltig metadata ger `sourceSha: null` och
`status: "unknown"`; `ok: true` betyder endast att hostens health-rout svarar.
Efter en godkänd deploy: jämför `release.sourceSha` med den avsedda commitens
`git rev-parse HEAD`, kontrollera att alla aktiva Fly-maskiner kör samma image
och spara release-/image-id från Fly tillsammans med health-svaret.
En saknad SHA, mismatch eller blandade maskinversioner är ofullständigt
releasebevis. SHA-fältet bevisar varken funktion, säkerhet eller tenantisolering.

Icke-interaktivt (CI/agent) ersätts inloggningen av `FLY_API_TOKEN` i miljön.
Deployen är en rolling update av en maskin: pågående dev-runtimes stoppas och
återskapas vid nästa anrop från `/data`-storen, så kör den när inga
genereringar pågår.

### Öppen lanseringsblocker: projektisolering

Nuvarande host är **inte en sandbox mellan projekt**. `spawnNpm` och
`runShellCommand` startar install-, verify- och dev-processer på samma host med
separata `cwd`-mappar men samma OS-identitet, filsystem och loopbacknät.
En lokal kontroll med två syntetiska projekt och en sentinel-fil bekräftade
att A kunde läsa B:s fil. Env-filtrering, processgrupper, filvalidering och
en eventuell gemensam non-root-användare skapar ingen tenantgräns.
Oberoende projekt med obetrodd kod får därför inte betraktas som isolerade
på den delade hosten. Full isolering är fortsatt en öppen P1 före sådan launch.

Den ratificerade lösningen (beslut 2026-09-18) är en separat Fly Machine per
projekt för install, verify och dev. Container-sandbox på samma maskin är
avfärdad, liksom env-filtrering och en gemensam non-root-användare. Gästens
skrivbara filsystem innehåller bara dess eget workspace; andra projekt,
hostens store, kontrollplansnycklar och den delade paketcachen finns inte där.
Resursgränser, start/stopp och destroy ägs av kontrollplanet.

### Maskinläge (`PREVIEW_HOST_ISOLATION=machine`)

Läget är påslaget på `vm-fly-jakem` sedan 2026-10-22 (`PREVIEW_HOST_ISOLATION`
och gästkonfigurationen ligger som Fly-secrets, inte i `fly.toml`):

| Del | Fil |
| --- | --- |
| Läge och fail-closed-validering | `src/machines/isolation-config.js` |
| Fly Machines-klient (create/get/wait/start/destroy/list; avgör vilka create-fel som får nytt försök) | `src/machines/fly-machines-client.js` |
| Maskin per chat: skapa (med omförsök), starta, identitetsbevis, förstöra, reconcile | `src/machines/project-machines.js` (store: `data.machines`) |
| Boot/patch/verify inne i gästen; dev-processen som fjärrbarn; idle-destroy | `src/runtime/machine-runtime.js`, inkopplat i `process-lifecycle.js`, `preview-proxy.js`, `verify-jobs.js`, `storage-cleanup.js` |
| Gästagent + bild (kör som egen användare, varm paketcache i bilden) | `guest/` ([pilotrunbook](guest/README.md)) |

Så fungerar det: hosten skapar en maskin ur `PREVIEW_GUEST_IMAGE` med en
färsk bearer-token och `chatId` i miljön, väntar in `started`, och kräver att
agentens `/health` svarar med exakt den `chatId`:n över den token. Sedan
synkas filsnapshotet (inklusive `.env.local` och in-memory-patchad
`next.config`) till gästens `live`-workspace, install körs där (fingerprint-skip
och varm seed som i delat läge), `npm run dev` startas på gästens loopback och
proxyn/readiness går till agentens autentiserade `/proxy`. Hot patch,
hibernate (stoppar bara dev-processen; maskinen lever kvar), resume
(återanvänder maskinen), destroy (förstör den) och verify (eget
`verify-<id>`-workspace som tas bort efteråt) går samma väg.
Saknas token, app, bild eller identitetsbevis **failar booten** med
`PREVIEW_ISOLATION_UNAVAILABLE`/identitetsfel; ingenting körs på hosten.
`GET /health` visar `isolation.mode` (och `idleDestroyMs`) och
`GET /admin/machines` poster utan token.

Kapacitet och kostnad i maskinläget:

- **Verify per chat.** Shared-läget kör alla verify-jobb i en hostgemensam kö
  (de delar RAM och disk). I maskinläget har varje chat egen gäst, så kön är
  per chat: olika chattar verifierar parallellt, samma chat i tur och ordning,
  och identiska förfrågningar dedupas fortfarande per jobbnyckel.
- **Idle-destroy.** En gäst förstörs efter `PREVIEW_GUEST_IDLE_DESTROY_MS`
  (default 25 min) utan aktivitet: ingen boot, verify, levande dev-process
  eller öppen preview-socket. Klockan räknas från senaste proxade trafik,
  hibernate eller verify; efter en host-omstart från omstarten, så även gäster
  utan spårad runtime städas. Förstörs, stoppas aldrig: en stoppad Fly Machine
  tappar ändå sin rootfs. Nästa besök skapar en ny maskin (kallstart med
  install från bildens varma cache). Svepet går med idle-reapern var 60 s.
- **Omförsök vid create.** 429, 5xx och kapacitetsfel (`insufficient
  memory`/`could not reserve resource`) får upp till 4 försök med exponentiell
  backoff och jitter (cirka 0,5–1, 1–2, 2–4 s; `Retry-After` respekteras upp
  till 10 s). Samma region varje gång. Andra fel failar direkt.
- **Kontrollplanet är litet.** `fly.toml` kör `performance-1x`/2 GB: hosten
  kör inga kundprocesser. Återgång till shared-läget kräver att storleken höjs
  igen, se [baslinjen](../docs/runbooks/preview-host-shared-baseline.md).

Nycklar (hostens env, se [`../docs/ENV.md`](../docs/ENV.md)):
`PREVIEW_HOST_ISOLATION`, `PREVIEW_GUEST_FLY_APP`, `PREVIEW_GUEST_IMAGE`,
`PREVIEW_GUEST_FLY_API_TOKEN` (token scopad till gäst-appen; den generiska
`FLY_API_TOKEN` läses medvetet inte),
`PREVIEW_GUEST_MACHINES_API_BASE` (default `https://api.machines.dev`; inne på
Fly `http://_api.internal:4280`), `PREVIEW_GUEST_REGION`,
`PREVIEW_GUEST_CPU_KIND`/`_CPUS`/`_MEMORY_MB` (default shared/2/2048),
`PREVIEW_GUEST_AGENT_PORT` (7070), `PREVIEW_GUEST_DEV_PORT` (3000),
`PREVIEW_GUEST_HOST_IDENTITY` (default `FLY_APP_NAME`; märker maskiner så en
annan host aldrig reconcile-förstör dem), `PREVIEW_GUEST_IDLE_DESTROY_MS`
(default `1500000` = 25 min; `0` stänger av, då lever gästen tills sessionen
städas).

Lokalt bevis: `npm run test:guest-agent` och `npm run test:isolation` (riktig
gästagent per "maskin" på egna loopback-adresser, fejkat Machines-API). De
bevisar kontrakten, inte Fly-nätgränsen. Acceptans nedan gäller fortfarande.

Acceptans i en disponibel testmiljö, endast med syntetiska data:

1. Starta A och B samtidigt genom den riktiga install-, verify- och dev-vägen.
   Skapa olika slumpade sentinel-filer i båda projekten och i hostens teststore.
2. Från A: försök läsa/skriva B och hoststore via absoluta/relativa sökvägar,
   symlänkar och `/proc`-processvägar. Alla försök ska nekas; B ska vara oförändrat.
3. Från A: försök nå B:s runtime och kontrollplanet direkt via loopback/privat
   nät, läsa en syntetisk hosthemlighet och signalera B:s process. Alla försök
   ska nekas. Godkänd preview-proxy och paketinstallation ska fortfarande fungera.
4. Kontrollera att timeout, resursöverlast, restart, hibernate och destroy för A
   varken stoppar B eller lämnar A:s processer/mounts åt nästa tenant.
5. Kör på den avsedda plattformen och spara käll-SHA, image-id, policykonfiguration
   och faktiska nekanden. Gröna lokala tester på den delade hosten kan inte
   godkänna en ännu odriftsatt sandboxarkitektur.
6. Specifikt för maskinläget, med TCP-nåbarhet och behörighet som **separata**
   krav: gäster i samma Fly-organisationsnät kan normalt öppna TCP mot
   varandra över 6PN, så en lyckad anslutning till B:s agentport är inte i
   sig ett fel. Felet är om A utan B:s token kan läsa filer, köra kommandon,
   styra dev-processen eller proxa trafik hos B (agenten ska svara 401), om
   A når B:s dev-port (ska bara lyssna på B:s loopback), om A når
   kontrollplanets `/preview/*` utan nyckel, `_api.internal:4280` utan token,
   eller ett eventuellt `/.fly/api`. Kräver ägaren full nätseparation behövs
   dessutom egen Fly-nätverkspolicy eller ett separat privat nät; det är inte
   bevisat av tokenkontrollen. Alla previews delar fortfarande webbläsar-origin
   på hostens domän.

Den delade baslinjen (värden och varför den fungerar) finns i
[`../docs/runbooks/preview-host-shared-baseline.md`](../docs/runbooks/preview-host-shared-baseline.md).

Hemligheter och miljöklassificering dokumenteras i
[`../docs/ENV.md`](../docs/ENV.md). Runtimeflödet finns i
[`../docs/architecture/system-overview.md`](../docs/architecture/system-overview.md)
och felsökning i
[`../docs/runbooks/preview-white-screen.md`](../docs/runbooks/preview-white-screen.md).

Historiska Fly-incidenter, maskinstorlekar, kostnader och avslutade handoffs hör
hemma i incident-/git-historik och ska inte byggas in i denna aktiva README.
