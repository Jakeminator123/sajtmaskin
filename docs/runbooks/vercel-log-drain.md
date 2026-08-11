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
ekoas tillbaka (Vercels ownership-handshake) **även när kill-switchen är av**. Signerade
leveranser kräver **både** `VERCEL_LOG_DRAIN_ENABLED=true` och `VERCEL_LOG_DRAIN_SECRET`.

### Vad som är env och vad som inte är det

| Namn | Rätt? | Var |
|---|---|---|
| `VERCEL_LOG_DRAIN_ENABLED=true` | **Ja** — kill-switch, måste vara exakt `true` | Vercel **production**-env |
| `VERCEL_LOG_DRAIN_SECRET=<secret från dialogen>` | **Ja** | Vercel **production**-env (valfritt i `.env.local` bara om du testar mottagaren lokalt) |
| `DRAIN=…` | **Nej** — koden läser inte det | — |
| `POST_DRAIN=https://…` | **Nej** — URL:en är **inte** en env-variabel | Vercel-dialogen → fältet **URL** |

URL:en pekar drainen mot mottagaren. Secreten verifierar `x-vercel-signature`.
`ENABLED` är den manuella brytaren. Blanda inte ihop dem, och döp inte om secreten
till `DRAIN`.

### Secreten + kill-switchen hör hemma i Vercel-env, inte i git

Det genererade värdet är den **enda** grinden mot att vem som helst som gissar
URL:en kan skriva rader i vår databas — men **utan** `ENABLED=true` tar vi ändå
inte emot något (410). Lägg båda (från länkad repo-rot, inte en worktree utan
`.vercel/`):

```powershell
# från C:\Users\jakem\dev\projects\sajtmaskin (huvudcheckouten):
$secret = Read-Host "Klistra in Signature Verification Secret"
$secret | vercel env add VERCEL_LOG_DRAIN_SECRET production --yes
"true" | vercel env add VERCEL_LOG_DRAIN_ENABLED production --yes
```

Sedan **en ny production-deploy**, annars ser den körande funktionen inte
variablerna. Rekommenderad ordning:

1. Deploya koden (ENABLED unset → default av).
2. Skapa drainen i dashboarden (ownership-proben fungerar utan ENABLED).
3. Sätt `VERCEL_LOG_DRAIN_SECRET` + `VERCEL_LOG_DRAIN_ENABLED=true`.
4. Deploya igen — först då accepteras signerade leveranser.

Saknas ENABLED eller secret svarar routen `410 Gone` (inte `503`). Det är medvetet:
efter incidenten 2026-08-11 vill vi att Vercel **slutar retrysa** och markerar
drainen som errored, inte att den fortsätter hamra oss.

Sätt dem **bara i production**. Preview-deployer behöver dem inte. Lägg **inte**
`POST_DRAIN` eller `DRAIN` i Vercel-env — det gör ingenting.

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

**Same-app-drain kan bli en kostnadsbomb.** 2026-08-11 pekade `loggning-drain`
mot `https://sajtmaskin.vercel.app/api/drains/vercel` innan mottagaren var
färdig/aktiverad. Varje leverans skapade nya function-loggar som drainen skickade
tillbaka → ~2,8M invocations på en timme. **Fixen är att radera drainen i
dashboarden**, inte bara hoppas på kodfilter. Kill-switchen
(`VERCEL_LOG_DRAIN_ENABLED`) + `410` gör att en felaktigt återskapad drain
snabbt går till errored i stället för att retrysa i evighet — men den stoppar
inte anropen förrän Vercel ger upp, så radera fortfarande drainen vid storm.

Mottagaren kastar alltid egna ingest-rader (`isSelfDrainLog`) så *tabellen*
förblir ren, men *anropen* fortsätter så länge drainen är aktiv. Föredra en
extern mottagare (Axiom / separat projekt) om du vill undvika loopen helt.

**Endpointen är nere när appen är nere.** Det är precis då du vill läsa
loggarna. Vercel gör om leveransen ett antal gånger vid tillfälliga 5xx, så en
kort incident hämtar sig, men en längre nertid betyder att fönstret saknas i
Postgres. Vercels egna loggar finns kvar — `vercel logs` är fortfarande
sanningen när det brinner.

**`410` i loggen betyder "avstängd eller ingen secret".** Routen vägrar ta emot
data den inte ska / inte kan verifiera, utan att bjuda in retries. Kolla att
`VERCEL_LOG_DRAIN_ENABLED=true` **och** `VERCEL_LOG_DRAIN_SECRET` finns i
production **och** att en deploy skett efter att de lades till.

**Spend Management.** Sätt en spend alert i Vercel Billing — det är
nödbromsen om en loop skulle återkomma.

## Related

- Env-sanning: [`docs/ENV.md`](../ENV.md) → `VERCEL_LOG_DRAIN_ENABLED` + `VERCEL_LOG_DRAIN_SECRET`
- Loggöversikt: [`.cursor/skills/logg/SKILL.md`](../../.cursor/skills/logg/SKILL.md) steg 2c
- Migration: `src/lib/db/migrations/add-vercel-log-drain-events.sql`
- Vercels dokumentation: [Drains](https://vercel.com/docs/drains) · [Logs-schema](https://vercel.com/docs/drains/reference/logs) · [Säkerhet](https://vercel.com/docs/drains/security)
