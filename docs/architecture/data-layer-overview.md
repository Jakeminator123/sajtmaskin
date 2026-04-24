# Data Layer Overview

> **Skriven för icke-tekniska läsare.** Hur Sajtmaskin lagrar data, var saker
> ligger, vad det kostar, och hur du själv kan kolla att allt är OK.
>
> Långbänk 2026-04-24 — se `lineage/2026-04-24-långbänk-databas-redis-observability.md`
> för körlogg. Uppföljning samma dag (auto-update + röd knapp + bug-fix) i
> `lineage/2026-04-24-langbank-perf-indexes-auto-och-knapp.md`.

## ⚠️ Läs detta först (om du är osäker på databaser)

Den här filen + backoffice-sidorna **Databashälsa** och **Redis-hälsa** är
skrivna för dig som **inte** är expert på Postgres/Redis. Tre saker att veta:

1. **Inget på dessa sidor förstör data.** Hälso-kollarna är read-only.
   Den enda mutation som finns är "Applicera index"-knappen, som bara
   skapar nya **index** (sökregister) — den ändrar inte en enda rad.
2. **Index är idempotent.** Klicka knappen 100 gånger — Postgres skapar
   bara det som inte redan finns. Det går inte att råka göra dubbletter.
3. **Allt loggas.** Varje gång knappen körs (eller `npm run dev`-auto-
   körningen kör den) sparas en rad i `data/observability/db-perf-indexes-runs.ndjson`
   med tidsstämpel, vem, varför, och vad som hände. Du kan alltid backa
   och se vem som gjorde vad.

Om något känns konstigt: tryck **inget**, läs den här filen, fråga.
Det är aldrig brådskande att applicera index — appen funkar utan dem,
bara långsammare.

## TL;DR — vad ligger var?

| Vad | Var | Klient | Varför |
|---|---|---|---|
| Användare, projekt, chats, versioner, telemetri, allt "permanent" | **Postgres hos Supabase** (`*.pooler.supabase.com`) | `pg` + Drizzle ORM | Strukturerad data med relationer |
| Sessioner, cache, rate-limits, preview-state, kortlivade jobb | **Redis hos Upstash** (`alert-silkworm-17000.upstash.io`) | `ioredis` (TCP) **+** `@upstash/redis` (HTTP) | Snabb nyckel/värde-lookup, TTL-baserad utgång |
| Användarbilder & filuppladdningar | Lokalt FS (`data/uploads/`) i dev, **Vercel Blob** i prod | `@vercel/blob` | Fil-storlek, CDN-leverans |
| Generationsmetrics-tidsserie | Prometheus expo via `/api/metrics` | `prom-client` | Backofficens Observability-sida |

Vi använder **inte** Supabase Auth, Storage, Realtime eller PostgREST — bara
Postgres-protokollet rakt av. Det är därför Supabase-dashboardens räknare
("Database Requests: 0") ser tomma ut även när allt fungerar.

## Postgres — strikta scheman & migrationer

### Source of truth

`src/lib/db/schema.ts` är källan för Drizzle-typerna (TypeScript) och
`scripts/db/db-init.mjs` är källan för faktiska CREATE TABLE-satser. De ska
hållas i synk; **Databashälsa-sidan i backofficen flaggar drift**.

### Auto-applicering av perf-index

**Lokalt (`npm run dev`):** `predev`-kedjan kör automatiskt
`scripts/db/add-performance-indexes.mjs --reason auto:predev` som ett
**soft-step** — om migrationen failar (nätverksproblem, lock, etc.)
fortsätter dev-servern att starta ändå. Allt loggas i audit-NDJSON.
Detta speglar mönstret som redan finns för `db:init.mjs`.

**I produktion (Vercel):** Ingen automatik. Migrationen körs **bara**
om du:
- Manuellt kör `npm run db:perf-indexes` från CLI mot prod-DB:n, eller
- Trycker "APPLY"-knappen på backoffice "Databashälsa"-sidan

