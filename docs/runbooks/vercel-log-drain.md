# Vercel Log Drain → Postgres

Gör appens egna `console.warn`/`console.error` läsbara med SQL i stället för bara
`vercel logs`. Utan drainen finns de raderna **enbart** på Vercel-plattformen,
vilket är hela anledningen till att `/logg` har ett obligatoriskt "hämta och
greppa `vercel logs --json`"-steg: sex körningar i rad rapporterade artigt
`product_postcheck.skipped` medan Vercel-loggen visade en kraschad Chromium.

Drainen är **valfri**. Är den av fungerar allt som förut, och `--kinds=drain`
returnerar tom lista.

## Nuläge 2026-08-15

| Sak | Nuläge |
|---|---|
| Befintliga drains | Noll (`GET /v1/drains` → `{"drains": []}`) |
| `VERCEL_LOG_DRAIN_SECRET` | Finns i production sedan 2026-08-11 |
| `VERCEL_LOG_DRAIN_ENABLED` | Satt till `true` i production 2026-08-15 — slår igenom vid nästa prod-deploy |

Ingen drain ska skapas förrän den deployen har landat och det signerade
självtestet nedan svarar `ok: true` **och** `stored: 1`. Det är en separat
uppgift.

## Sätt upp den

**Ordning — env och deploy före drainen.** Ownership-proben (`x-vercel-verify`,
osignerad) fungerar **oberoende** av kill-switchen, så mottagaren kan vara redo
innan något pekar mot den. Den omvända ordningen (skapa drainen medan mottagaren
fortfarande svarar `410`) är exakt tillståndet som orsakade kostnadsincidenten
2026-08-11: ~2,8 miljoner invocations på en timme.

1. Sätt `VERCEL_LOG_DRAIN_SECRET` + `VERCEL_LOG_DRAIN_ENABLED=true` i production.
2. Deploya. Nu är mottagaren redo och svarar aldrig `410` på signerade leveranser.
3. Verifiera med det signerade självtestet nedan.
4. Skapa **därefter** drainen — med loop-brytaren vid källan.

Skapa inte drainen mellan steg 1 och 3. En live drain mot en mottagare som
svarar `410` retrysar och loggar, och varje logg blir en ny leverans.

**Verify/Create-probe:** osignerad POST med `x-vercel-verify` får `200` + samma
header ekoas tillbaka (Vercels ownership-handshake) **även när kill-switchen är
av**. Signerade leveranser kräver **både** `VERCEL_LOG_DRAIN_ENABLED=true` och
`VERCEL_LOG_DRAIN_SECRET`. Därför kan (och ska) switchen vara på *innan*
drainen skapas — proben behöver inte ett farofönster.

### Vad som är env och vad som inte är det

| Namn | Rätt? | Var |
|---|---|---|
| `VERCEL_LOG_DRAIN_ENABLED=true` | **Ja** — kill-switch, måste vara exakt `true` | Vercel **production**-env |
| `VERCEL_LOG_DRAIN_SECRET=<samma värde som drainen ska signera med>` | **Ja** | Vercel **production**-env (valfritt i `.env.local` bara om du testar mottagaren lokalt) |
| `DRAIN=…` | **Nej** — koden läser inte det | — |
| `POST_DRAIN=https://…` | **Nej** — URL:en är **inte** en env-variabel | Drain-dialogen / `POST /v1/drains` → fältet **URL** / `delivery.endpoint` |

URL:en pekar drainen mot mottagaren. Secreten verifierar `x-vercel-signature`.
`ENABLED` är den manuella brytaren. Blanda inte ihop dem, och döp inte om secreten
till `DRAIN`.

### Secreten + kill-switchen hör hemma i Vercel-env, inte i git

Det genererade värdet är den **enda** grinden mot att vem som helst som gissar
URL:en kan skriva rader i vår databas — men **utan** `ENABLED=true` tar vi ändå
inte emot något (410). Det är nödläget, inte uppsättningsvägen: sätt båda **före**
drainen skapas (från länkad repo-rot, inte en worktree utan `.vercel/`):

