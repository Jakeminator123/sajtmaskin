# Miljövariabler

Översikt av env-variabler för lokal utveckling och Vercel-deploy.

## Hur env-filerna hänger ihop

```
config/env-policy.json          (committad, delad policy -- klassificering, targets, known-empty-ok)
        |
        +-- manage_env.py        (committad, canonical CLI för audit/status/sync)
        +-- src/lib/env-audit.ts (committad, runtime audit i appen)
        +-- src/lib/env.ts       (committad, Zod-schema med alla env-namn)

.env.local                       (gitignored, lokala dev-hemligheter)
.env.production                  (gitignored, referenskopia av prod-värden)

Vercel Environment Variables      (web UI / CLI, de riktiga prod/preview/dev-värdena)
```

Obs:
- `.vercel/.env.*.local` ska behandlas som lokala pull/export-snapshots, inte som canonical source of truth.
- De kan innehålla temporära eller development-scope:ade värden, t.ex. `VERCEL_OIDC_TOKEN`, även när filnamnet råkar säga `production`.

**Arbetsflöde vid ny env-variabel:**

1. Lägg till i `src/lib/env.ts` (Zod-schema).
2. Lägg till i `config/env-policy.json` (classification + recommendedVercelTargets).
3. Lägg till i `.env.local` med dev-värde.
4. Sätt i Vercel via web UI eller `vercel env add`.
5. Kör `python manage_env.py audit --strict` för att verifiera att allt är konsistent.
6. Uppdatera tabellerna nedan i `ENV.md` om variabeln är kritisk.

**Kontrollpanel (manage_env.py):**

```
python manage_env.py                  # interaktiv meny
python manage_env.py status           # full tabell med alla env vars
python manage_env.py add KEY          # guidad tillägg till alla ställen
python manage_env.py set KEY VALUE    # skriv värde i lokala filer
python manage_env.py push KEY         # skicka lokalt värde till Vercel
python manage_env.py push --all       # skicka alla saknade till Vercel
python manage_env.py pull             # kolla vad Vercel har som lokalt saknar
python manage_env.py audit            # read-only audit
python manage_env.py audit --strict   # flaggar även over-target/local-only-drift på Vercel
python manage_env.py reconcile         # dry-run cleanup-plan för Vercel drift
python manage_env.py reconcile --apply # utför cleanup (raderar överflödiga entries på Vercel)
```

## Lokal dev-loggning

- `SAJTMASKIN_DEV_LOG=false` stänger av den lokala dev-loggningen helt.
- `SAJTMASKIN_DEV_LOG_DOC_MAX_WORDS` styr hur mycket som sparas i den längre dokumentloggen.
- I lokal utveckling skrivs loggar till:
  - `logs/sajtmaskin-local.log`
  - `logs/sajtmaskin-local-document.txt`
- Den enkla dev-visaren finns pa `/logg` och `/log` och läser dessa filer via
  en lokal serverroute.

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

## Delade vs projektspecifika variabler

Det finns två olika nivåer av env-variabler i Sajtmaskin:

### 1. Delade app-variabler för själva Sajtmaskin

Dessa driver plattformen, buildern och infrastrukturen och delas av hela
Sajtmaskin-installationen:

- databas och cache: `POSTGRES_URL`, `REDIS_URL`, `KV_URL`, `UPSTASH_*`
- auth och sessioner: `JWT_SECRET`
- AI och buildermotor: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `V0_API_KEY`
- deploy och Vercel: `VERCEL_TOKEN`, valfritt `VERCEL_TEAM_ID`, `BLOB_READ_WRITE_TOKEN`
- interna tjänster: `OPENCLAW_*`, `INSPECTOR_*`, `RESEND_API_KEY`

De här ska hanteras som delad driftkonfiguration för plattformen, inte som
kund-/sajtdata.

### 2. Projektspecifika variabler för den genererade sajten

Detta är nycklar som den aktuella kundsajten verkar behöva utifrån sin egen kod,
t.ex.:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `STRIPE_SECRET_KEY`
- `RESEND_API_KEY`
- `OPENAI_API_KEY`
- andra koddetekterade nycklar i den aktiva versionen