Designval: vi vill inte att Vercel-deploys triggar DB-DDL automatiskt.
Det skulle skapa risk för att en oavsiktlig deploy kör en migration
mot prod under hög trafik.

### Hot-path-tabeller (de som måste vara snabba)

| Tabell | Hot path | Krav |
|---|---|---|
| `engine_chats` | Builder-laddning | PK-lookup |
| `engine_messages` | `getChat()` läser ALLA meddelanden per chat | **Index på `(chat_id, created_at)`** |
| `engine_versions` | Versionshistorik per chat (repair-flöden) | **Index på `(chat_id, created_at)`** + unique `(chat_id, version_number)` |
| `generation_telemetry` | Eval, observability | Index på `chat_id`, `version_id`, `created_at` |
| `deployments` | SSE-events under deploy (`GET /api/v0/deployments/[id]/events`) | Index på `chat_id`, `version_id`, `vercel_deployment_id` |

Långbänk 2026-04-24 lade till de saknade index ovan via
`scripts/db/add-performance-indexes.mjs` (idempotent — kör om-och-om-igen).

### Säkerhets-strikthet (constraints i DB:n)

DB:n vägrar dålig data oavsett vad koden försöker spara:

- **NOT NULL** på alla nyckelkolumner (id, created_at, foreign keys vi alltid
  fyller). Ingen "tom" rad kan smyga sig in.
- **UNIQUE-index** för idempotens där det räknas:
  - `transactions(stripe_session_id)` → dubbla Stripe-webhookar slår mot
    constraint istället för att skapa dubbla saldotransaktioner
  - `versions(chat_id, v0_version_id)` → samma version kan inte registreras två gånger
  - `engine_versions(chat_id, version_number)` → samma idé för own-engine
  - `users(email)`, `guest_usage(session_id)`, etc.
- **Foreign keys med `ON DELETE CASCADE`** — radera ett `engine_chats` och
  alla relaterade meddelanden + versioner + telemetri försvinner automatiskt.
  Inget orphan-data.
- **`defaultNow()`** på alla `created_at`/`updated_at`. Koden kan inte glömma.
- **`default(0)` / `default(false)`** på flag-kolumner som måste vara satta.

Vad som **inte** finns idag (känt gap, dokumenterat):
- Zod-validering på inkommande API-payloads — finns sporadiskt men inte
  systematiskt. Nästa runda. (Se §"Framtida arbete" nedan.)

### Connection-poolen

`src/lib/db/client.ts` cachar en `pg.Pool` på `globalThis` så Next.js HMR i
dev inte skapar en ny pool per Fast Refresh (det skulle uttömma Supabase
pgbouncer). Pool-storleken anpassas efter typ av connection:
- Mot pgbouncer/pooler-host → `max: 3` (pgbouncer cap:ar aggressivt)
- Direkt Postgres → `max: 10`

Override via `POSTGRES_POOL_MAX` om du vet vad du gör.

## Redis — vad cachas och varför

### Två klienter, samma databas

| Klient | Path | Användning |
|---|---|---|
| `ioredis` (TCP) | `src/lib/data/redis.ts`, `src/lib/redis-pubsub.ts` | Sessioner, cache, project-files, video jobs, deploy-status pub/sub |
| `@upstash/redis` (HTTP/REST) | `src/lib/rateLimit.ts` | Rate-limiting (cold-start-vänligt i serverless) |

Båda pratar med samma Upstash-instans. Detta är teknisk skuld vi
medvetet bär — full migration till HTTP-klienten lever på P2-listan.
Till dess krymper båda klienternas connection-overhead via:
- `lazyConnect: true` (TCP öppnas först vid första anropet)
- `maxRetriesPerRequest: 1–3` (kort fail-fast)

### Nyckel-namnrymd

