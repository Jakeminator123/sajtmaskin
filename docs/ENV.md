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

## Ordlista: Node, Next, «Nix» och datalagring

- **Node.js** är JavaScript-runtimen som kör Sajtmaskin och den genererade Next-appen (lokalt och i Vercel Sandbox, t.ex. `node24`).
- **Next.js** är ramverket för App Router-projekt som buildern genererar.
- **«Nix»** som ibland syns i Vercel-sammanhang (t.ex. Nixpacks) är en **byggcontainer** på Vercels plattform — inte en separat integration i Sajtmaskin. Din sajt byggs fortfarande som **Node + Next**.
- **Chattar, versioner och `files_json`** lagras i **Postgres** (t.ex. via Supabase om `POSTGRES_URL` pekar dit). Det finns ingen parallell «projektkatalog på disken» för samma data i appen; lokalt finns bara cache (`.next`, osv.).

## Två världar: Sajtmaskin-appen vs genererad sajt i sandbox

| Område | Vad det är | Typiska variabler |
|--------|------------|-------------------|
| **Sajtmaskin (monorepot)** | Buildern, API-routes, Postgres, egna integrationer | `POSTGRES_URL`, `OPENAI_API_KEY`, `VERCEL_*` för **denna** deploy, m.fl. — se tabellerna nedan i denna fil och `src/lib/env.ts`. |
| **Genererad användarsajt i Vercel Sandbox** | Tillfällig Next-app som **builder** startar med användarens kod; **inte** samma process som Sajtmaskin | Autentisering mot Vercel för **Sandbox API**: `VERCEL_OIDC_TOKEN` (rekommenderat efter `vercel link` + `vercel env pull`) **eller** `VERCEL_TOKEN` + `VERCEL_TEAM_ID` / `VERCEL_ORG_ID` + `VERCEL_PROJECT_ID`. **Preview-läge i sandbox:** `SAJTMASKIN_SANDBOX_PREVIEW_MODE` (`dev_only` default, `dev_then_build`, `build_only`) — styr om `npm run build` körs i sandlådan efter dev. **Innehåll i den genererade appen:** sammanslagen `.env.local` från placeholders + `project_data.meta.projectEnvVars` (se `src/lib/gen/build-generated-site-env.ts`); det är **inte** samma som att lägga nycklar bara i Sajtmaskins `.env.local`. |

Mer om demoUrl, shim och sandbox: [`docs/architecture/preview-and-sandbox-flow.md`](./architecture/preview-and-sandbox-flow.md) och [`docs/architecture/preview-fidelity-tiers.md`](./architecture/preview-fidelity-tiers.md).

## Klient-autofix (builder)

- **Autofix vid fel** (quality gate / preview) är **på som standard**. Stäng av under **Settings** (kugghjul) i buildern, eller sätt `localStorage`-nyckeln `sajtmaskin:autofix-enabled` till `"false"`. URL-parametrarna `?noautofix` och `?autofix` kan användas för tillfällig override.

## Modellkonfiguration

Modellkonfigurationen är uppdelad mellan flera filer:

- `src/lib/models/catalog.ts` mappar build-profiler till konkreta build-modeller
- `src/lib/builder/defaults.ts` styr UI-defaults för `Förbättra` och `Skriv om`
- `src/lib/gen/models.ts` väljer OpenAI vs Anthropic för own-engine generation
- `src/lib/builder/gateway-policy.ts` väljer provider-klient för prompt assist

Viktig skillnad:

- `Byggmodell` väljer en intern build-profil
- `Förbättra` väljer en prompt-assist-modellsträng
- `Skriv om` använder en separat polish-modell
- `Thinking` är en flagga, inte en egen modell

### Byggmodeller (own-engine build lane)

| Env-variabel | Default | Tier i UI | Vad den gör |
|---|---|---|---|
| `SAJTMASKIN_MODEL_FAST` | `gpt-4.1` | Snabb | Liten/billig profil for enklare sidor |
| `SAJTMASKIN_MODEL_PRO` | `gpt-5.3-codex` | Lagom | Mellanprofil med bra balans |
| `SAJTMASKIN_MODEL_MAX` | `gpt-5.4` | Tanker | Stor/dyrare profil for mer resonemang |
| `SAJTMASKIN_MODEL_CODEX` | `gpt-5.1-codex-max` | Kod Max | Specialiserad kodprofil |
| `SAJTMASKIN_MODEL_ANTHROPIC` | `claude-sonnet-4.6` | Anthropic | Jämförelseläge via Anthropic API |

