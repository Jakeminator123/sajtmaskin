# Kvarvarande "kräver dialog"-punkter — 2026-04-24

Saker som review-agenterna rapporterade under databas/Redis-långbänkarna
(2026-04-24, commits `7df01a991` … `4bd511264`) som vi medvetet INTE
fixade i samma runda. Dessa kräver antingen affärsbeslut, ett bredare
arbetsspår, eller koordinering med pågående parallella agenter.

**Kontext:** denna plan ersätter inga andra. Den finns för att lösa trådar
inte tappas och så att nästa session vet var startpunkten är. När en punkt
adresseras: flytta posten till `lineage/` eller bocka av i en commit-message.

## Kravnivå

- 🟥 **Kräver affärsbeslut** — design/policy som inte ska smygas in.
- 🟧 **Kräver bredare arbetsspår** — det är ett heldagsjobb, inte en quick fix.
- 🟨 **Kräver dialog med annan agent** — överlappar pågående pågående arbete.

## Punkter

### 1. 🟥 Mega-cleanup ordering (data raderas före Vercel-validering)

**Var:** `src/app/api/admin/database/route.ts` action `mega-cleanup`.

**Problem:** Vercel-projekten raderas först (om token finns) och bockar av
`results.vercel.errors`. Sedan raderas DB-rader och Redis ovillkorligt.
Om Vercel-delen failar (token utgången, rate-limit) har vi ändå rensat
DB:n. Toppnivå-svaret blir `success: false` (efter min fix `0ab329313`),
men data är borta.

**Beslut som behövs:**
- Ska Vercel-fail ABORTA hela operationen innan DB rörs?
- Eller är det "best effort" som det är idag?
- Eller behövs en separat 2-step "reset-vercel" + "reset-db"-knapp?

**Varför inte fixat:** policy-beslut, inte teknisk bug.

### 2. 🟧 `findCoveringIndex` TOCTOU-race

**Var:** `scripts/db/add-performance-indexes.mjs` rad 311-340.

**Problem:** Mellan `findCoveringIndex()` (kollar om något index täcker
samma kolumner) och `pool.query(idx.sql)` (skapar) kan en annan session
hinna skapa ett index med samma kolumner men annat namn. Resultat: dubbelt
index på samma kolumner med olika namn (slöseri på write-tid och disk).

**Lösning kräver:**
- PostgreSQL advisory lock under hela check+create-blocket, eller
- `CREATE INDEX CONCURRENTLY` (kräver att vi flyttar bort från transaktion), eller
- Acceptera och dokumentera (single-operator-läge — risken är ~0)

**Varför inte fixat:** kantfall i nuvarande single-operator-användning. Värt
att titta på när vi börjar köra parallella migrations från CI.

### 3. 🟧 `parseCreateIndexes` regex stödjer inte `CONCURRENTLY`

**Var:** `src/lib/db/schema-drift.test.ts` `parseCreateIndexes()`.

**Problem:** Regex tål `CREATE [UNIQUE] INDEX [IF NOT EXISTS] name` men
inte `CREATE INDEX CONCURRENTLY name` (CONCURRENTLY kommer FÖRE namnet).
Idag finns inga `CONCURRENTLY`-statements i repot, så testet missar inget.
Men om vi börjar använda concurrent migrations kommer schema-drift-testet
visa falska "saknade index"-larm.

**Lösning:** utöka regex med `(?:\s+CONCURRENTLY)?`.

**Varför inte fixat:** ingen aktuell drift, kantfall. Tar 5 minuter när
det blir relevant.

### 4. ✅ `run-migrations.ts` stödjer inte DATABASE_URL — LÖST i PR #106 (2026-04-26)

> **Status:** klar. Adresserad i PR
> [#106](https://github.com/Jakeminator123/sajtmaskin/pull/106) (commit
> `a1028475b`). `scripts/db/run-migrations.ts` delegerar nu till
> `resolveConfiguredDbEnv` + `DB_ENV_VARS` från `src/lib/db/env.ts`,
> vilket plockar upp `DATABASE_URL` som femte alias och får
> placeholder-/quote-saneringen gratis. Fel-meddelandet listar alla
> fem aliases från en sanning. Regression-anchor i
> `scripts/db/run-migrations.test.ts` (4 vitest-fall). En ESM
> entry-point-guard tillåter import från test utan att trigga
> `main()` / DB-anslutning. Den bredare "env-konvent-städ"-PR:n som
> täcker hela `scripts/db/` (t.ex. att deduplicera den parallella
> `resolveConfiguredDbEnv`-implementationen i `db-target-guard.mjs`)
> ligger fortfarande kvar som öppen fråga, men är inte längre
> blockerande för punkt 4.