Alla nycklar prefixas per miljö så dev/preview/prod inte kolliderar
även om de delar databas (vilket de gör idag):

```
dev:user:session:{userId}            → CachedUser JSON, TTL 7 dagar
dev:cache:{key}                      → ad-hoc cache, TTL 1h
dev:audit:{auditId}                  → audit-resultat, TTL 24h
dev:project:files:{projectId}        → ProjectFile[], TTL 1h
dev:preview-session:session:{chatId} → Tier-2 VM-session, TTL 2h
dev:brief:v1:{model}:{chat}:{hash}   → /api/ai/brief cache, TTL 24h
sajtmaskin:dev:ratelimit:{endpoint}:{client}  → rate-limit räknare
prod:health:probe:*                  → backoffice self-test, TTL 30s
```

Källa: `src/lib/data/redis.ts` toppkommentar, `src/lib/api/ai/brief-cache.ts`,
`src/lib/rateLimit.ts`.

### Best-practices vi följer

Mappade mot Redis-skill-reglerna:

- **`data-key-naming`** ✅ — strikta prefix per kategori + miljö
- **`ram-ttl`** ✅ — TTL satt på alla cache-nycklar (ingen "för alltid")
- **`conn-pooling`** ✅ — singleton-klient per process
- **`conn-blocking`** ⚠️ — `listUserTakenOverProjects` använder SCAN; bör
  ersättas med en sekundär index-set på sikt (P3 i roadmap)
- **`security-auth`** ✅ — credentials i `.env.local`, aldrig committat
- **`observe-commands`** ✅ — `DBSIZE` + `INFO` exponerat via Redis-hälsa-sidan

## Observability — backoffice-sidor

### "Databashälsa" (`backoffice/pages/database_health.py`)

- Lista över alla förväntade tabeller + faktiska som finns
- Rad-antal (estimate via `pg_class.reltuples`, exakt via `COUNT(*)` om man kryssar i)
- Index-status per tabell — saknade index markeras rött
- "Testa allt nu"-knapp → kör `npm run db:health` och visar JSON-svaret
- Snapshot-historik (ND-JSON) → linjegrafer över tid
- Foreigner: visar varning om DB:n matchar `.env.vercel.production.pulled`

### "Redis-hälsa" (`backoffice/pages/redis_health.py`)

- PING + INFO (version, uptime, memory)
- Per-prefix nyckel-counts (SCAN-baserat, max 50k samples)
- Probe: write → read → del på `<env>:health:probe:<ts>` (TTL 30s safe-net)
- Snapshot-historik → grafer över total_keys, latens, probe round-trip

### Alternativa diagnostikvägar

| Verktyg | Var | Använd när |
|---|---|---|
| `npm run db:rows` | CLI | Snabb rad-överblick utan backoffice |
| `npm run db:health` | CLI | Samma som backofficen, JSON-svar i terminal |
| `npm run db:perf-indexes:dry` | CLI | Se vilka index som SKULLE skapas utan att göra det |
| `npm run db:perf-indexes` | CLI | Faktiskt skapa saknade index (idempotent, säkert mot prod) |
| `npm run db:perf-indexes:soft` | CLI / `predev` | Som ovan men felar tyst (auto-applicering) |
| `npm run redis:health` | CLI | Redis-statusen i JSON |
| `/api/health` | HTTP | Snabb live-check (Redis + features) |
| `/api/metrics` | HTTP | Prometheus-expo (renderas i Observability-sidan) |

## Kostnads­bild — vad kostar vad?

| Tjänst | Plan idag | Pris/månad | Vad du faktiskt använder |
|---|---|---|---|
| **Supabase** | Pro | ~$25 | BARA Postgres + connection pooler. Ingen Auth, Storage, Realtime, PostgREST. |
| **Upstash Redis** | Free | $0 | 82k/500k commands per månad — gott om utrymme |
| **Vercel** | Pro | $20 | Hosting + Functions + Blob |
| **Anthropic + OpenAI** | Pay-per-use | varierar | LLM-anrop |

