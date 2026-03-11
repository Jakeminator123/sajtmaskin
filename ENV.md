# Miljövariabler

Översikt av env-variabler för lokal utveckling och Vercel-deploy.
Fullständig validering finns i `src/lib/env.ts` och `src/app/api/admin/env/route.ts`.

## Infrastruktur-topologi

| Tjänst | Dev (lokalt) | Prod (Vercel) | Plan |
|--------|-------------|---------------|------|
| **Postgres** | Supabase DEV-projekt | Supabase PROD-projekt | Gratis (500 MB per projekt) |
| **Redis (cache)** | Upstash `sajtmaskin-dev` | Upstash `sajtmaskin-prod` | Dev: gratis (500K cmd/mån), Prod: pay-as-you-go |
| **Redis (rate limit)** | Upstash REST (samma instans) | Upstash REST (samma instans) | Ingår i ovanstående |
| **Blob storage** | Vercel Blob | Vercel Blob | Ingår i Vercel Pro |
| **Deploy** | `npm run dev` | Vercel Pro ($20/mån) | - |

**Separation:** Dev och prod MÅSTE använda separata Redis- och Postgres-instanser.
Alla Redis-nycklar har automatisk prefix (`dev:` / `prod:`) via `REDIS_KEY_PREFIX` i
`src/lib/config.ts`, men separata instanser ger äkta isolering.

## Kritiska (måste vara satta i produktion)

| Variabel | Lokalt | Vercel | Beskrivning |
|----------|--------|--------|-------------|
| `POSTGRES_URL` | .env.local | production, preview | Primär databas (Supabase) |
| `JWT_SECRET` | .env.local | production, preview | Auth-tokens |
| `OPENAI_API_KEY` | .env.local | production, preview | Own engine + prompt-assist (krävs när V0_FALLBACK_BUILDER inte är satt) |
| `V0_API_KEY` | .env.local | production, preview | v0 Platform API (krävs när V0_FALLBACK_BUILDER=y för fallback-läge) |
| `NEXT_PUBLIC_APP_URL` | .env.local | production, preview | Appens publika URL (t.ex. https://sajtmaskin.se) |

## Redis-variabler

| Variabel | Syfte | Beskrivning |
|----------|-------|-------------|
| `REDIS_URL` | ioredis cache | `rediss://...` URL till Upstash Redis |
| `KV_URL` | ioredis fallback | Samma format, används om `REDIS_URL` saknas |
| `UPSTASH_REDIS_REST_URL` | Rate limiting | `https://...upstash.io` REST-endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Rate limiting | Auth-token för REST-klienten |

Utan Redis faller rate limiting tillbaka till in-memory (opålitligt i serverless).
Utan Redis fungerar appen men utan caching -- alla requests går direkt till Postgres.

## E-post och korrespondens

| Variabel | Beskrivning |
|----------|-------------|
| `RESEND_API_KEY` | Resend — kontaktformulär (`/api/contact`), e-postverifiering vid registrering, återställ lösenord. Utan denna: formulär fungerar men mail skickas inte. |
| `EMAIL_FROM` | Avsändaradress (default: Sajtmaskin &lt;noreply@sajtmaskin.se&gt;) |

Utan `RESEND_API_KEY` fungerar appen, men användare får inga verifieringsmail och kontaktformuläret loggar bara meddelanden i stället för att skicka.

## Bilder (Unsplash)

| Variabel | Beskrivning |
|----------|-------------|
| `UNSPLASH_ACCESS_KEY` | Unsplash API-nyckel. Demo: 50 req/h, Production: 5000 req/h |

Bildflöde i generering:
1. Motorn genererar `/placeholder.svg?text=...` i koden
2. `image-materializer.ts` ersätter placeholders med riktiga Unsplash-bilder + triggar download-tracking
3. `image-validator.ts` HEAD-kollar alla bild-URL:er efter generering och ersätter trasiga
4. Materializer:ns nyligen lösta URL:er skickas som skip-set till validatorn (undviker dubbla anrop)

## Own engine (standardläge)

| Variabel | Default | Beskrivning |
|----------|---------|-------------|
| `SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS` | 32768 | Max output-tokens för sidgenerering |
| `SAJTMASKIN_AUTOFIX_MAX_OUTPUT_TOKENS` | 12288 | Autofix-pipeline |
| `SAJTMASKIN_STREAM_SAFETY_TIMEOUT_MS` | 720000 (12 min) | Klient-timeout innan stream avbryts |
| `SAJTMASKIN_ENGINE_ROUTE_MAX_DURATION_SECONDS` | 800 | Route maxDuration för build/refine |
| `SAJTMASKIN_ASSIST_ROUTE_MAX_DURATION_SECONDS` | 600 | Route maxDuration för prompt-assist och brief |

## Vercel-deploy

Sajtmaskin-appen måste vara deployad på Vercel för att användare ska kunna skapa
preview-URL:er, demo-URL:er och hemsidor. Lokal `npm run dev` räcker för utveckling.

1. **Deploy** denna version (sajtmaskin-appen).
2. Sätt env-variablerna i Vercel för rätt miljöer (production, preview, development).
3. `manage_env.py` kan användas för att synka och jämföra lokala vs Vercel-env.

## Lokal utveckling (setup från scratch)

1. Klona repot och kör `npm install`.
2. Skapa `.env.local` med minst: `POSTGRES_URL`, `JWT_SECRET`, `OPENAI_API_KEY`.
3. **Redis (dev):** Skapa en gratis Upstash Redis på [console.upstash.com](https://console.upstash.com), sätt `REDIS_URL`, `KV_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
4. **Postgres (dev):** Skapa ett gratis Supabase-projekt, sätt `POSTGRES_URL`.
5. Kör `npm run db:init` för att skapa databasschemat.
6. För e-post: `RESEND_API_KEY` (valfritt i dev).
7. MCP-servrar i Cursor (`.cursor/mcp.json`): `sajtmaskin-engine` och `sajtmaskin-scaffolds` körs lokalt via `npx tsx`.

## Rate limits och budgetvarningar

- **Upstash gratis:** 500K commands/månad, 256 MB. Räcker för dev och låg trafik.
- **Upstash pay-as-you-go:** $0.20 per 100K commands. Rekommenderas för prod.
- **Supabase gratis:** 500 MB databas, 2 aktiva projekt, pausar efter 1 vecka utan aktivitet.
- Om appen skalar: uppgradera Upstash till fixed plan ($10/mån = 250 MB, obegränsade commands).
