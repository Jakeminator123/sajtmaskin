# Miljövariabler (kort översikt)

**Den här filen är inte “source of truth”.** Den ska bara hjälpa människor att snabbt förstå *vad som krävs*, *vad som är valfritt*, och *var sanningen finns i kod*.

**Viktigt:** `.env.local` i **repo-roten** gäller **Sajtmaskin-appen**. En **annan** `.env.local` finns i **användarens genererade Next-projekt** (sandbox / export) — se avsnitt *Genererade användarsajter* och [`.cursor/rules/terminology.mdc`](../.cursor/rules/terminology.mdc) § Env. Rotens `.env*` är ofta gitignorerad **och** borttagen från Cursor-index (`.cursorignore`); agenter ser dem inte om du inte öppnar dem explicit.

| Källa | Roll |
|--------|------|
| [`src/lib/env.ts`](../src/lib/env.ts) | Alla namn som appen faktiskt läser (Zod `serverSchema`). |
| [`config/env-policy.json`](../config/env-policy.json) | Klassificering per nyckel (`shared_runtime`, `optional_runtime`, `vercel_managed`, …), rekommenderade Vercel-miljöer, `knownEmptyOk`, m.m. |
| [`scripts/env/manage_env.py`](../scripts/env/manage_env.py) | Kanonisk env-CLI för audit / status / sync mot lokala filer och Vercel. |

**Djupare ämnesdokument** (lägg inte in backlog eller långa tabeller här):

- Preview / sandbox / credentials: [`architecture/preview-deploy.md`](./architecture/preview-deploy.md)
- Modeller / assist / builder-generering: [`architecture/builder-generation.md`](./architecture/builder-generation.md), `src/lib/models/catalog.ts`
- Historisk nyckeljämförelse (utan hemligheter): [`development/env-comparison-notes.md`](./development/env-comparison-notes.md)

---

## Måste i praktiken (normal drift)

Utan dessa brukar kärnan inte vara användbar i **preview + production**:

| Variabel | Kommentar |
|----------|-----------|
| `POSTGRES_URL` | Postgres (t.ex. Supabase). Lokalt ska `.env.local` peka på separat dev/staging-target, inte samma target som production. |
| `JWT_SECRET` | Session / auth. |
| `OPENAI_API_KEY` | Own-engine codegen + OpenAI-spår i prompt-assist (se kod). |
| `NEXT_PUBLIC_APP_URL` | Publik bas-URL för appen (default i schema: `http://localhost:3000`). |

Sätt dem i **`.env.local`** lokalt och i **Vercel → Environment Variables** för `development` / `preview` / `production` enligt behov.

---

## Vanliga tillägg (funktioner ovanpå)

| Område | Exempel på variabler | Kommentar |
|--------|----------------------|-----------|
| Cache / rate limit | `REDIS_URL`, `UPSTASH_REDIS_REST_URL` + token | Utan Redis: cache/rate limit degradar (se kod). |
| Blob / uppladdning | `BLOB_READ_WRITE_TOKEN` | Vercel Blob; lokalt kan vissa flöden falla tillbaka till filsystem (`DATA_DIR`). |
| Betalning | `STRIPE_*` | Om credits/betalning används. |
| E-post | `RESEND_API_KEY` | Utan: vissa mailflöden noop:ar. |
| OpenClaw / Sajtagenten | `OPENCLAW_GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN`, `IMPLEMENT_UNDERSCORE_CLAW` | Alla tre krävs för att den flytande widgeten och Sajtagenten-ytorna ska aktiveras. Utan en enda av dem visas ingen widget. Se checklista nedan. |
| D-ID avatar (mAIa Klo) | `NEXT_PUBLIC_AVATAR_AGENT_ID`, `NEXT_PUBLIC_AVATAR_CLIENT_KEY` | Aktiverar videokamera-togglen i OpenClaw-widgeten och `/avatar`-pilotytan. Utan dem fungerar widgeten som ren textchatt. Origins måste vara allowlistade i D-ID Studio. |
| Tier 2 live preview | `SAJTMASKIN_PREVIEW_HOST_BASE_URL`, `SAJTMASKIN_PREVIEW_HOST_API_KEY`, `NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES` | Preview-sessioner kör nu via preview-host / Fly. Detaljer: `preview-deploy.md`. |
| Statisk Visual QA (heuristik) | `SAJTMASKIN_VISUAL_QA` satt till `1` eller `true` | Efter att **alla** verify-lanekontroller passerat kan appen köra `analyzeVisualQuality` på exportabla filer (ingen screenshot). Resultatet syns i quality-gate-svar och kan loggas kompakt i `preflight:quality-gate`-meta. Standard är av. Läses direkt från `process.env` i `src/lib/gen/visual-qa.ts`, inte via `serverSchema` i `env.ts`. |
| Fil-/konsol-logg (lokal) | `SAJTMASKIN_LOG=true` → `logs/sajtmaskin.log` via `src/lib/logging/file-logger.ts`; `SAJTMASKIN_DEV_LOG` styr `devLog` (se kod) | Varken `SAJTMASKIN_LOG` eller dev-loggnycklarna finns i Zod-schemat; de är runtime-only i `env-policy.json`. `logs/generationslogg/` behaller bara de 3 senaste korningarna och sammanfattningarna kan valfritt unignoras i `.cursorignore`. |
| Övrigt | Se `serverSchema` i `env.ts` | Allt som appen läser ska finnas där. |

