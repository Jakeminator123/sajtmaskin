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

config/profiles/ai.defaults.ini   (valfritt: dokumenterade AI-modell- och token-defaults;
                                   skriv ut rader med `npm run config:env-print` → klistra i `.env.local`)
```

Obs:

- `.vercel/.env.*.local` ska behandlas som lokala pull/export-snapshots, inte som canonical source of truth.
- De kan innehålla temporära eller development-scope:ade värden, t.ex. `VERCEL_OIDC_TOKEN`, även när filnamnet råkar säga `production`.
- `vercel env pull` skriver en lokal env-fil och kan skriva over/ersatta innehall i `.env.local` eller annan target-fil om du pekar dit.
- `python manage_env.py pull` drar inte ner secret values; kommandot listar bara vilka nycklar som finns på Vercel men saknas lokalt.

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
python manage_env.py pull             # lista vad Vercel har som lokalt saknar (skriver inte värden)
python manage_env.py audit            # read-only audit
python manage_env.py audit --strict   # flaggar även over-target/local-only-drift på Vercel
python manage_env.py reconcile         # dry-run cleanup-plan för Vercel drift
python manage_env.py reconcile --apply # utför cleanup (raderar överflödiga entries på Vercel)
```

## Preview- och sandbox-flaggor

De här flaggorna styr nu hur buildern väljer previewyta:

| Env-variabel | Rekommenderad användning | Effekt |
|---|---|---|
| `PREVIEW` | Sätt `y` endast om du vill behålla legacy preview-rendering lokalt | När flaggan är sann används den interna `/api/preview-render`-ytan med shim-mar för snabbare, men mindre trogen, rendering |
| `SANDBOX_AUTO` | Server-side flagga för runtime-first-läge | När flaggan är sann får own-engine-flödet försöka starta riktig sandbox-runtime efter en fungerande statisk version |
| `NEXT_PUBLIC_SANDBOX_AUTO` | Valfri publik spegling av `SANDBOX_AUTO` | Klienten kan läsa den direkt, men servern skickar även motsvarande beslut i API/SSE-svaren |

Praktisk tumregel:

- `PREVIEW=y` = legacy/shim-preview.
- Utan `PREVIEW=y` = runtime-first. Buildern väntar då på sandbox/deploy-URL i stället för att låtsas att shim-previewen är samma sak som riktig Next.js-runtime.

## Modellkonfiguration

Modellkonfigurationen ar uppdelad mellan flera filer:

- `src/lib/models/catalog.ts` mappar build-profiler till konkreta build-modeller
- `src/lib/builder/defaults.ts` styr UI-defaults for `Forbattra` och `Skriv om`
- `src/lib/gen/models.ts` valjer OpenAI vs Anthropic for own-engine generation
- `src/lib/builder/gateway-policy.ts` valjer provider-klient for prompt assist

Viktig skillnad:

- `Byggmodell` valjer en intern build-profil
- `Forbattra` valjer en prompt-assist modellstrang
- `Skriv om` anvander en separat polish-modell
- `Thinking` ar en flagga, inte en egen modell

### Byggmodeller (own-engine build lane)

| Env-variabel | Default | Tier i UI | Vad den gör |
|---|---|---|---|
| `SAJTMASKIN_MODEL_FAST` | `gpt-4.1` | Snabb | Liten/billig profil for enklare sidor |
| `SAJTMASKIN_MODEL_PRO` | `gpt-5.3-codex` | Lagom | Mellanprofil med bra balans |
| `SAJTMASKIN_MODEL_MAX` | `gpt-5.4` | Tanker | Stor/dyrare profil for mer resonemang |
| `SAJTMASKIN_MODEL_CODEX` | `gpt-5.4` | Kod Max | Specialiserad kodprofil (xhigh reasoning) |
| `SAJTMASKIN_MODEL_ANTHROPIC` | `claude-opus-4.6` | Anthropic | Jamforelselage via Anthropic API |

Byggprofilerna gar genom own-engine-routes under `/api/v0/...`, men de aktiva
builder-flodena resolverar idag alltid till own engine, inte till legacy-v0-buildern.

### Prompt assist-modeller (for pre-build promptarbete)

| Env-variabel | Default | Vad den gör |
|---|---|---|
| `SAJTMASKIN_ASSIST_MODEL` | `openai/gpt-5.4` | Default for `Forbattra`, Deep Brief och dynamiska instruktioner |
| `SAJTMASKIN_POLISH_MODEL` | `openai/gpt-5.3-codex` | Default for `Skriv om` / promptpolish |

### Token-gränser

