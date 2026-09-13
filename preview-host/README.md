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
`runCommand` startar install-, verify- och dev-processer på samma host med
separata `cwd`-mappar men samma OS-identitet, filsystem och loopbacknät.
En lokal kontroll med två syntetiska projekt och en sentinel-fil bekräftade
att A kunde läsa B:s fil. Env-filtrering, processgrupper, filvalidering och
en eventuell gemensam non-root-användare skapar ingen tenantgräns.
Oberoende projekt med obetrodd kod får därför inte betraktas som isolerade
på den delade hosten. Full isolering är fortsatt en öppen P1 före sådan launch.

En försvarbar lösning kräver en separat VM eller en granskad container-sandbox
per projekt/livscykel, inklusive install och verify. Gästens skrivbara mount
ska bara innehålla dess eget workspace; andra projekt, hostens store,
kontrollplansnycklar, container-socket och muterbara delade paketcache får inte
vara tillgängliga. Nätpolicy måste skilja gäster från varandra och från
kontrollplanets loopback-/privata endpoints. Resursgränser och destroy måste
ägas av kontrollplanet utanför gästen. Detta kräver arkitekturval, infrastruktur
och verifierad driftsättning; det ryms inte i en env- eller Docker-USER-fix.

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

Hemligheter och miljöklassificering dokumenteras i
[`../docs/ENV.md`](../docs/ENV.md). Runtimeflödet finns i
[`../docs/architecture/system-overview.md`](../docs/architecture/system-overview.md)
och felsökning i
[`../docs/runbooks/preview-white-screen.md`](../docs/runbooks/preview-white-screen.md).

Historiska Fly-incidenter, maskinstorlekar, kostnader och avslutade handoffs hör
hemma i incident-/git-historik och ska inte byggas in i denna aktiva README.