Byggprofilerna går genom own-engine-routes under `/api/v0/...`, men de aktiva
builder-flödena resolverar idag alltid till own engine, inte till legacy-v0-buildern.

### Prompt assist-modeller (för promptarbete före build)

| Env-variabel | Default | Vad den gör |
|---|---|---|
| `SAJTMASKIN_ASSIST_MODEL` | `openai/gpt-5.4` | Default för `Förbättra`, Deep Brief och dynamiska instruktioner |
| `SAJTMASKIN_POLISH_MODEL` | `openai/gpt-5.3-codex` | Default för `Skriv om` / promptpolish |

### Token-gränser

| Env-variabel | Default | Vad den styr |
|---|---|---|
| `SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS` | `32768` | Max output-tokens för kodgenerering |
| `SAJTMASKIN_AUTOFIX_MAX_OUTPUT_TOKENS` | `12288` | Max output-tokens för autofix/LLM-fixer |
| `SAJTMASKIN_ASSIST_MAX_OUTPUT_TOKENS` | `32768` | Max output-tokens för brief/chat assist (deep brief JSON kan vara långt; sänk om du vill spara kostnad) |

### Hur modellerna hänger ihop

```
Användaren väljer tier i UI (Snabb / Lagom / Tanker / Kod Max / Anthropic)
        │
        ├─► Ny build / refine
        │   └─► resolveModelSelection() -> resolveEngineModelId(..., false)
        │       └─► own engine -> OpenAI eller Anthropic beroende pa resolved model
        │
        ├─► Forbattra (SAJTMASKIN_ASSIST_MODEL)
        │   ├─► shallow rewrite/polish -> /api/ai/chat
        │   └─► deep brief -> /api/ai/brief
        │
        └─► Skriv om (SAJTMASKIN_POLISH_MODEL)
            └─► textpolish via /api/ai/chat
```

Observera:

- `/api/ai/spec` finns, men ligger inte i normal builder-kedja i dag
- UI-labels som `Tanker` kan fortfarande drifta fran faktisk provider om `SAJTMASKIN_MODEL_*` overridas
- `Thinking` ar separat och andrar inte build-profile-ID:t

### Overlay-hjalpare for modellspårning

Den fokuserade hjalparen i repo-roten:

```
python model_trace_overlay.py status
python model_trace_overlay.py apply
python model_trace_overlay.py launch
```

Den synkar de GUI-relaterade modell-env-varen i `.env.local` och oppnar
builder-overlayn pa `?modelTrace=1`.

## Lokal dev-loggning

- `SAJTMASKIN_DEV_LOG=false` stänger av den lokala dev-loggningen helt.
- `SAJTMASKIN_DEV_LOG_DOC_MAX_WORDS` styr hur mycket som sparas i den längre dokumentloggen.
- I lokal utveckling skrivs loggar till:
  - `logs/sajtmaskin-local.log`
  - `logs/sajtmaskin-local-document.txt`
- Den enkla dev-visaren finns pa `/logg` och `/log` och läser dessa filer via
  en lokal serverroute.

## Infrastruktur-topologi

| Tjänst                 | Dev (lokalt)                 | Prod (Vercel)                | Plan                                            |
| ---------------------- | ---------------------------- | ---------------------------- | ----------------------------------------------- |
| **Postgres**           | Supabase DEV-projekt         | Supabase PROD-projekt        | Betald plan rekommenderas i prod (t.ex. Supabase Pro ~25 USD/mån — exakt SKU i dashboard) |
| **Redis (cache)**      | Upstash `sajtmaskin-dev`     | Upstash `sajtmaskin-prod`    | Dev: gratis (500K cmd/mån), Prod: pay-as-you-go |
| **Redis (rate limit)** | Upstash REST (samma instans) | Upstash REST (samma instans) | Ingår i ovanstående                             |
| **Blob storage**       | Vercel Blob eller lokal fallback for vissa upload-floden | Vercel Blob | Ingår i Vercel Pro                              |
| **Deploy**             | `npm run dev`                | Vercel Pro ($20/mån)         | -                                               |

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
- AI och buildermotor: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (direktanrop till OpenAI/Anthropic för egen motor och prompt assist via `createDirectModel`); `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN` kan fortfarande krävas av **andra** routes (t.ex. vissa audit-/admin-flöden) — sök i kod efter `AI_GATEWAY`; `V0_API_KEY` för v0 SDK (mallar, registry, zip, m.m.) — **inte** för prompt assist; valfri `V0_FALLBACK_BUILDER` styr **endast** om byggaren ska föredra v0-hostad preview (`*.vusercontent.net`) framför sandbox när båda finns — **inte** kodgenerering (egen motor alltid för stream-pipelinen)
- deploy och Vercel: `VERCEL_TOKEN`, valfritt `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`, `BLOB_READ_WRITE_TOKEN`; full Next-preview i sandbox: se [architecture/vercel-sandbox-credentials.md](./architecture/vercel-sandbox-credentials.md) och [architecture/preview-and-sandbox-flow.md](./architecture/preview-and-sandbox-flow.md)
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