| Env-variabel | Default | Vad den styr |
|---|---|---|
| `SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS` | `128000` | Fallback när tier saknas; bygg-spåret använder **per-tier** tak (se `defaults.ts`) |
| `SAJTMASKIN_AUTOFIX_MAX_OUTPUT_TOKENS` | `32768` | Max output-tokens för autofix/LLM-fixer (lättare spår än huvudbuild) |
| `SAJTMASKIN_AUTOFIX_SYNTAX_MAX_PASSES` | `6` | Antal LLM-syntaxfix-rundor (per-fil + merged preflight); motsvarar fler iterationer mot en “dev compile”-känsla utan full `next build` |
| `SAJTMASKIN_ASSIST_MAX_OUTPUT_TOKENS` | `81920` | Max output-tokens för brief/chat assist (cappas av `AI_*_MAX_TOKENS` nedan) |
| `AI_CHAT_MAX_TOKENS` | `131072` (inbyggd default om unset) | Hård cap per request för `/api/ai/chat` |
| `AI_BRIEF_MAX_TOKENS` | `131072` (inbyggd default om unset) | Hård cap per request för `/api/ai/brief` |

Nuvarande per-tier tak i runtime (`src/lib/gen/defaults.ts`): `fast=32768`, `pro=65536`, `max=128000`, `codex=128000`, `anthropic=128000`.

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
- `Thinking` ar separat fran build-profile-ID:t och ar **på som standard** (API-validering + UI); stänger av resonemang/ext. thinking nar anvandaren kryssar ur
- OpenAI-reasoning mappas per tier när `Thinking=true`: `pro -> medium`, `max/codex -> high`, medan `fast` eller `Thinking=false` skickar ingen explicit reasoning-parameter

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
| **Postgres**           | Supabase DEV-projekt         | Supabase PROD-projekt        | Gratis (500 MB per projekt)                     |
| **Redis (cache)**      | Upstash `sajtmaskin-dev`     | Upstash `sajtmaskin-prod`    | Dev: gratis (500K cmd/mån), Prod: pay-as-you-go |
| **Redis (rate limit)** | Upstash REST (samma instans) | Upstash REST (samma instans) | Ingår i ovanstående                             |
| **Blob storage**       | Vercel Blob eller lokal fallback for vissa upload-floden | Vercel Blob | Ingår i Vercel Pro                              |
| **Deploy**             | `npm run dev`                | Vercel Pro ($20/mån)         | -                                               |

**Separation:** Dev och prod MÅSTE använda separata Redis- och Postgres-instanser.
Alla Redis-nycklar får ett beräknat miljöprefix (`dev:` / `preview:` / `prod:`)
i `src/lib/config.ts`, men separata instanser ger äkta isolering.

## Delade vs projektspecifika variabler

Det finns två olika nivåer av env-variabler i Sajtmaskin:

### 1. Delade app-variabler för själva Sajtmaskin

Dessa driver plattformen, buildern och infrastrukturen och delas av hela
Sajtmaskin-installationen:

- databas och cache: `POSTGRES_URL`, `REDIS_URL`, `UPSTASH_*` (`KV_*` bara som kompatibilitetsalias)
- auth och sessioner: `JWT_SECRET`
- AI och buildermotor: `OPENAI_API_KEY`, `AI_GATEWAY_API_KEY`, `ANTHROPIC_API_KEY`, `V0_API_KEY`
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

- **Server-/plattformsnyckel för Sajtmaskin** (samma typ som `JWT_SECRET`), inte slutanvändarens API-nycklar. Den används bara för att kryptera värden innan de lagras i er databas.
- Om nyckeln saknas (eller är avstängd) kan känsliga projektspecifika env-vars fortfarande sparas, men då utan kryptering (plaintext i lagring). UI fortsätter ändå maskera dem som känsliga.
- Följande värden behandlas också som **avstängt läge**:
  `n`, `no`, `false`, `0`, `off`, `disabled`
- I avstängt läge används alltså kompatibilitetsbeteende: sparning tillåts men kryptering hoppas över.
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
| `OPENAI_API_KEY`      | .env.local | production, preview | Own engine (krävs alltid för kodgenerering)                             |
| `V0_API_KEY`          | .env.local | production, preview | v0 Platform API — legacy mall/registry-operationer och v0-baserad prompt assist. Inte för kodgenerering. |
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

