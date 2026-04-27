# Långbänk: Databas + Redis observability — 2026-04-24

Långbänksrunda för att göra Sajtmaskins data-lager **idiotsäkert observerbart**
från backofficen, samt fylla glipan i Drizzle-schemat med saknade FK-index
som var den enskilt största prestanda-flaskhalsen i hot-path.

Beställare: Jake. Modell: parent (claude-opus-4.7). Inga subagenter (jobbet
var koncentrerat och risk-kontrollerat — sekventiella writes med tight scope).

## Bakgrund

Föregående diskussion (samma session) hade kartlagt att:
- 20+ FK-kolumner i `src/lib/db/schema.ts` saknade index → sequential scans
  på hot path (`getChat()` läser alla `engine_messages` per chat)
- Backofficen saknade en "se alla tabeller + status"-vy för Postgres
- Backofficen saknade en motsvarande Redis-vy
- Det fanns ingen "testa allt"-knapp för data-lagret

Användarens önskemål: **idiotsäkert**, **strikta scheman**, **graf-historik**,
**inget riskabelt**. Ingen leverantörsändring i denna runda — bara
dokumentationen av alternativen.

## Coordination

En annan agent jobbade samtidigt på `src/lib/gen/scaffolds/*`,
`src/lib/gen/orchestrate.ts`, `src/lib/gen/stream/finalize-version/persist-telemetry.ts`
och en ny `backoffice/pages/scaffold_performance.py`-sida. Denna långbänk:

- ✅ Rörde inga av hans filer
- ✅ Lade till mina sidor i `backoffice/pages/__init__.py` utan att ta bort hans
- ✅ Använde `git add <specifik-fil>` per fil i commit (aldrig `git add .`)
  så hans staging-area är intakt för honom att hantera

## Spår & resultat

### Spår A — Postgres FK-index (P0)

**Vad:**
1. `scripts/db/add-performance-indexes.mjs` — idempotent migrations-script
   som skapar 24 saknade index (`CREATE INDEX IF NOT EXISTS`).
2. Uppdaterade `src/lib/db/schema.ts` så Drizzle-typerna nu deklarerar
   alla index (matchar både existerande i `db-init.mjs` + de nya).

**Risker hanterade:**
- INTE rört `db-init.mjs` (för att inte krocka med andra agenter eller
  skapa drift med pågående migrations-historik).
- INTE kört migrationen mot DB:n. Användaren trycker själv `npm run db:perf-indexes`.
- `--dry-run`-flagga finns: `npm run db:perf-indexes:dry`.

**Förväntad effekt:** 5–50× snabbare på hot-path queries så fort
chats:en har 50+ meddelanden. `engine_messages`-indexet är det viktigaste
eftersom `getChat()` körs vid varje builder-öppning.

### Spår B — "Databashälsa"-sida i backofficen

**Vad:**
- `scripts/db/db-health-check.mjs` — read-only Node-script (ENBART
  `SELECT`/`EXPLAIN`-motsvarande queries). Producerar JSON med:
  - connection-latens
  - alla förväntade tabeller + rad-antal (estimate via `pg_class.reltuples`,
    eller exakt via `COUNT(*)` om man vill)
  - alla index per tabell
  - vilka **förväntade** index som saknas (jämför mot deklarations-listan)
  - vilka **extra** index som finns men inte är deklarerade (drift-flag)
  - per-tabell `SELECT 1 LIMIT 1`-probe för latens
- `backoffice/pages/database_health.py` — Streamlit-sida som anropar skriptet
  via subprocess och visar:
  - "Testa allt nu"-knapp
  - Metric-cards (connection ms, tabeller, rader, saknade index)
  - Saknade index → röd ruta + kopiera-bar `npm run db:perf-indexes`-kommando
  - Tabell-lista med rad-antal + index-status + probe-latens
  - Snapshot-historik (ND-JSON i `data/observability/db-health-snapshots.ndjson`)
  - Linjegrafer: rader över tid, latens över tid, saknade index över tid

**Säkerhet:**
- Read-only — sidan ändrar aldrig DB:n
- Varnings-flagga ⚠️ om DB:n matchar `.env.vercel.production.pulled`
- Snapshot är opt-in (kryssruta), inte default

### Spår C — "Redis-hälsa"-sida i backofficen

**Vad:**
- `scripts/db/redis-health-check.mjs` — använder `@upstash/redis` (HTTP)
  så ingen TCP-handshake i Node-processen. Producerar JSON med:
  - PING-latens
  - INFO (version, uptime, used memory, connected clients)
  - DBSIZE
  - SCAN per prefix-bucket (12 bucketmönster för dev:/preview:/prod: + sajtmaskin:ratelimit:)
    med max 50k-iterationer som safety-cap
  - Probe: write → read → del på `<env>:health:probe:<ts>` (TTL 30s safe-net)
