# Långbänk-uppföljning: auto-update + röd knapp + bug-fix — 2026-04-24

Direkt uppföljning på `lineage/2026-04-24-langbank-databas-redis-observability.md`.
Två problem från användarfeedback:

1. **Användaren vill ha auto-update av index** (likt `db:init.mjs` som körs
   via `predev`) — eller en röd knapp i backoffice som loggar varför man
   klickade.
2. **Buggrapport**: `db-health-check.mjs` rad 464 har
   `process.exit(out.ok ? 0 : 0)` som alltid exitar 0. Skulle vara 1 vid fel.

Beställare: Jake. Modell: parent (claude-opus-4.7). Läge: agent.

## Verifiering av buggen

Bekräftad. `process.exit(out.ok ? 0 : 0)` är logiskt en no-op trinär
(`?` med samma värde i båda grenar). Kommentaren motiverade designen
("vi rapporterar status i JSON") men det bryter CI/cron/healthchecker
som förlitar sig på exit-kod.

**Påverkan av att fixa:**
- ✅ Backoffice-sidan `database_health.py` läser stdout via `subprocess.run`
  med `capture_output=True` — exit-kod ignoreras där, så ändringen är benign
  för den.
- ✅ Inga andra call-sites idag (verifierat via grep).
- ✅ Framtida CI/cron-användning blir korrekt.

## Ändringar

### 1. Bug-fix

`scripts/db/db-health-check.mjs` rad 464:
```diff
- process.exit(out.ok ? 0 : 0); // alltid 0 — vi rapporterar status i JSON
+ // Exit-kod speglar `out.ok` så CI-pipelines / cron-jobb / health-monitorer
+ // kan upptäcka när något är fel (saknat index, connection error, etc).
+ // Backoffice-sidan parser stdout oavsett exit-kod så denna ändring
+ // bryter inte database_health.py. För användning där exit alltid ska
+ // vara 0 (t.ex. info-only logging), kör med `|| true` i shell.
+ process.exit(out.ok ? 0 : 1);
```

### 2. Audit-logg + --reason-flagga

`scripts/db/add-performance-indexes.mjs` accepterar nu `--reason "..."`
och skriver en rad till `data/observability/db-perf-indexes-runs.ndjson`
varje gång den körs (även dry-run, även misslyckad). Audit-raden innehåller:
- timestamp, dry_run-flagga, reason, target (redacted)
- created/already/skipped/failed counts
- process_user (USER eller USERNAME env)
- runtime_env

Best-effort write — om audit-loggen failar (t.ex. read-only FS) så
fortsätter migrationen. Det ska aldrig vara orsaken till att en
migration misslyckas.

`data/observability/` är gitignored så audit-loggen committas inte
oavsiktligt.

### 3. Auto-applicering via `predev`

`package.json`:
```diff
- "predev": "...db-init.mjs",
+ "predev": "...db-init.mjs && npm run db:perf-indexes:soft",
+ "db:perf-indexes:soft": "node scripts/db/add-performance-indexes.mjs --reason auto:predev || echo [db:perf-indexes] Soft-skipped (se data/observability/db-perf-indexes-runs.ndjson)",
```

`:soft`-varianten faller tillbaka till en `echo` om migrationen failar,
så `npm run dev` aldrig blockeras av en transient DB-issue. Speglar
mönstret som redan finns för `shadcn:sync:soft`.

I prod körs **inget automatiskt**. Användaren måste explicit klicka knappen
i backoffice eller köra CLI.

### 4. Röd knapp i backoffice

`backoffice/pages/database_health.py` har nu en sektion "🔧 Applicera
saknade index" med:
- Stort blått (Streamlit "primary") APPLY-knapp + en lugnare DRY-RUN-knapp
- Text-input "Varför kör du detta?" — kräver minst 10 tecken
- Checkbox "Jag förstår vad knappen gör" — måste vara ikryssad
- APPLY-knappen är **disabled** tills båda kraven uppfyllts
- Visar mål-DB:n i klartext + ⚠️ om PROD-LIKE
- Stor expander "Vad gör knappen?" med vad/när/vad-kan-gå-fel
- Resultatet (success/error + stdout/stderr) sparas i Streamlit-state
- Audit-logg renderas som tabell (sista 20 körningarna, nyast först)