- `AI_GATEWAY_API_KEY` ska finnas lokalt när du kör gateway-class prompt-assist-routes via `npm run dev` eller annan icke-Vercel-miljö.
- På deployad Vercel-runtime kan samma flöden i stället autha via `VERCEL_OIDC_TOKEN`.
- Viktig nuvarande detalj: OpenAI-gateway-klassen fortsatter krava `AI_GATEWAY_API_KEY` eller `VERCEL_OIDC_TOKEN` lokalt, medan Anthropic-sparet nu kan koras direkt via `ANTHROPIC_API_KEY` for ren jamforelse.
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
| `SAJTMASKIN_MODEL_CODEX`                       | `gpt-5.4`           | Modell för Codex Max-tier (xhigh reasoning)   |
| `SAJTMASKIN_MODEL_ANTHROPIC`                   | `claude-opus-4.6`   | Modell för Anthropic-jämförelseläge           |
| `SAJTMASKIN_ASSIST_MODEL`                      | `openai/gpt-5.4`    | Default prompt-assistmodell for `Forbattra`   |
| `SAJTMASKIN_POLISH_MODEL`                      | `openai/gpt-5.3-codex` | Standard-polishmodell for `Skriv om` (Anthropic-lane overrider den i jamforelselaget) |
| `SAJTMASKIN_BRIEF_EXPAND_MAX_USER_CHARS`       | 360                 | Max längd på användarmeddelande (efter orchestration) for server-side brief-expansion |
| `SAJTMASKIN_BRIEF_EXPAND_MIN_BRIEF_SIGNAL_CHARS` | 48                | Minsta "signal" i `meta.brief` (summa stränglängder) innan expansion körs |
| `SAJTMASKIN_CLARIFICATION_CAP_MODEL`           | `gpt-5.2`         | Egen-modell efter max antal kontraktsförtydliganden (7) innan full build |
| `SAJTMASKIN_CLARIFICATION_CAP_OUTPUT_FRACTION` | `0.45`            | Andel av tier-tak för max-output vid cap-build (≈ halva budgeten) |
| `SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS`          | 128000              | Fallback + env-override; tier använder egna tak |
| `SAJTMASKIN_AUTOFIX_MAX_OUTPUT_TOKENS`         | 32768               | Autofix-pipeline                              |
| `SAJTMASKIN_AUTOFIX_SYNTAX_MAX_PASSES`         | 6                   | Autofix-syntaxiterationer (per-fil + preflight) |
| `SAJTMASKIN_ASSIST_MAX_OUTPUT_TOKENS`          | 81920               | Assist/brief/chat default innan route-cap     |
| `SAJTMASKIN_STREAM_SAFETY_TIMEOUT_MS`          | 720000 (12 min)     | Klient-timeout innan stream avbryts           |
| `SAJTMASKIN_ENGINE_ROUTE_MAX_DURATION_SECONDS` | 800                 | Route maxDuration för build/refine            |
| `SAJTMASKIN_ASSIST_ROUTE_MAX_DURATION_SECONDS` | 600                 | Route maxDuration för prompt-assist och brief |

## Vercel-deploy

Sajtmaskin-appen måste vara deployad på Vercel för att användare ska kunna skapa
preview-URL:er, demo-URL:er och hemsidor. Lokal `npm run dev` räcker för utveckling.

1. **Deploy** denna version (sajtmaskin-appen).
2. Sätt env-variablerna i Vercel för rätt miljöer (production, preview, development).
3. `manage_env.py audit` kan anvandas for att jamfora lokala vs Vercel-env read-only.

## Lokal utveckling (setup från scratch)

Rekommenderad Node-version lokalt ar `22.14.0` (samma baseline som
`package.json`, Volta, `.nvmrc` och `.node-version`).

Om en git-hook eller agent-shell klagar pa `npx: command not found` beror det
oftast pa att shellen inte har laddat samma PATH/Volta-miljo som din vanliga
terminal. Verifiera da manuellt med `npm run typecheck` innan push och kor
sedan om kommandot i en shell dar Node/Volta ar tillgangligt.