| Variabel              | Lokalt     | Vercel              | Beskrivning                                                             |
| --------------------- | ---------- | ------------------- | ----------------------------------------------------------------------- |
| `POSTGRES_URL`        | .env.local | production, preview | Primär databas (Supabase)                                               |
| `JWT_SECRET`          | .env.local | production, preview | Auth-tokens                                                             |
| `OPENAI_API_KEY`      | .env.local | production, preview | Egen motor (builder-codegen) och prompt-assist OpenAI-modeller (`openai/gpt-5.*`) |
| `V0_API_KEY`          | .env.local | production, preview | v0 SDK: mallar, registry, zip, m.m. (prompt assist använder OpenAI/Anthropic direkt). Inte kopplat till `V0_FALLBACK_BUILDER` |
| `V0_FALLBACK_BUILDER` | .env.local | development (typiskt) | **Av** som standard. Sätt `y` / `yes` / `true` / `1` / `on` för att föredra v0-hostad `demoUrl` i preview när den finns. Värden som `n`, `no`, `false`, tomt → av. Påverkar inte codegen. Vid build kopieras värdet till `NEXT_PUBLIC_V0_BUILDER_PREVIEW_FALLBACK` (se `next.config.ts`). |
| `NEXT_PUBLIC_APP_URL` | .env.local | production, preview | Appens publika URL (t.ex. https://sajtmaskin.se)                        |

## D-ID avatar-test (`/avatar`)

Den isolerade test-routen `/avatar` använder två publika klientvariabler:

| Variabel                        | Lokalt     | Vercel              | Beskrivning                               |
| ------------------------------- | ---------- | ------------------- | ----------------------------------------- |
| `NEXT_PUBLIC_AVATAR_AGENT_ID`   | .env.local | production, preview | D-ID agent-id för testavataren            |
| `NEXT_PUBLIC_AVATAR_CLIENT_KEY` | .env.local | production, preview | D-ID client key för embedden på `/avatar` |

Viktigt:

- Eftersom värdena läses i klientkod måste de börja med `NEXT_PUBLIC_`.
- Ändra gärna våra egna env-namn, men håll koden och env-namnen synkade.
- D-ID:s egna embed-attribut måste däremot heta exakt `data-client-key`, `data-agent-id` och i `full` mode även `data-target-id`.
- Lägg minst `http://localhost:3000` och `https://sajtmaskin.vercel.app` i D-ID:s `allowed_domains` för den client key som används här.
- Efter ändring av `NEXT_PUBLIC_*` i Vercel måste appen deployas om för att klienten ska få nya värden.

## Redis-variabler

Projektet har flera Redis-variabelnamn pga Vercel/Upstash-integrationer som
skapar alias automatiskt. Hierarkin:

| Variabel                   | Syfte                        | Beskrivning                                         | Prioritet |
| -------------------------- | ---------------------------- | --------------------------------------------------- | --------- |
| `REDIS_URL`                | ioredis cache (primary)      | `rediss://...` URL till Upstash Redis               | Används först |
| `KV_URL`                   | ioredis cache (fallback)     | Samma format, Vercel KV-alias, används om `REDIS_URL` saknas | Fallback |
| `UPSTASH_REDIS_REST_URL`   | Rate limiting (primary)      | `https://...upstash.io` REST-endpoint               | Används först |
| `UPSTASH_REDIS_REST_TOKEN` | Rate limiting (primary)      | Auth-token för REST-klienten                        | Används först |
| `KV_REST_API_URL`          | Rate limiting (fallback)     | Vercel KV-alias, används om `UPSTASH_REDIS_REST_URL` saknas | Fallback |
| `KV_REST_API_TOKEN`        | Rate limiting (fallback)     | Vercel KV-alias, används om `UPSTASH_REDIS_REST_TOKEN` saknas | Fallback |

Alla alias pekar till samma Upstash Redis. Om du konfigurerar Redis manuellt
räcker `REDIS_URL` + `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
De `KV_*`-alias skapas automatiskt av Vercels Upstash-integration.

Utan Redis faller rate limiting tillbaka till in-memory (opålitligt i serverless).
Utan Redis fungerar appen men utan caching -- alla requests går direkt till Postgres.

## E-post och korrespondens

| Variabel         | Beskrivning                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY` | Resend — kontaktformulär (`/api/contact`), e-postverifiering vid registrering, återställ lösenord. Utan denna: formulär fungerar men mail skickas inte. |
| `EMAIL_FROM`     | Avsändaradress (default: Sajtmaskin &lt;noreply@sajtmaskin.se&gt;)                                                                                      |

Utan `RESEND_API_KEY` fungerar appen, men användare får inga verifieringsmail och kontaktformuläret loggar bara meddelanden i stället för att skicka.

## Bilder (Unsplash)

| Variabel              | Beskrivning                                                 |
| --------------------- | ----------------------------------------------------------- |
| `UNSPLASH_ACCESS_KEY` | Unsplash API-nyckel. Demo: 50 req/h, Production: 5000 req/h |

Bildflöde i generering:

1. Motorn genererar `/placeholder.svg?text=...` i koden
2. `image-materializer.ts` ersätter placeholders med riktiga Unsplash-bilder + triggar download-tracking
3. `image-validator.ts` HEAD-kollar alla bild-URL:er efter generering och ersätter trasiga
4. Materializer:ns nyligen lösta URL:er skickas som skip-set till validatorn (undviker dubbla anrop)

## AI Gateway och Blob

- Prompt-assist med **OpenAI-modeller** (`openai/gpt-5.*` i assist-listan) använder **`OPENAI_API_KEY`** direkt (`/api/ai/chat` + `createDirectModel`), inte Vercel AI Gateway.
- `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN` används fortfarande av **vissa andra** routes (sök efter `AI_GATEWAY_API_KEY` i kodbasen), t.ex. delar av audit/admin där gateway fortfarande är kopplad.
- `BLOB_READ_WRITE_TOKEN` behåller `@vercel/blob` som default provider och behövs för blob-backed preview-media och blob-lagrad backoffice-data.
- Om `BLOB_READ_WRITE_TOKEN` saknas lokalt faller användaruppladdningar via `src/lib/vercel/blob-service.ts` tillbaka till lokal filsystemslagring under `data/uploads/`, serverad via `/api/uploads/media/...`.
- Bildmaterialisering och annan funktion som uttryckligen behöver publik blob-URL fortsätter att kräva Blob-token och faller annars tillbaka till externa URL:er eller lokal JSON-lagring beroende på flöde.
- Om `BLOB_CONTENT_KEY` och `BLOB_COLORS_KEY` lämnas osatta används env-specifika defaults: `backoffice/dev/...`, `backoffice/preview/...`, `backoffice/prod/...`.
- Om du sätter samma explicita `BLOB_CONTENT_KEY` / `BLOB_COLORS_KEY` i alla miljöer delar dev, preview och prod samma blob-paths.

## Own engine (standardläge)

| Variabel                                       | Default             | Beskrivning                                   |
| ---------------------------------------------- | ------------------- | --------------------------------------------- |
| `SAJTMASKIN_MODEL_FAST`                        | `gpt-4.1`           | Modell för Fast-tier                          |
| `SAJTMASKIN_MODEL_PRO`                         | `gpt-5.3-codex`     | Modell för Pro-tier (rekommenderad)           |
| `SAJTMASKIN_MODEL_MAX`                         | `gpt-5.4`           | Modell för Max-tier                           |
| `SAJTMASKIN_MODEL_CODEX`                       | `gpt-5.1-codex-max` | Modell för Codex Max-tier                     |
| `SAJTMASKIN_MODEL_ANTHROPIC`                   | `claude-sonnet-4.6` | Modell för Anthropic-jämförelseläge           |
| `SAJTMASKIN_ASSIST_MODEL`                      | `openai/gpt-5.4`    | Default prompt-assistmodell for `Forbattra`   |
| `SAJTMASKIN_POLISH_MODEL`                      | `openai/gpt-5.3-codex` | Standard-polishmodell for `Skriv om` (Anthropic-lane overrider den i jamforelselaget) |
| `SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS`          | 32768               | Max output-tokens för sidgenerering           |
| `SAJTMASKIN_AUTOFIX_MAX_OUTPUT_TOKENS`         | 12288               | Autofix-pipeline                              |
| `SAJTMASKIN_STREAM_SAFETY_TIMEOUT_MS`          | 720000 (12 min)     | Klient-timeout innan stream avbryts           |
| `SAJTMASKIN_ENGINE_ROUTE_MAX_DURATION_SECONDS` | 800                 | Route maxDuration för build/refine            |
| `SAJTMASKIN_ASSIST_ROUTE_MAX_DURATION_SECONDS` | 600                 | Route maxDuration för prompt-assist och brief |

## Vercel-deploy

Sajtmaskin-appen måste vara deployad på Vercel för att användare ska kunna skapa
preview-URL:er, demo-URL:er och hemsidor. Lokal `npm run dev` räcker för utveckling.

1. **Deploy** denna version (sajtmaskin-appen).
2. Sätt env-variablerna i Vercel för rätt miljöer (production, preview, development).
3. `manage_env.py audit` kan användas för att jämföra lokala filer med Vercel (kräver `VERCEL_TOKEN` m.m. utan `--local-only`).
4. **Jämför `.env.local` med en Vercel-pullad produktionsfil** (read-only, inga API-anrop):

   ```bash
   python manage_env.py audit --local-only --strict --env-prod ".env.vercel.production.pulled"
   ```

   Standard för “prod”-sidan av audit är `.env.production`; använd `--env-prod` när du i stället har `vercel env pull` till ett annat filnamn.

## Lokal utveckling (setup från scratch)

Rekommenderad Node-version lokalt ar `22.14.0` (samma baseline som
`package.json`, Volta, `.nvmrc` och `.node-version`).

Om en git-hook eller agent-shell klagar pa `npx: command not found` beror det
oftast pa att shellen inte har laddat samma PATH/Volta-miljo som din vanliga
terminal. Verifiera da manuellt med `npm run typecheck` innan push och kor
sedan om kommandot i en shell dar Node/Volta ar tillgangligt.

1. Klona repot och kör `npm install`.
2. Skapa `.env.local` med minst: `POSTGRES_URL`, `JWT_SECRET`, `OPENAI_API_KEY`.
3. **Redis (dev):** Skapa en gratis Upstash Redis på [console.upstash.com](https://console.upstash.com), sätt `REDIS_URL`, `KV_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
4. **Postgres (dev):** Skapa ett Supabase-projekt (gratis tier går för lokal dev), sätt `POSTGRES_URL`. Produktion använder separat projekt; vid högre krav använd betald Supabase-plan (se infrastruktur-tabellen ovan).
5. Kör `npm run db:init` för att skapa databasschemat.
6. För e-post: `RESEND_API_KEY` (valfritt i dev).
7. MCP-servrar i Cursor: kopiera **`.cursor/mcp.json.example` → `.cursor/mcp.json`** (själva `mcp.json` är gitignorerad så hemligheter inte pushas). `sajtmaskin-engine` och `sajtmaskin-scaffolds` körs lokalt via `npx tsx tools/mcp/...`.
8. Extern template-research:
   - `npm run references:discover` skriver kanonisk rå discovery till `research/external-templates/raw-discovery/current/` — Playwright-specen är **`e2e/vercel-templates/scrape-catalog.spec.ts`** (spårad). Kräver Playwright + nät. Se [`docs/architecture/vercel-templates-discovery.md`](architecture/vercel-templates-discovery.md) och [`vercel-templates-playwright-scaffold-integration.txt`](architecture/vercel-templates-playwright-scaffold-integration.txt).
   - `npm run template-library:import-legacy` importerar legacy `_sidor`-summary till samma plats
   - `npm run template-library:hydrate-cache` bygger lokal shallow-clone cache i `research/external-templates/repo-cache/`
   - `npm run template-library:build` bygger den kuraterade referensytan i `research/external-templates/reference-library/`
   - runtime fortsätter läsa genererade artefakter i `src/lib/gen/template-library/`

## Filer som aldrig committas

- **`.env.local`**, **`.env.production`**, **`.env.*.local`**, **`.env.vercel.production.pulled`** m.fl. är **gitignorade**. De ska **inte** pushas till GitHub.
- **`.cursor/mcp.json`** — gitignorerad; använd **`.cursor/mcp.json.example`** som mall (se `.cursor/README.md`).
- **`pot_buggs/`** — lokala anteckningar; ska inte finnas på GitHub (se `.gitignore`).
- **Vercel:** använd **Vercel Dashboard → Environment Variables** eller `vercel env add` / `manage_env.py push` för att sätta värden per miljö (production / preview / development).
- **Radbrytningar:** håll env-filer som **UTF-8 med LF** (Unix-radbrytning). Undvik `\r\n` i värden; PowerShell `Set-Content` utan rätt encoding kan ge **BOM** eller **CRLF** som saboterar hemligheter (se projektregeln om `WriteAllText` med UTF-8 utan BOM).

## Genererade sajter — preview / degraded env (referens)

- **`config/ai_models/40-generated-site-integration-placeholders.env.txt`** är den **kanoniska** dotenv-liknande listan (KEY=value) för icke-hemliga placeholders när en **användares** genererade Next-projekt ska byggas eller startas utan riktiga integrationer. Den indexeras från **`config/ai_models/manifest.json`** (`generatedSiteIntegrationPlaceholders`) och kan läsas i Node via `src/lib/ai-models/load-generated-site-placeholders.ts`. Sajtmaskin injicerar den **inte** automatiskt i preview ännu; använd manuellt, i scripts eller framtida pipeline.
- **`config/user_degraded_env.txt`** beskriver **policy och motivering** (samma målgrupp som ovan); den duplicerar inte längre alla nycklar.

### Sajtmaskin-appen vs genererade användarsajter (tre lager)

| Lager | Var | Syfte |
|-------|-----|--------|
| **`config/env-policy.json`** | Sajtmaskin (denna repo) | Klassificering och regler för **appens** miljövariabler; styr `manage_env.py` / `env-audit`. |
| **`.env.local` / Vercel Dashboard** | Sajtmaskin | Riktiga hemligheter för **plattformen** (DB, OpenAI, Stripe för credits, osv.). |
| **`config/ai_models/` + `user_degraded_env.txt`** | Dokumentation / fragment | **Inte** samma som env-policy: avser **kod som genereras till slutkunder**. Placeholder-nycklar ligger i `40-generated-site-integration-placeholders.env.txt`. **Auto-injicering** i preview/deploy-pipeline är valfri produktutveckling. |

Tomma **`VERCEL_*` / `VERCEL_GIT_*`** i en pullad `.env.vercel.production.pulled` är normalt (byggmetadata finns bara under deployment). De finns i `knownEmptyOk` i `env-policy.json` så audit inte flaggar dem.

## Extern template-spegel — versionsaudit

- **`config/shadcn-mirror-audit-policy.json`** — målstack (Next / React / Tailwind / Node-major) jämfört med t.ex. `_template_refs/shadcn-io-mirror/repos`.
- **`npm run mirror:audit`** — kort sammanfattning.
- **`npm run mirror:audit:verbose`** — full tabell per repo.
- **`npm run mirror:audit:json`** — maskinläsbar rapport.
- Standard sökväg: syskonmapp `../_template_refs/shadcn-io-mirror/repos` eller miljövariabel **`SHADCN_MIRROR_REPOS`**.

## Rate limits och budgetvarningar

- **Upstash gratis:** 500K commands/månad, 256 MB. Räcker för dev och låg trafik.
- **Upstash pay-as-you-go:** $0.20 per 100K commands. Rekommenderas för prod.
- **Supabase (gratis tier, referens):** bl.a. 500 MB databas, begränsningar enligt aktuell prissida — lämpligt för dev/små test. **Produktion:** uppgraderat läge (t.ex. Pro ~25 USD/mån) ger mer utrymme, bättre SLA och inga hobby-pausregler; verifiera alltid mot [Supabase pricing](https://supabase.com/pricing).
- Om appen skalar: uppgradera Upstash till fixed plan ($10/mån = 250 MB, obegränsade commands).