Designprincip: medvetet **friktion** för icke-tekniska användare. Skriptet
är säkert även vid olyckliga klick (idempotent), men friktionen tvingar
reflektion.

### 5. Mindre städ

- `normalizeEnvUrl` användes inte i `add-performance-indexes.mjs` —
  nu används den per env-variabel så uninterpolerade `${VAR}`-strängar
  filtreras bort innan vi försöker URL-parsa.
- Lade till `redactConnectionString`-helper för audit-loggen
  (samma mönster som `db-health-check.mjs`).

## Filer rörda

MODIFIED:
- `scripts/db/db-health-check.mjs` — exit-code-fix
- `scripts/db/add-performance-indexes.mjs` — --reason, audit-logg, normalizeEnvUrl
- `package.json` — predev-hook + `:soft`-script
- `backoffice/pages/database_health.py` — röd-knapp-sektion
- `docs/architecture/data-layer-overview.md` — auto-applicering + "läs detta först"

NEW:
- `lineage/2026-04-24-langbank-perf-indexes-auto-och-knapp.md` — denna fil

NOT TOUCHED:
- Allt den andra agenten jobbar i (`src/lib/gen/scaffolds/*`, etc.)

## Verifiering

- ✅ `npm run typecheck` — pass (ingen TS-kod ändrades)
- ✅ `ReadLints` på alla rörda filer — clean
- ✅ `npm run db:perf-indexes:dry` — körs utan fel, audit-rad skapas
- ✅ `npm run db:health` — körs OK; exit-kod nu 1 om missing > 0 (testat)
- ✅ Streamlit-import av `database_health.py` — pass
- ✅ Audit-logg parser-test (manuell): JSON-rad skrivs och kan läsas tillbaka

## Säkerhets-analys (granskning av förra commit + dagens)

Kollade igenom föregående commit (`7df01a991`) + dagens diff för regressioner:

| Område | Risk | Status |
|---|---|---|
| schema.ts → ren typmetadata | Ingen DB-ändring | ✅ Säkert |
| add-performance-indexes.mjs → idempotent + dedupe | Inga duplikat | ✅ Säkert |
| db-health-check.mjs → read-only | Inga writes | ✅ Säkert (exit-fixad) |
| redis-health-check.mjs → write/read/del på TTL-30s probe | Eget namnrum, raderas direkt | ✅ Säkert |
| Backoffice-knapp → kräver text + checkbox | Friktion + audit-logg | ✅ Säkert |
| predev-hook (auto-apply lokalt) | Soft-step, blockerar inte dev | ✅ Säkert |
| Audit-logg path → gitignored | Committas inte oavsiktligt | ✅ Säkert |

Ingen regression hittad.

## Vad som medvetet INTE gjordes

- ❌ Auto-applicering i prod (Vercel-deploy-time). För riskabelt — en
  oavsiktlig deploy skulle kunna trigga DDL mot prod under hög trafik.
- ❌ Notifiering till Slack/email vid auto-apply. Lokal logging räcker.
- ❌ Rollback-knapp för index-skapande. Det är trivialt att DROP INDEX
  manuellt om det skulle behövas, och nyttan är minimal.

## Lärdomar

- **Exit-code-bugs är lätta att missa** när scripts mest används interaktivt.
  En enkel test (`echo $?` i CI) skulle ha fångat detta direkt.
- **Friktion är en feature** för knappar som kör DDL. En text-input som
  kräver eftertanke är värdefullt även om det är "bara" UX.
- **`|| echo`-pattern fungerar cross-platform** i npm scripts (Windows
  via cmd.exe). `shadcn:sync:soft` har använt mönstret länge utan problem.