```powershell
# från C:\Users\jakem\dev\projects\sajtmaskin (huvudcheckouten):
$secret = Read-Host "Klistra in Signature Verification Secret"
$secret | vercel env add VERCEL_LOG_DRAIN_SECRET production --yes
"true" | vercel env add VERCEL_LOG_DRAIN_ENABLED production --yes
```

Per 2026-08-15 finns secreten redan; `ENABLED=true` är satt och väntar på nästa
prod-deploy. Rotera inte secreten i samma veva som drainen skapas — då måste
env + deploy hinna före, annars uppstår farofönstret igen.

Sedan **en ny production-deploy**, annars ser den körande funktionen inte
variablerna. Först därefter självtest, först därefter drain.

Saknas ENABLED eller secret svarar routen `410 Gone` (inte `503`). Det är medvetet:
efter incidenten 2026-08-11 vill vi att Vercel **slutar retrysa** och markerar
drainen som errored, inte att den fortsätter hamra oss. `410` är alltså
skadebegränsning *i efterhand* — inte ett tillstånd att stå i med en live drain.

Sätt dem **bara i production**. Preview-deployer behöver dem inte. Lägg **inte**
`POST_DRAIN` eller `DRAIN` i Vercel-env — det gör ingenting.

### Testa själv med en signerad request

Gör det här **innan** drainen skapas. Routen kräver giltig signatur, så ett test
utan signatur svarar `403` — vilket är meningen, men ser ut som ett fel.
Verifiera i stället själv.

`projectId` i bodyn måste vara appens riktiga `VERCEL_PROJECT_ID`. Det är en
**systemvariabel** Vercel injicerar i runtime — sätt den inte själv.
`vercel env ls production` visar bara namn, inte värdet. Läs det från
`.vercel/project.json` (fältet `projectId`) eller `vercel project inspect`
(från länkad repo-rot):

```powershell
# från C:\Users\jakem\dev\projects\sajtmaskin (huvudcheckouten):
$projectId = (Get-Content -Raw .vercel/project.json | ConvertFrom-Json).projectId
$secret = "<samma värde som VERCEL_LOG_DRAIN_SECRET>"
$body = '[{"id":"selftest-1","deploymentId":"dpl_x","projectId":"' + $projectId + '","source":"lambda","host":"sajtmaskin.vercel.app","timestamp":1,"level":"error","message":"drain selftest"}]'
$hmac = [System.Security.Cryptography.HMACSHA1]::new([Text.Encoding]::UTF8.GetBytes($secret))
$sig = ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($body)) | ForEach-Object { $_.ToString("x2") }) -join ""
Invoke-RestMethod -Method Post -Uri "https://sajtmaskin.vercel.app/api/drains/vercel" `
  -Headers @{ "x-vercel-signature" = $sig } -ContentType "application/json" -Body $body
```

Samma grindkriterium som i Nuläge (PowerShell visar `True` med stort T):

| Svar | Betyder |
|---|---|
| `ok: true` **och** `stored: 1` | Hela kedjan lever, inklusive DB-skrivningen. Raden dyker sedan upp i `--kinds=drain`. **Detta är grinden.** |
| `ok: true` och `stored: 0` | Signaturen gick igenom, men raden kastades. Vanligast: `projectId` matchade inte — `isAllowedDrainProjectId` är fail-closed och släpper bara appens eget `VERCEL_PROJECT_ID`. Det är **inte** ett fel i mottagaren. Ett främmande id som `prj_x` ger alltid `stored: 0`. |

Vercel testar endpointen automatiskt när drainen *väl* skapas, och
**Test**-knappen gör samma sak. `POST /v1/drains/test` validerar
leveranskonfigurationen (URL, encoding, secret, sampling) med sample-events
**utan** att skapa något skarpt — kör den före `POST /v1/drains`.

Skulle **Create Drain** vägra gå igenom för att dess eget test får `403`: säg
till, då behöver mottagaren en särskild gren för Vercels overifierade probe.
Den är medvetet inte byggd på spekulation.

### Skapa drainen (steg 4)

Dialogen når du via Vercel-dashboarden → **Team Settings → Drains → Add Drain**.
Klistra in **samma** secret som redan ligger i `VERCEL_LOG_DRAIN_SECRET`.
Generera inte ett nytt värde i dialogen efter att drainen är live — då matchar
inte signaturerna, eller så måste env + deploy hinna före och farofönstret är
tillbaka.

| Fält i Vercels dialog | Värde |
|---|---|
| Data to drain | **Logs** |
| Destination | **Custom Endpoint** |
| Method | `POST` (fast) |
| **URL** | **`https://sajtmaskin.vercel.app/api/drains/vercel`** |
| Encoding | `JSON` eller `NDJSON` — mottagaren parsar båda |
| Signature Verification Secret | **samma värde som `VERCEL_LOG_DRAIN_SECRET`** |
| Custom Headers | behövs inte |