**Supabase Pro motiveras av**:
- Längre query-loggar (7 dagar vs 1 dag på Free)
- Point-in-time recovery
- Större compute (du kör Micro idag)
- Inga inaktivitets-pauseringar (Free pausar efter 7 dagars idle)

Din **`jakembase_dev`-databas** ligger på samma Pro-plan men har 0 trafik
i dashboard-räknarna eftersom direkta Postgres-connections inte räknas där
(de mäter bara PostgREST-trafik). Verklig query-trafik syns under
**Database → Reports**.

### Optimerings­scenarier (icke-bindande)

- **A. Status quo.** Supabase Pro kvarstår. Vi har gott om utrymme på Redis Free.
  Lägsta arbetsinsats; dagens kostnad är hanterbar.
- **B. Konsolidera dev till en Supabase-branch.** Branching ingår i Pro;
  spara $25/mån genom att inte ha ett separat dev-projekt. Kräver
  re-pointing av `.env.local` POSTGRES_URL.
- **C. Migrera dev-databasen till Vercel-managed Neon.** Free tier räcker
  för dev-trafik; auto-pausar vid inaktivitet. Kräver Drizzle-driver-byte
  (`drizzle-orm/node-postgres` → `drizzle-orm/neon-http`). Mest jobb,
  potentiellt största besparing.

Långbänken **bestämde inget** här — bara dokumentation. Frågan om
leverantörsbyte ligger på dig.

## Hur du säkrar dig mot framtida problem

1. **Kör Databashälsa-sidan en gång i veckan** (eller efter större
   schema-ändringar). Saknade index? → klicka knappen, kör `npm run db:perf-indexes`.
2. **Kör Redis-hälsa-sidan när du noterar slö rate-limit-respons** eller
   när memory-användningen i Upstash-dashboarden går upp.
3. **Spara snapshots** under båda sidorna efter varje större release →
   över tid får du grafer som visar trender (rader, latens, key-counts).

## Framtida arbete (känt, ej i denna runda)

- **P2: Konsolidera Redis-klienter.** Migrera `src/lib/data/redis.ts` från
  `ioredis` till `@upstash/redis` (HTTP). Pub/sub i `redis-pubsub.ts` får
  bytas mot DB-polling eller en webhook (REST stödjer inte pub/sub).
  Vinst: mindre cold-start, mindre bundle-size.
- **P3: Sekundär index-set för `listUserTakenOverProjects`.** Ersätt SCAN
  med ett SADD/SMEMBERS-mönster (`prod:user:{userId}:projects`).
- **Zod-validering på alla API-routes.** Strikt input-validering. Stort
  arbete (40+ routes), men gör API:et idiotsäkert mot LLM-inducerad skräp-payload.
- **Drift-flag mellan `schema.ts` och `db-init.mjs`.** Idag är de två
  separata sources-of-truth som måste hållas synkade manuellt. Ett
  CI-test borde verifiera att Drizzle-schemat → CREATE TABLE matchar
  `db-init.mjs`. (Backoffice-sidan visar drift, men fångar inte alla
  former.)

## Referenser

- `src/lib/db/schema.ts` — Drizzle-schemat
- `scripts/db/db-init.mjs` — CREATE TABLE-satser
- `scripts/db/add-performance-indexes.mjs` — perf-index-migration (denna runda)
- `scripts/db/db-health-check.mjs` — DB-diagnos-script
- `scripts/db/redis-health-check.mjs` — Redis-diagnos-script
- `src/lib/data/redis.ts` — ioredis-klient + cache-funktioner
- `src/lib/rateLimit.ts` — `@upstash/redis` HTTP-klient
- `src/lib/redis-pubsub.ts` — pub/sub för deploy-status
- `lineage/2026-04-24-långbänk-databas-redis-observability.md` — körlogg för denna runda