Nuvarande lagring:

- v0-projekt: lagras i v0:s project env-vars
- egen motor utan riktigt v0-projekt: lagras projektspecifikt i Sajtmaskins
  `project_data.meta.projectEnvVars`

Vid publicering med egen motor skickas dessa projektspecifika variabler vidare
till Vercel-deployen, så att builderpanelen och publiceringsflödet använder samma
källa.

## Projektspecifik env-kryptering

`ENV_VAR_ENCRYPTION_KEY` styr kryptering av känsliga projektspecifika env-vars i
`project_data.meta.projectEnvVars`.

- Just nu kan nyckeln lämnas tom eller osatt tills kryptering aktiveras.
- Följande värden behandlas också som **avstängt läge**:
  `n`, `no`, `false`, `0`, `off`, `disabled`
- I avstängt läge lagras inte känsliga projektspecifika env-vars i klartext; i
  stället blockeras sådana skrivningar tills en riktig nyckel finns.
- När ni vill aktivera kryptering senare: sätt en riktig, stabil hemlighet med
  samma värde i `.env.local`, `.env.production` och Vercel-targets innan ni
  börjar spara känsliga projektspecifika env-vars.
- Byt inte nyckeln lättvindigt efter att ni har börjat använda den. Redan
  sparade värden är bundna till samma nyckel och kan annars bli oläsbara utan
  migration.

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

## AI Gateway och Blob

- `AI_GATEWAY_API_KEY` ska finnas lokalt när du kör gateway-routes via `npm run dev` eller annan icke-Vercel-miljö.
- På deployad Vercel-runtime kan samma flöden i stället autha via `VERCEL_OIDC_TOKEN`.
- `BLOB_READ_WRITE_TOKEN` behövs för blob-backed preview-media och blob-lagrad backoffice-data.
- Om `BLOB_CONTENT_KEY` och `BLOB_COLORS_KEY` lämnas osatta används env-specifika defaults: `backoffice/dev/...`, `backoffice/preview/...`, `backoffice/prod/...`.
- Om du sätter samma explicita `BLOB_CONTENT_KEY` / `BLOB_COLORS_KEY` i alla miljöer delar dev, preview och prod samma blob-paths.

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
3. `manage_env.py audit` kan anvandas for att jamfora lokala vs Vercel-env read-only.

## Lokal utveckling (setup från scratch)

1. Klona repot och kör `npm install`.
2. Skapa `.env.local` med minst: `POSTGRES_URL`, `JWT_SECRET`, `OPENAI_API_KEY`.
3. **Redis (dev):** Skapa en gratis Upstash Redis på [console.upstash.com](https://console.upstash.com), sätt `REDIS_URL`, `KV_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
4. **Postgres (dev):** Skapa ett gratis Supabase-projekt, sätt `POSTGRES_URL`.
5. Kör `npm run db:init` för att skapa databasschemat.
6. För e-post: `RESEND_API_KEY` (valfritt i dev).
7. MCP-servrar i Cursor (`.cursor/mcp.json`): `sajtmaskin-engine` och `sajtmaskin-scaffolds` körs lokalt via `npx tsx tools/mcp/...`.
8. Extern template-research:
   - `npm run references:discover` skriver kanonisk rå discovery till `research/external-templates/raw-discovery/current/`
   - `npm run template-library:import-legacy` importerar legacy `_sidor`-summary till samma plats
   - `npm run template-library:hydrate-cache` bygger lokal shallow-clone cache i `research/external-templates/repo-cache/`
   - `npm run template-library:build` bygger den kuraterade referensytan i `research/external-templates/reference-library/`
   - runtime fortsätter läsa genererade artefakter i `src/lib/gen/template-library/`

## Rate limits och budgetvarningar

- **Upstash gratis:** 500K commands/månad, 256 MB. Räcker för dev och låg trafik.
- **Upstash pay-as-you-go:** $0.20 per 100K commands. Rekommenderas för prod.
- **Supabase gratis:** 500 MB databas, 2 aktiva projekt, pausar efter 1 vecka utan aktivitet.
- Om appen skalar: uppgradera Upstash till fixed plan ($10/mån = 250 MB, obegränsade commands).