---

## Lokalt vs Vercel

| Plats | Vad |
|--------|-----|
| **`.env.local`** (gitignored) | Lokala hemligheter och dev-overrides. |
| **Vercel Dashboard / `vercel env`** | Sanning för deployade miljöer; samma *nycklar* som i `env.ts`, olika *värden* per `development` / `preview` / `production`. |
| **Vercel-managed** | Nycklar som plattformen eller Next sätter (t.ex. `NODE_ENV`, `VERCEL_URL`) — **pusha inte** egna värden från laptop om policyn säger motsatsen; se `classification: vercel_managed` i `env-policy.json`. |

`.vercel/.env.*.local` från `vercel env pull` är **snapshot**, inte kanon.

---

## Tier 2 preview-host vs app-env

När `preview-host` används på Fly finns **två** olika env-ytor:

- **Repo-rotens `.env.local` (Sajtmaskin-appen):** `SAJTMASKIN_PREVIEW_HOST_BASE_URL`, `NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES`, och `SAJTMASKIN_PREVIEW_HOST_API_KEY` när preview-host kör icke-lokalt.
- **Preview-host-tjänsten (Fly):** `PREVIEW_HOST_API_KEY`, plus host-sidans `PREVIEW_HOST_DATA_DIR=/data` i `preview-host/fly.toml` eller motsvarande service-env.

Praktisk rekommendation:

- Sätt `SAJTMASKIN_PREVIEW_HOST_BASE_URL=https://<din-app>.fly.dev` (root-URL, inte `/preview`)
- Sätt `SAJTMASKIN_PREVIEW_HOST_API_KEY` i appens env och samma secret som `PREVIEW_HOST_API_KEY` på preview-hosten
- Sätt `NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES=fly.dev`
- Låt `PREVIEW_HOST_DATA_DIR=/data` leva på host-sidan (`fly.toml` / Fly-env), inte i repo-rotens `.env.local`

När `SAJTMASKIN_PREVIEW_HOST_BASE_URL` finns satt behandlar appen preview-host som den aktiva tier-2-vägen.

---

## Generation: kontext och scaffold-policy

Dessa variabler styr hur mycket kontext LLM:en ser under kodgenerering. Alla defaultar till `true` (on) via `!== "false"`-konventionen -- att **inte** sätta dem ger standardbeteendet.

| Variabel | Default | Effekt |
|----------|---------|--------|
| `SAJTMASKIN_BUILD_SPEC_ENABLED` | `true` | Aktiverar `BuildSpec` som bestämmer `contextPolicy` (light/normal/heavy) och styr scaffold-, refs- och systemkontext-budgetar. Att stänga av (`"false"`) tar bort deterministisk policystyrning. |
| `SAJTMASKIN_LIGHTWEIGHT_SCAFFOLD_SERIALIZATION` | `true` | Använder den smarta scaffold-serialiseringen (file tree + kritiska filer) i stället for full dump. Om `"false"`: fallback till legacy full-file-dump med 140k-cap. Rekommendation: **alltid on**. |
| `SAJTMASKIN_FOLLOWUP_LIGHT_CONTEXT` | `true` | Aktiverar light-context-fast-path for follow-ups (copy/layout-ändringar): skippar KB-retrieval, template-snippets och tung scaffold-serialisering. Om `"false"`: follow-ups far samma tunga kontext som initiala genereringar. |

### Budgetar per contextPolicy (for referens)

Sätts automatiskt via `BuildSpec.contextPolicy` i `src/lib/gen/build-spec.ts` baserat på prompt, routes, integrationer m.m. -- inga env-variabler att justera här.

| Policy | `scaffoldTokens` | `refsTokens` | `systemContextTokens` | `scaffoldChars` | `refsChars` | `systemContextChars` |
|--------|------------------|--------------|------------------------|-----------------|------------|----------------------|
| `light` | 3 750 | 1 250 | 5 625 | 12 000 | 4 000 | 18 000 |
| `normal` | 6 250 | 2 500 | 8 750 | 20 000 | 8 000 | 28 000 |
| `heavy` | 7 800 | 3 750 | 11 250 | 25 000 | 12 000 | 36 000 |