**Var:** `scripts/db/run-migrations.ts` rad 11-24.

**Problem:** Skriptet läser bara `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING`
medan resten av repot (`src/lib/db/env.ts`) också accepterar `DATABASE_URL`
via `DB_ENV_VARS`. Drift mellan env-konventioner.

**Lösning:** importera `resolveConfiguredDbEnv` från `src/lib/db/env.ts`
och använd den.

**Varför inte fixat:** annat scope än de senaste långbänkarna. Triggas
sällan (manuell migration). Värt att samla i en "env-konvent-städ"-PR
som täcker hela `scripts/db/`.

### 5. 🟧 NDJSON tail-läsning — sällsynt skipp av giltig första rad

**Var:** `backoffice/observability_io.py` `load_tail_ndjson()`.

**Problem:** När filen är större än `tail_bytes` skippar vi alltid första
raden i tail-fönstret för att undvika halv JSON. Om vår seek HÄNDE landa
exakt på en radbörjan, har vi just kastat en GILTIG NDJSON-rad.

**Lösning:** klassisk tail-implementation — kolla byte före `seek` om det
är `\n`; om ja, behåll första raden.

**Varför inte fixat:** sannolikheten är låg (kräver att seek-positionen
hamnar precis på `\n`-boundary), och konsekvensen är att en
historik-snapshot saknas — ej kritiskt. Värt att fixa när någon prioriterar
audit-precision.

### 6. 🟨 Refaktor: NDJSON-helper kan flyttas till `backoffice/shared.py`

**Var:** `backoffice/observability_io.py`.

**Problem:** Jag skapade `observability_io.py` som separat fil för att inte
krocka med eval/backoffice-split-agentens städ av `shared.py`. När hans
arbete är committat (det är pushat nu, `9e928f956`) kan funktionen flyttas
till `shared.py` så det inte finns ett micro-modul-zoo.

**Lösning:** flytta `load_tail_ndjson` till `shared.py`, uppdatera 2
imports i `pages/database_health.py` + `pages/redis_health.py`, ta bort
`observability_io.py`. Behavior-neutral.

**Varför inte fixat:** koordinerings-spår, gör det när det är lugnt.

### 7. 🟧 Strict schemas för `db-drop-aliases-runs.ndjson` + snapshot-NDJSON

**Var:** `data/observability/db-drop-aliases-runs.ndjson`,
`data/observability/{db,redis}-health-snapshots.ndjson`.

**Problem:** Tre nya NDJSON-filer som backoffice läser men som inte har
strict schemas — drift-skydd missas där.

**Lösning:** Tre nya schemas under `docs/schemas/strict/` + tester i
`src/lib/db/health-schemas.test.ts`.

**Varför inte fixat:** lägre värde än de tre vi redan lade till
(`db-health-check-report`, `redis-health-check-report`,
`db-perf-indexes-audit-line`). Diminishing returns. Lägg till om någon
av dessa filer börjar konsumeras av flera ställen.

## När adresseras dessa?

- **Punkt 1** — nästa gång admin-flödet ses över, eller om mega-cleanup
  körs och Vercel failar i prod (då är det akut).
- **Punkt 2-3** — när vi flyttar till parallell migration-körning från CI.
- **Punkt 4** — ✅ klar (PR #106, 2026-04-26). Den bredare
  `scripts/db/`-städningen som ursprungligen var nämnd som "samla i en
  env-konvent-städ-PR" återstår dock — t.ex. dedupliceringen av
  `resolveConfiguredDbEnv` mellan `src/lib/db/env.ts` och
  `db-target-guard.mjs`.
- **Punkt 5** — när någon klagar på "varför saknas en snapshot ibland".
- **Punkt 6** — så snart eval/backoffice-split-agentens shared.py är settled.
- **Punkt 7** — när vi tar nästa runda strict schemas.

## Källrapporter

Genererade av tre review-agent-rundor 2026-04-24:
- Runda 1 (efter `7df01a991`): SAJ-60 Linear (extern test-agenters report)
- Runda 2 (efter `0ab329313`): tre parallella explore-agents
- Runda 3 (efter `4bd511264`): två parallella explore-agents

Lineage-filer:
- `lineage/2026-04-24-langbank-databas-redis-observability.md`
- `lineage/2026-04-24-langbank-perf-indexes-auto-och-knapp.md`