- `backoffice/pages/redis_health.py` — motsvarande Streamlit-sida med:
  - PING/probe/memory metrics
  - Bucket-tabell med count + sample-keys + SCAN-latens per bucket
  - Snapshot-historik + grafer

**Säkerhet:**
- Self-test städar upp probe-nyckeln inom samma körning, +TTL=30s om det går snett
- Inga FLUSHDB-knappar exponeras

### Spår D — Dokumentation

- `docs/architecture/data-layer-overview.md` — för icke-tekniska. Vad
  ligger var, varför, vad det kostar, hur du själv kan kolla. Inkluderar
  optimerings-scenarier för leverantörer (status quo / branching / Neon).
- Detta lineage-dokument.

### Övrigt

- `package.json` fick fyra nya scripts:
  - `db:health` — kör health-check via CLI
  - `db:perf-indexes` — kör migration
  - `db:perf-indexes:dry` — visa vad som skulle göras
  - `redis:health` — Redis-statusen som JSON

## Filer som rörts (allt jag committar)

NEW:
- `scripts/db/add-performance-indexes.mjs`
- `scripts/db/db-health-check.mjs`
- `scripts/db/redis-health-check.mjs`
- `backoffice/pages/database_health.py`
- `backoffice/pages/redis_health.py`
- `docs/architecture/data-layer-overview.md`
- `lineage/2026-04-24-langbank-databas-redis-observability.md`

MODIFIED:
- `src/lib/db/schema.ts` — index-deklarationer (typmetadata, ingen DB-ändring)
- `backoffice/pages/__init__.py` — registrera nya sidor + alias `db`/`redis`
- `package.json` — fyra nya npm-scripts

NOT TOUCHED (annan agent jobbar där):
- `src/lib/gen/orchestrate.ts`
- `src/lib/gen/scaffolds/*`
- `src/lib/gen/stream/finalize-version/persist-telemetry.ts`
- `backoffice/pages/scaffold_performance.py`

## Verifiering

- `npm run typecheck` — pass
- `ReadLints` på `src/lib/db/schema.ts` — inga errors
- `npm run db:perf-indexes:dry` — dry-run lyfter alla 24 index, tabeller existerar
- `node scripts/db/db-health-check.mjs` — JSON-svar OK från lokal dev-DB
- `node scripts/db/redis-health-check.mjs` — JSON-svar OK från Upstash
- Backoffice: båda nya sidor renderar (verifierat via Streamlit dev-mode)

## Vad som medvetet INTE gjordes

- **`ioredis` → `@upstash/redis`-migration** (P2). Kräver att 30+ funktioner
  i `src/lib/data/redis.ts` skrivs om. Stort grepp, inte denna runda.
- **Zod-strict på alla API-routes**. Föreslagen som "framtida arbete" i
  `data-layer-overview.md`. För många routes (40+) för en runda.
- **Leverantörsbyte** (Supabase Pro → Free / Neon). Bara dokumentation av
  alternativen — beslut ligger på Jake.
- **`npm run db:perf-indexes` mot prod**. Skriptet är säkert att köra
  (idempotent + IF NOT EXISTS), men användaren bestämmer när.

## Öppna frågor / lämnat för senare

1. **Drift mellan `schema.ts` och `db-init.mjs`** — idag två sources of
   truth. Backoffice-sidan visar drift men fångar inte alla former. Ett
   CI-test borde verifiera kongruens. Lämnat åt nästa runda.
2. **Pub/sub i `redis-pubsub.ts`** — kan inte gå via HTTP-klienten. Måste
   ersättas med DB-polling eller webhook när vi gör P2-migrationen.
3. **`listUserTakenOverProjects` använder SCAN** — bryter Redis-best-practice
   `data-choose-structure`. Bör ersättas med en sekundär index-set
   (`SADD <prefix>user:{userId}:projects`). Ingår i P3.

## Lärdomar

- **Recon-steget i `/långbänk` sparar mycket** — upptäcktes att
  `db-init.mjs` redan hade ~20 index som inte var med i `schema.ts`
  (drift), så jag inte dubblerade befintliga index i migration-scriptet.
- **`AskQuestion`-tool är värdefullt när användaren är osäker** — fyra
  frågor i förväg räddade både scope och samordning med andra agenten.
- **Path-specifik `git add`** är rätt mönster när andra agenter jobbar
  parallellt. Aldrig `git add .` i en multi-agent-runda.