**Projektscope:** skapa drainen avgränsad till **Sajtmaskin-appen** (inte hela teamet).
Mottagaren fail-closed-filtrerar på `VERCEL_PROJECT_ID` och kastar rader från andra
projekt — men felkonfigurerad bred drain är fortfarande onödig trafik.

### Loop-brytaren vid källan

Tre skyddslager, inifrån och ut:

| Lager | Vad det gör | Vad det *inte* gör |
|---|---|---|
| `isSelfDrainLog` | Håller *tabellen* ren — egna ingest-rader sparas inte | Stoppar **inte** anropen. Loopen lever så länge Vercel levererar. |
| `410` när ENABLED/secret saknas | Får Vercel att sluta retrysa och markera drainen som errored | Begränsar skadan *i efterhand*. Invocations hinner gå innan Vercel ger upp. |
| `sampling` `rate: 0` på ingest-sökvägen | **Vercel** kastar ingest-routens egna loggrader *innan* de levereras | — det är loop-brytaren vid källan |

Vercels drain-API (`POST /v1/drains`, fältet `sampling`) stödjer sampling per
sökväg. `rate` är 0–1; `requestPath` är ett prefix. Exakt värde på `type` är
**inte** verifierat mot ett riktigt API-anrop — skulle det vara fel ignoreras
regeln tyst, och då är loop-brytaren borta utan att någon märker det.

```json
"sampling": [{ "type": "log", "rate": 0, "requestPath": "/api/drains/vercel" }]
```

Validera sampling-blocket med `POST /v1/drains/test` **innan** skarp
`POST /v1/drains`, och läs tillbaka drainen efteråt med `GET /v1/drains`
(`includeMetadata=true`) så att regeln faktiskt sitter. En tyst ignorerad
regel är värre än ingen regel — då tror man att man är skyddad.

Dashboardens globala **Sampling rate** är en annan ratt (lämna den på 100 % för
övriga loggar — mottagaren filtrerar redan hårt). Per-sökväg-regeln ovan syns
inte alltid i dialogen; sätt den via API:t när drainen skapas.

### Skruva ner volymen vid källan

Under **Additional configuration for logs** i samma dialog:

- **Sources:** `lambda` räcker för appens console-rader. `build` är sällan
  intressant här (byggloggar hämtas ändå per deploy).
- **Environments:** bara `production`.
- **Sampling rate:** lämna på 100 % för *övriga* sökvägar. Loop-brytaren ovan
  (`rate: 0` på `/api/drains/vercel`) är den enda sänkningen som ska med från
  start. Sänk den globala raten bara om Vercel-sidan börjar kosta.

## Vad som faktiskt lagras

Mottagaren (`src/lib/vercel/vercel-log-drain.ts`) är avsiktligt snål. En rad sparas i
`vercel_log_drain_events` bara om något av detta stämmer:

- `level` är `error`, `warning` eller `fatal`
- `type` är `stderr` eller `fatal`
- `statusCode` ≥ 500, eller `-1` (funktionen dog utan svar)
- meddelandet innehåller något av `/logg` steg 3c-mönstren
  (`[product-postcheck] skipped`, `free space in temporary directory`,
  `Thumbnail capture failed`, `stillMissing: [`, `Vercel Runtime Timeout Error`,
  `[CSP Violation]`, `AI SDK Warning`, `EMAXCONNSESSION`,
  `timeout exceeded when trying to connect`)