Statisk core (`config/prompt-static/*.md`) laddas separat och ligger utanfor det dynamiska budgettaket. Total systemprompt = statisk core (~6-10k tokens) + dynamisk kontext (cappat ovan).

Om dynamisk kontext överstiger budgeten prunas den blockvis efter prioritet (lägre prioritet först) med tokenestimat, och loggas via `debugLog("engine", ...)` med dropped/kept block.

---

## Modeller och build-profiler

Sajtmaskin har fem **build-profiler** som mappas till faktiska OpenAI/Anthropic-modeller. Profilen valjs i byggarens header ("Modell: ..."). Default ar `pro`.

### Build-profiler → OpenAI-modeller (config/ai_models/manifest.json)

| Profil (UI) | Intern ID | OpenAI-modell | Input/1M | Output/1M | reasoning_effort | Typisk tid |
|-------------|-----------|---------------|----------|-----------|-----------------|-----------|
| Snabb | `fast` | `gpt-4.1` | $2.00 | $8.00 | medium | ~30-45s |
| **Pro** (default) | `pro` | `gpt-5.3-codex` | ~$1.25 | ~$10.00 | medium | ~60-90s |
| Tanker | `max` | `gpt-5.4` | $2.50 | $15.00 | medium/high | ~2-5 min |
| Codex | `codex` | `gpt-5.1-codex-max` | - | - | medium/high | varierar |
| Anthropic | `anthropic` | `claude-sonnet-4.6` | - | - | (ej applicable) | ~60-120s |

### Adaptiv reasoning_effort (BuildSpec-styrd)

`reasoning_effort` sätts **automatiskt** baserat på `BuildSpec.qualityTarget`:

| qualityTarget | reasoning_effort | När det triggas |
|---------------|-----------------|-----------------|
| `standard` | `medium` | Enkel landing page, en-sidig sajt och vanliga websites utan app-/integrationssignaler |
| `premium` | `high` | App, ecommerce, auth, dashboard, tydliga integrationer eller mer avancerade website-fall |
| `release-candidate` | `high` | Explicit produktionsklar build |

### Viktigt: vi använder INTE gpt-5.4 pro

`gpt-5.4 pro` ($30 input / $180 output per 1M tokens) ar en separat, 12x dyrare modell som aldrig anropas i denna kodbas. Var `gpt-5.4` ar standard-varianten ($2.50/$15). Förväxla inte `pro`-profilen i Sajtmaskin (intern beteckning, kör gpt-5.3-codex) med OpenAI:s `gpt-5.4 pro`.

### Env-override for modeller

Varje profil kan overridas via env utan kodändring:

| Env | Default | Overridar |
|-----|---------|-----------|
| `SAJTMASKIN_MODEL_FAST` | `gpt-4.1` | `fast`-profilen |
| `SAJTMASKIN_MODEL_PRO` | `gpt-5.3-codex` | `pro`-profilen |
| `SAJTMASKIN_MODEL_MAX` | `gpt-5.4` | `max`/Tanker-profilen |
| `SAJTMASKIN_MODEL_CODEX` | `gpt-5.1-codex-max` | `codex`-profilen |
| `SAJTMASKIN_MODEL_ANTHROPIC` | `claude-sonnet-4.6` | `anthropic`-profilen |
| `SAJTMASKIN_ASSIST_MODEL` | `openai/gpt-5.4` | Forbattra/Deep brief |
| `SAJTMASKIN_POLISH_MODEL` | `openai/gpt-5.3-codex` | Skriv om (prompt polish) |

### Prompt-assist-modeller (separat fran build)

| Steg | Modell | Vad det gor |
|------|--------|-------------|
| Forbattra / Deep brief | `openai/gpt-5.4` | Genererar brief fore build (~20s) |
| Skriv om (polish) | `openai/gpt-5.3-codex` | Latt omskrivning av prompt |

Dessa ar **inte** samma som build-modellen. Deep brief körs fortfarande med `openai/gpt-5.4`, men `server-auto-brief-policy.ts` hoppar nu oftare över det steget för redan strukturerade website-prompts.

---

## OpenClaw, avatar och nyckelchecklista

`OpenClaw` / `Sajtagenten` och builderns own-engine är olika saker:

- `OPENCLAW_GATEWAY_*` + `IMPLEMENT_UNDERSCORE_CLAW` styr assistentytan (`/api/openclaw/*`, tips, widget, avatar-bridge).
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` m.fl. styr egna `LLM`-steg i builderns generationsflöde.
- `NEXT_PUBLIC_AVATAR_*` aktiverar `D-ID`-videoavataren i widgeten och på `/avatar`-pilotytan.

### Checklista: vilka nycklar behövs lokalt

| Nyckel | Krävs för | Utan den |
|--------|-----------|----------|
| `OPENCLAW_GATEWAY_URL` | Gateway-URL till Sajtagenten (Render-deploy) | Widgeten visas inte |
| `OPENCLAW_GATEWAY_TOKEN` | Bearer-token mot gatewayen | Widgeten visas inte |
| `IMPLEMENT_UNDERSCORE_CLAW` | Feature-flagga (`"true"`) | Widgeten visas inte |
| `NEXT_PUBLIC_AVATAR_AGENT_ID` | D-ID agent-id (t.ex. `v2_agt_h5geNb9N`) | Videokamera-toggle dold, ren textchatt |
| `NEXT_PUBLIC_AVATAR_CLIENT_KEY` | D-ID client key (base64) | Videokamera-toggle dold, ren textchatt |

Alla tre `OPENCLAW_*`-nycklar måste vara satta **samtidigt** -- saknas en enda av dem blockas hela ytan (`OPENCLAW.surfaceEnabled` i `src/lib/config.ts`).

`NEXT_PUBLIC_AVATAR_*` är valfria. Utan dem fungerar widgeten som vanlig textchatt; med dem får användaren en videokamera-toggle i panelheadern. Origins (t.ex. `http://localhost:3000`, `https://sajtmaskin.vercel.app`) måste vara allowlistade i D-ID Studio under agentens inställningar.

---

## Nedladdat genererat Next-projekt (ZIP / export)

Vanliga “generiska” problem som **inte** beror på Fly eller Sajtmaskin-appens databas:

| Symtom | Förklaring |
|--------|------------|
| `'next' is not recognized` | Kör **`npm install`** i projektmappen **före** `npm run dev`. Scripts hittar `next` under `node_modules/.bin` först efter install. |
| `npm audit fix` i slutet av install | **Valfritt** — det är npm som tipsar om kända sårbarheter i trädet, inte ett krav för att sajten ska starta. |
| Next skriver om `tsconfig.json` första gången | Scaffold i Sajtmaskin är nu **alignat** med Next 16 (`jsx: react-jsx`, `.next/dev/types` i `include`) så varningen ska sällan visas; om den ändå dyker upp efter uppgradering av Next är det normalt och ofarligt. |
| Vit / tom sida i Tier 2 | Kan bero på tom `app/page.tsx`, långsam första kompilering, eller RSC som ger lite synlig HTML i första svaret — preflight + preview-host readiness försöker flagga / vänta; se `preview-host/README.md`. |

---

## Databasskript och skyddsräcken

`npm run db:init`, `npm run db:migrate` och `npm run db:push` är **skrivande** kommandon. De jämför aktuell DB-target i `.env.local` mot `.env.vercel.production.pulled` när den filen finns. Om host/port/databas matchar vägrar de köra som standard.

Om du **medvetet** måste skriva mot en sådan target krävs explicit override:

- `DB_ALLOW_PROD_LIKE_WRITE=1`

`npm run db:check` och `npm run db:rows` är read-only men varnar om targeten ser production-lik ut, så att “lokal sanity” inte råkar betyda “produktion”.

---

## Lokal isolering: Blob och Redis

Om du vill att lokal utveckling ska vara mer isolerad från production:

- **Blob / bilder / filer:** kommentera ut `BLOB_READ_WRITE_TOKEN` och sätt `STORAGE_BACKEND=fs` om du vill hålla media/uppladdningar lokala. **`template-embeddings.json` är nu alltid lokal och commitad**; produktionen läser den filen från repot i stället för blob.
- **Redis:** kan delas tillfälligt mellan local/preview/production eftersom koden prefixes nycklar per miljö (`dev:`, `preview:`, `prod:`). Separat dev-Redis är bra för renare drift/observability, men inte lika akut som separat DB eller Blob.

---

## Ny nyckel i projektet

1. Lägg till i [`src/lib/env.ts`](../src/lib/env.ts) (`serverSchema`).
2. Uppdatera [`config/env-policy.json`](../config/env-policy.json) (regel + ev. `extraKnownKeys` / targets).
3. Sätt värde i `.env.local` och i Vercel.
4. Kör `python scripts/env/manage_env.py audit` (eller `--strict` enligt er vana).

---

## Genererade användarsajter (preview / VM runtime)

Sajtmaskin **≠** den genererade Next-appen i preview-/VM-runtime. Merge av placeholders och projekt-env i VM sker i kod (`src/lib/gen/preview/env-local.ts`) med underlag från `config/ai_models/` — se **preview-deploy.md**, avsnitt om tier-2 preview `.env.local`.

---

## Filer som inte committas

`.env.local`, `.env.production`, `.env.*.local`, m.fl. — se `.gitignore`. Håll UTF-8 **LF** utan BOM i env-filer (särskilt viktigt på Windows).
