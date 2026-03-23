# Postgres (Supabase) och Redis (Upstash): två olika roller

Sajtmaskin använder **båda**, men de löser **olika problem**. De ersätter inte varandra.

## PostgreSQL via Supabase

| Aspekt | Beskrivning |
|--------|-------------|
| **Vad det är** | Relationsdatabas (SQL). Källan till sanning för **beständiga** data. |
| **Hur appen använder det** | Via **Drizzle ORM** och `pg`-poolen i [`src/lib/db/client.ts`](../../src/lib/db/client.ts). Tabeller definieras i [`src/lib/db/schema.ts`](../../src/lib/db/schema.ts). |
| **Typiska data** | Användare, projekt, chattar, versioner, genererade fil-metadata, företagsprofiler, m.m. |
| **Anslutning** | `POSTGRES_URL` (ofta Supabase **transaction pooler** `:6543` i serverless). Migrationer prioriterar `POSTGRES_URL_NON_POOLING` eller härledd direkt-URL — se [`docs/ENV.md`](../ENV.md). |

**Kort sagt:** Om det ska finnas kvar efter omstart, i rapport, eller i flera API-anrop samma data — det ligger i Postgres.

## Redis via Upstash

| Aspekt | Beskrivning |
|--------|-------------|
| **Vad det är** | Nyckel/värde-lager i minnet (med persistens enligt Upstash-plan). **Inte** en SQL-databas. |
| **Hur appen använder det** | **TCP:** [`REDIS_URL`](../../src/lib/data/redis.ts) / `KV_URL` → **ioredis** för cache, sessions-liknande data, projektfiler i cache, m.m. **REST:** `UPSTASH_REDIS_REST_URL` + token → [`@upstash/redis`](../../src/lib/upstash-rest.ts) för rate limiting, och (när satt) distribuerade lås t.ex. audit in-flight i [`src/app/api/audit/route.ts`](../../src/app/api/audit/route.ts). |
| **Typiska data** | Kortlivat: cache, räknare, rate limits, temporära lås. **Ersätter inte** Postgres-rader för kärnverksamhet. |

**Kort sagt:** Snabb delad state mellan serverless-instanser, eller cache — inte primär lagring av användarens sajtdata.

## Är det rätt implementerat “som nu”?

- **Postgres:** All persistent domänlogik ska gå via Drizzle/`db`, inte via Redis som primär store.
- **Redis:** Om `REDIS_URL` / REST-credentials saknas faller vissa funktioner tillbaka (t.ex. in-memory rate limit, ingen distribuerad cache) — se [`src/lib/config.ts`](../../src/lib/config.ts) och [`GET /api/health`](../../src/app/api/health/route.ts) för faktisk status.

## Vanlig missuppfattning

> “Vi har Redis så vi behöver inte Postgres för X”

Nej — Redis är **inte** en full ersättning för relationsdata. Använd Postgres för det som ska query:as, join:as och versioneras; Redis för acceleration och koordinering.