Allt annat kastas vid ingest. Rader äldre än **14 dagar** rensas (som mest en
gång i timmen per instans, efter svaret). `proxy.clientIp` sparas aldrig.

Tabellen är alltså en **avgränsad diagnostisk svans**, inte loggagring. Vill du
ha sök, dashboards och alerting över *all* logg är en native integration
(Axiom, Better Stack, Dash0) rätt verktyg — inte den här.

## Läsa raderna

```powershell
node scripts/db/dump-logs.mjs --json `
  --env=.env.vercel.production.pulled `
  --kinds=drain --limit=100 --allow-insecure-ssl
```

Även i backoffice: **Logg-export → App-console via Vercel**. `/logg` steg 2c
kör samma sak som del av sin vanliga hämtning.

Kinden bär **ingen** `chat_id` — plattformsloggar vet inget om chattar. Korrelera
på `log_timestamp` mot körningens `created_at`, eller på `request_id`.

## Sådant som förvånar

**Same-app-drain kan bli en kostnadsbomb.** 2026-08-11 pekade `loggning-drain`
mot `https://sajtmaskin.vercel.app/api/drains/vercel` innan mottagaren var
färdig/aktiverad. Varje leverans skapade nya function-loggar som drainen skickade
tillbaka → ~2,8M invocations på en timme. **Fixen är att radera drainen i
dashboarden**, inte bara hoppas på kodfilter. Kill-switchen
(`VERCEL_LOG_DRAIN_ENABLED`) + `410` gör att en felaktigt återskapad drain
snabbt går till errored i stället för att retrysa i evighet — men den stoppar
inte anropen förrän Vercel ger upp, så radera fortfarande drainen vid storm.

`isSelfDrainLog` kastar egna ingest-rader så *tabellen* förblir ren, men
*anropen* fortsätter så länge drainen är aktiv. Det är därför loop-brytaren vid
källan (`sampling` `rate: 0` på `/api/drains/vercel`) ska med **när drainen
skapas** — inte som en efterhandslapp. Föredra en extern mottagare (Axiom /
separat projekt) om du vill undvika same-app-loopen helt.

**Endpointen är nere när appen är nere.** Det är precis då du vill läsa
loggarna. Vercel gör om leveransen ett antal gånger vid tillfälliga 5xx, så en
kort incident hämtar sig, men en längre nertid betyder att fönstret saknas i
Postgres. Vercels egna loggar finns kvar — `vercel logs` är fortfarande
sanningen när det brinner.

**`410` i loggen betyder "avstängd eller ingen secret".** Routen vägrar ta emot
data den inte ska / inte kan verifiera, utan att bjuda in retries. Kolla att
`VERCEL_LOG_DRAIN_ENABLED=true` **och** `VERCEL_LOG_DRAIN_SECRET` finns i
production **och** att en deploy skett efter att de lades till. En live drain
som möter `410` är farofönstret — stäng av eller radera drainen, flippa inte
switchen "för att se".

**Spend Management.** En spend alert i Vercel Billing är den yttersta
nödbromsen om en loop skulle återkomma trots ordningen och sampling-regeln.

## Related

- Env-sanning: [`docs/ENV.md`](../ENV.md) → `VERCEL_LOG_DRAIN_ENABLED` + `VERCEL_LOG_DRAIN_SECRET`
- Loggöversikt: [`.cursor/skills/logg/SKILL.md`](../../.cursor/skills/logg/SKILL.md) steg 2c
- Migration: `src/lib/db/migrations/add-vercel-log-drain-events.sql`
- Vercels dokumentation: [Drains](https://vercel.com/docs/drains) · [Logs-schema](https://vercel.com/docs/drains/reference/logs) · [Säkerhet](https://vercel.com/docs/drains/security) · [Skapa drain](https://vercel.com/docs/rest-api/reference/endpoints/drains/create-a-new-drain) · [Testa leverans](https://vercel.com/docs/rest-api/reference/endpoints/drains/validate-drain-delivery-configuration)