1. Klona repot och kör `npm install`.
2. Skapa `.env.local` med minst: `POSTGRES_URL`, `JWT_SECRET`, `OPENAI_API_KEY`.
3. **Redis (dev):** Skapa en gratis Upstash Redis på [console.upstash.com](https://console.upstash.com), sätt `REDIS_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. `KV_URL` och `KV_REST_API_*` är bara kompatibilitetsalias.
4. **Postgres (dev):** Skapa ett gratis Supabase-projekt, sätt `POSTGRES_URL`.
5. Kör `npm run db:init` för att skapa databasschemat.
6. För e-post: `RESEND_API_KEY` (valfritt i dev).
7. MCP-servrar i Cursor (`.cursor/mcp.json`): `sajtmaskin-engine` och `sajtmaskin-scaffolds` körs lokalt via `npx tsx tools/mcp/...`.
8. Mallreferenser i own engine: runtime läser valfria JSON-stubbar under `src/lib/gen/template-library/` (kan vara tomma medan ni kuraterar om). Kör `npm run verify:generated-paths` efter ändringar.

## Keep / legacy / remove later

### Keep (canonical today)

- `POSTGRES_URL` — kanonisk databas-URL för lokal dev, `npm run db:init`, Drizzle och normal runtime.
- `REDIS_URL` — kanonisk Redis-URL för ioredis-cache.
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — kanoniska REST-variabler för rate limits och andra Upstash-baserade flöden.
- `OPENAI_API_KEY` — primär own-engine-provider för build/refine.
- `ANTHROPIC_API_KEY` — aktiv bara när Anthropic-lane eller Anthropic prompt-assist används.
- `V0_API_KEY` — fortfarande live för kvarvarande legacy `v0`-rutter och v0-baserade hjälpspår. Inte för own-engine-kodgenerering.

### Legacy compatibility (do not use for new setup)

- `POSTGRES_PRISMA_URL` — legacy fallback; läses fortfarande av runtime och migrationsscript, men ska inte vara förstahandsval lokalt.
- `POSTGRES_URL_NON_POOLING` — legacy fallback för direktanslutning; stöds fortfarande men är inte kanonisk lokal setup.
- `KV_URL` — Vercel/Upstash-alias för Redis cache; används bara om `REDIS_URL` saknas.
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` — Vercel/Upstash-alias för REST-klienten; används bara om `UPSTASH_REDIS_REST_*` saknas.
- `VERCEL_OIDC_TOKEN` — praktisk lokal snapshot-token för vissa gateway/Vercel-flöden, men inte en långsiktig canonical env för vanlig lokal setup.

### Remove later / deprecated

- `DESIGN_SYSTEM_ID` — deprecated v0-env. Own engine använder `designTheme`; denna env-variabel har ingen aktiv roll i own-engine-runtime och ligger inte längre i runtime-schemat.
- `V0_STREAMING_ENABLED` — deprecated v0-only flagga. Behåll bara tills kvarvarande `v0-generator`-kod är borta.
- `V0_FALLBACK_BUILDER` — legacy no-op i dagens runtime. Dokumenteras av historiska skäl men läses inte av aktiv runtime-kod.

## Deprecated / removal candidates (v0 soft-deprecation Phase 3)

Följande env-variabler tillhör v0-fallback-lagret och har ingen effekt på
own-engine-flödet. De tas bort när v0-fallback-koden avvecklas helt
(se `docs/architecture/v0-soft-deprecation.md`).

| Variabel | Varför deprecated | Ersätts av |
|---|---|---|
| `DESIGN_SYSTEM_ID` | v0-registrybaserat designsystem; own engine använder `designTheme` (klientval i localStorage, injicerat som OKLCh-preset i systemprompten) | Inget env — `designTheme` väljs i UI |
| `V0_STREAMING_ENABLED` | Styrde om v0-fallback streamade; own engine streamar alltid | Inget — borttagning |
| `V0_FALLBACK_BUILDER` | Historisk fallback-switch; aktiv runtime läser den inte längre | Inget — own engine är default |

`V0_API_KEY` behövs fortfarande för legacy registry/template-operationer
(`init-registry`, `init`) men inte för kodgenerering. Kan tas bort när de
routerna ersätts.

## Databasmodell (kort referens)

Schemat (`src/lib/db/schema.ts`) har två parallella tabellhierarkier:

| Tabeller | Ägarskap | Status |
|---|---|---|
| `engine_chats`, `engine_messages`, `engine_versions`, `engine_generation_logs`, `engine_version_error_logs`, `generation_telemetry`, `version_comments`, `version_approvals` | **Own engine** (aktiv kodsökväg) | Aktiv |
| `projects`, `chats`, `versions`, `version_error_logs`, `deployments` | **v0-proxy** (legacy, bär `v0_*`-kolumner) | Vestigial — tas bort med v0-fallback |
| `app_projects`, `project_data`, `project_files`, `images`, `media_library`, `prompt_handoffs`, `prompt_logs`, `company_profiles` | **App-lager** (projekt, media, intake) | Aktiv |
| `users`, `user_integrations`, `transactions`, `guest_usage` | **Auth & billing** | Aktiv |
| `template_cache`, `registry_cache`, `page_views`, `user_audits`, `kostnadsfri_pages`, `domain_orders` | **Diverse features** | Aktiv |

Repository (`src/lib/db/chat-repository-pg.ts`) använder uteslutande `engine_*`-tabellerna.
V0-proxytabellerna nås bara via `src/lib/tenant.ts` och ett fåtal v0-specifika routes.

## Rate limits och budgetvarningar

- **Upstash gratis:** 500K commands/månad, 256 MB. Räcker för dev och låg trafik.
- **Upstash pay-as-you-go:** $0.20 per 100K commands. Rekommenderas för prod.
- **Supabase gratis:** 500 MB databas, 2 aktiva projekt, pausar efter 1 vecka utan aktivitet.
- Om appen skalar: uppgradera Upstash till fixed plan ($10/mån = 250 MB, obegränsade commands).
