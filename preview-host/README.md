# Preview Host

`preview-host/` är den separata Node-tjänst som äger Sajtmaskins VM-baserade
preview-runtime och F3:s VM-verifiering. Huvudappen äger generering, versioner,
policy och promotion; preview-hosten konsumerar ett bestämt filsnapshot.

## Ansvar

| Huvudappen | Preview-hosten |
| --- | --- |
| Projekt, chat och persisterade versioner | Sessioner, workspace och runtimeprocess |
| BuildSpec och F2/F3-policy | Start, update, hibernate, destroy och cleanup |
| RenderGate-/ReleaseGate-beslut | Isolerade verify-resultat och runtime-status |
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
  signalen en no-op.
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

Hemligheter och miljöklassificering dokumenteras i
[`../docs/ENV.md`](../docs/ENV.md). Runtimeflödet finns i
[`../docs/architecture/system-overview.md`](../docs/architecture/system-overview.md)
och felsökning i
[`../docs/runbooks/preview-white-screen.md`](../docs/runbooks/preview-white-screen.md).

Historiska Fly-incidenter, maskinstorlekar, kostnader och avslutade handoffs hör
hemma i incident-/git-historik och ska inte byggas in i denna aktiva README.
