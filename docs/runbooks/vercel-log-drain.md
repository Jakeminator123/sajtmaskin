# Vercel Log Drain → Postgres

Gör appens egna `console.warn`/`console.error` läsbara med SQL i stället för bara
`vercel logs`. Utan drainen finns de raderna **enbart** på Vercel-plattformen,
vilket är hela anledningen till att `/logg` har ett obligatoriskt "hämta och
greppa `vercel logs --json`"-steg: sex körningar i rad rapporterade artigt
`product_postcheck.skipped` medan Vercel-loggen visade en kraschad Chromium.

Drainen är **valfri**. Är den av fungerar allt som förut, och `--kinds=drain`
returnerar tom lista.

## Sätt upp den

| Fält i Vercels dialog | Värde |
|---|---|
| Data to drain | **Logs** |
| Destination | **Custom Endpoint** |
| Method | `POST` (fast) |
| **URL** | **`https://sajtmaskin.vercel.app/api/drains/vercel`** |
| Encoding | `JSON` eller `NDJSON` — mottagaren parsar båda |
| Signature Verification Secret | generera i dialogen, kopiera värdet |
| Custom Headers | behövs inte |

Dialogen når du via Vercel-dashboarden → **Team Settings → Drains → Add Drain**.

**Projektscope:** skapa drainen avgränsad till **Sajtmaskin-appen** (inte hela teamet).
Mottagaren fail-closed-filtrerar på `VERCEL_PROJECT_ID` och kastar rader från andra
projekt — men felkonfigurerad bred drain är fortfarande onödig trafik.

**Verify/Create-probe:** osignerad POST med `x-vercel-verify` får `200` + samma header
ekoas tillbaka (Vercels ownership-handshake). Signerade leveranser kräver
`VERCEL_LOG_DRAIN_SECRET`.

### Vad som är env och vad som inte är det

| Namn | Rätt? | Var |
|---|---|---|
| `VERCEL_LOG_DRAIN_SECRET=<secret från dialogen>` | **Ja** | Vercel **production**-env (valfritt i `.env.local` bara om du testar mottagaren lokalt) |
| `DRAIN=…` | **Nej** — koden läser inte det | — |
| `POST_DRAIN=https://…` | **Nej** — URL:en är **inte** en env-variabel | Vercel-dialogen → fältet **URL** |

URL:en pekar drainen mot mottagaren. Secreten verifierar `x-vercel-signature`.
Blanda inte ihop dem, och döp inte om secreten till `DRAIN`.

### Secreten hör hemma i Vercel-env, inte i git

Det genererade värdet är den **enda** grinden mot att vem som helst som gissar
URL:en kan skriva rader i vår databas. Lägg det som `VERCEL_LOG_DRAIN_SECRET`
(från länkad repo-rot, inte en worktree utan `.vercel/`):

```powershell
# från C:\Users\jakem\dev\projects\sajtmaskin (huvudcheckouten):
$secret = Read-Host "Klistra in Signature Verification Secret"
$secret | vercel env add VERCEL_LOG_DRAIN_SECRET production --yes
```

Sedan **en ny production-deploy**, annars ser den körande funktionen inte
variabeln. Ordningen spelar roll: skapar du drainen innan variabeln finns svarar
routen `503` på varje leverans (den vägrar ta emot osignerbar data). Det är
ofarligt — Vercel försöker igen — men "Test"-knappen i dialogen kommer att se
misslyckad ut tills variabeln är på plats och deployad.

Sätt den **bara i production**. Preview-deployer behöver den inte, och varje
extra miljö är ett extra ställe secreten kan läcka från. Lägg **inte**
`POST_DRAIN` i Vercel-env — det gör ingenting.

### Testa själv med en signerad request

Vercel testar endpointen automatiskt när drainen skapas, och **Test**-knappen
gör samma sak. Routen kräver giltig signatur, så ett test utan signatur svarar
`403` — vilket är meningen, men ser ut som ett fel. Verifiera i stället själv:

```powershell
$secret = "<samma värde som VERCEL_LOG_DRAIN_SECRET>"
$body = '[{"id":"selftest-1","deploymentId":"dpl_x","projectId":"prj_x","source":"lambda","host":"sajtmaskin.vercel.app","timestamp":1,"level":"error","message":"drain selftest"}]'
$hmac = [System.Security.Cryptography.HMACSHA1]::new([Text.Encoding]::UTF8.GetBytes($secret))
$sig = ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($body)) | ForEach-Object { $_.ToString("x2") }) -join ""
Invoke-RestMethod -Method Post -Uri "https://sajtmaskin.vercel.app/api/drains/vercel" `
  -Headers @{ "x-vercel-signature" = $sig } -ContentType "application/json" -Body $body
```

Svar `{ ok = True; received = 1; stored = 1 }` betyder att hela kedjan lever.
Raden dyker sedan upp i `--kinds=drain`.

Skulle **Create Drain** vägra gå igenom för att dess eget test får `403`: säg
till, då behöver mottagaren en särskild gren för Vercels overifierade probe.
Den är medvetet inte byggd på spekulation.

### Skruva ner volymen vid källan

Under **Additional configuration for logs** i samma dialog:

- **Sources:** `lambda` räcker för appens console-rader. `build` är sällan
  intressant här (byggloggar hämtas ändå per deploy).
- **Environments:** bara `production`.
- **Sampling rate:** lämna på 100 % — mottagaren filtrerar redan hårt. Sänk bara
  om Vercel-sidan börjar kosta.

## Vad som faktiskt lagras

Mottagaren (`src/lib/vercel-log-drain.ts`) är avsiktligt snål. En rad sparas i
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

**Drainen matar sig själv.** Vercel levererar även loggarna från
`/api/drains/vercel`, som ju är en vanlig funktion. Mottagaren kastar alltid de
raderna (`isSelfDrainLog`), så tabellen förblir ren — men *anropen* fortsätter:
varje leverans föder en ny requestrad som kommer tillbaka i nästa batch. Det
blir en tunn, stabil ström (en in → en ut, inte exponentiellt), inte en storm.
Stör den ändå: peka drainen på ett separat Vercel-projekt i stället.

**Endpointen är nere när appen är nere.** Det är precis då du vill läsa
loggarna. Vercel gör om leveransen ett antal gånger, så en kort incident hämtar
sig, men en längre nertid betyder att fönstret saknas i Postgres. Vercels egna
loggar finns kvar — `vercel logs` är fortfarande sanningen när det brinner.

**`503` i loggen betyder oftast "ingen secret".** Routen vägrar ta emot data
den inte kan verifiera. Kolla att `VERCEL_LOG_DRAIN_SECRET` finns i production
**och** att en deploy skett efter att den lades till.

## Related

- Env-sanning: [`docs/ENV.md`](../ENV.md) → raden `VERCEL_LOG_DRAIN_SECRET`
- Loggöversikt: [`.cursor/skills/logg/SKILL.md`](../../.cursor/skills/logg/SKILL.md) steg 2c
- Migration: `src/lib/db/migrations/add-vercel-log-drain-events.sql`
- Vercels dokumentation: [Drains](https://vercel.com/docs/drains) · [Logs-schema](https://vercel.com/docs/drains/reference/logs) · [Säkerhet](https://vercel.com/docs/drains/security)
