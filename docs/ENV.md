# Miljövariabler (kort översikt)

**Den här filen är inte “source of truth”.** Den ska bara hjälpa människor att snabbt förstå *vad som krävs*, *vad som är valfritt*, och *var sanningen finns i kod*.

**Viktigt:** `.env.local` i **repo-roten** gäller **Sajtmaskin-appen**. En **annan** `.env.local` finns i **användarens genererade Next-projekt** (sandbox / export) — se avsnitt *Genererade användarsajter*, [`.cursor/rules/terminology.mdc`](../.cursor/rules/terminology.mdc) och [`docs/architecture/glossary.md`](architecture/glossary.md) (§ Env-lager). Rotens `.env*` är ofta gitignorerad **och** borttagen från Cursor-index (`.cursorignore`); agenter ser dem inte om du inte öppnar dem explicit.

| Källa | Roll |
|--------|------|
| [`src/lib/env.ts`](../src/lib/env.ts) | Alla namn som appen faktiskt läser (Zod `serverSchema`). |
| [`config/env-policy.json`](../config/env-policy.json) | Klassificering per nyckel (`shared_runtime`, `optional_runtime`, `vercel_managed`, …), rekommenderade Vercel-miljöer, `knownEmptyOk`, m.m. |
| [`scripts/env/manage_env.py`](../scripts/env/manage_env.py) | Kanonisk env-CLI för audit / status / sync mot lokala filer och Vercel. |

**Djupare ämnesdokument** (lägg inte in backlog eller långa tabeller här):

- Preview / sandbox / credentials: [`architecture/fas3-preview-and-deploy.md`](./architecture/fas3-preview-and-deploy.md)
- Modeller / assist / builder-generering: [`architecture/fas2-orchestration-and-build.md`](./architecture/fas2-orchestration-and-build.md), `src/lib/models/catalog.ts`
- Historisk nyckeljämförelse (utan hemligheter): borttagen — se git-historik

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
| OpenClaw / Sajtagenten | `OPENCLAW_GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN`, `IMPLEMENT_UNDERSCORE_CLAW` | Alla tre krävs för att den flytande widgeten och Sajtagenten-ytorna ska aktiveras. Utan en enda av dem visas ingen widget. |
| D-ID avatar (mAIa Klo) | `NEXT_PUBLIC_AVATAR_AGENT_ID`, `NEXT_PUBLIC_AVATAR_CLIENT_KEY` | Aktiverar videokamera-togglen i OpenClaw-widgeten och `/avatar`-pilotytan. Utan dem fungerar widgeten som ren textchatt. Origins måste vara allowlistade i D-ID Studio. |
| Tier 2 live preview | `SAJTMASKIN_PREVIEW_HOST_BASE_URL`, `SAJTMASKIN_PREVIEW_HOST_API_KEY`, `NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES` | Preview-sessioner kör nu via preview-host / Fly. Detaljer: `fas3-preview-and-deploy.md`. |
| Pre-VM typecheck | `SAJTMASKIN_PRE_VM_TYPECHECK=true`, ev. `SAJTMASKIN_PRE_VM_TYPECHECK_CACHE_ROOT` | Aktiverar `tsc --noEmit` mot varm scaffold-cache före VM. F3-genereringar tvingar alltid på den. Fail-open vid kall cache. Källa: `src/lib/gen/preview/warm-typecheck.ts`. |
| F2/F3 placeholder-fragments | (inga env-vars; två filer i `config/ai_models/`) | F2 mergar `40-harmless-placeholders.env.txt` + `41-tier3-stub-placeholders.env.txt`. F3 (`/finalize-design`) stripar tier-3-stubben och kräver riktiga värden via stored project env vars. Per-key-klassificering: `src/lib/integrations/placeholder-harmless.ts`. |
| Statisk Visual QA (heuristik) | `SAJTMASKIN_VISUAL_QA` satt till `1` eller `true` | Efter att **alla** verify-lanekontroller passerat kan appen köra `analyzeVisualQuality` på exportabla filer (ingen screenshot). Resultatet syns i quality-gate-svar och kan loggas kompakt i `preflight:quality-gate`-meta. Standard är av. Läses direkt från `process.env` i `src/lib/gen/visual-qa.ts`, inte via `serverSchema` i `env.ts`. |
| LLM reasoning/thinking | `SAJTMASKIN_DEFAULT_THINKING=true` | Kanonisk server-side default för reasoning/thinking-flaggan i kodgenerering. Gäller när klienten inte skickar ett explicit val. `SAJTMASKIN_SHOW_THINKING` stöds bara som legacy-alias under migrering av äldre miljöer. |
| Dossier pipeline | `SAJTMASKIN_DOSSIER_PIPELINE=true` | Aktiverar runtime-läsning av `data/dossiers/_index/` (master.json, dossier-embeddings.json, scaffold-recommendations.json) och injicerar `## Available Dossiers` + `## Selected Dossier Instructions` i system-prompten. **På i development**, opt-in i production. Ersätter den avvecklade `SAJTMASKIN_RUNTIME_TEMPLATE_GUIDANCE` + `SAJTMASKIN_VARIANT_STRUCTURAL_FILES` (template-library, borttagen 2026-04-17). |
| Dossier-trösklar | `DOSSIER_MAX_TOTAL=3`, `DOSSIER_MAX_PER_CATEGORY=1`, `DOSSIER_MIN_SCORE=0.45`, `DOSSIER_MIN_SCORE_PAYMENTS=0.55`, `DOSSIER_MIN_SCORE_AUTH=0.55`, `DOSSIER_MIN_SCORE_DATABASE=0.5`, `DOSSIER_MIN_SCORE_REALTIME=0.5`, `DOSSIER_MIN_SCORE_AI=0.5`, `DOSSIER_PRIMARY_BOOST=0.15`, `DOSSIER_SUGGESTED_BOOST=0.05` | Styr embedding-cosine-trösklarna och taken för dossier-injection per request. Höjda 2026-04-18 efter att Stripe + Upstash drogs in på en irrelevant museum-prompt. Per-kategori är striktare för dyra kategorier (payments/auth/database/realtime). **OBS:** läses vid module-load i [`src/lib/gen/dossiers/select.ts`](../src/lib/gen/dossiers/select.ts) — ändringar kräver server-restart för att slå igenom. |
| Dossier brochure-gate | `DOSSIER_BROCHURE_BLOCK_CATEGORIES=payments,auth,database,realtime` | Hard-gate: kategorier som ALDRIG injiceras när brief-LLM:n klassar sajten som `siteType=brochure` (ren landningssida/info-sajt). Kommaseparerad lista. Sätt tom sträng för att stänga av gaten. |
| Klient-autofix-tak | `NEXT_PUBLIC_AUTOFIX_MAX_PER_CHAT=2`, `NEXT_PUBLIC_AUTOFIX_MAX_PER_REASON=1`, `NEXT_PUBLIC_AUTOFIX_DEDUPE_TTL_MS=300000` | Styr klient-driven autofix i [`useAutoFix.ts`](../src/lib/hooks/chat/useAutoFix.ts). Max-per-chat hindrar oändliga repair-loopar. Max-per-reason hindrar samma fel-typ från att försöka fler gånger än tillåtet. NEXT_PUBLIC_-prefix krävs eftersom värdena läses i klient-bundlen. |
| Deferred extra init routes | `SAJTMASKIN_DEFER_EXTRA_ROUTES_ON_INIT=true` | Opt-in för att låta init-genereringar (inklusive `isFirstCodeGeneration`-fallet efter scaffold/contract-gate) planera flera routes men bara fullt realisera primärrouten direkt. Extrasidor blir då giltiga shells med tydlig `Skapa sida`-yta. På follow-up bevaras shells automatiskt om inte användaren explicit ber om att bygga ut en specifik sida. Default av. |
| Lokal dev-logg | `SAJTMASKIN_DEV_LOG` styr `devLog` (se kod); `GENERATIONSLOGG` styr generationsloggen | Runtime-only, inte i Zod-schemat. `logs/generationslogg/` behåller bara de 3 senaste körningarna. `SAJTMASKIN_LOG` / `file-logger.ts` är borttagna (2026-04, oanvänd). |
| Postgres-pool | `POSTGRES_POOL_MAX`, `POSTGRES_POOL_IDLE_TIMEOUT_MS` | Override för pool-storlek + idle-timeout per processinstans i [`src/lib/db/client.ts`](../src/lib/db/client.ts). Default väljs automatiskt: pooled connection (Supabase pgbouncer / `?pgbouncer=true` / hostname `pooler.*` / port 6543/5433) får `max=3` + idle 5s, direkt Postgres får `max=10` + idle 30s. Sätt `POSTGRES_POOL_MAX` lägre om du ser `EMAXCONNSESSION: max clients` i Fly-loggar (SAJ-7 / B1). |
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
- **Preview-host-tjänsten (Fly):** `PREVIEW_HOST_API_KEY`, plus host-sidans `PREVIEW_HOST_DATA_DIR=/data` i `preview-host/fly.toml` eller motsvarande service-env. Plus `SAJTMASKIN_PREVIEW_DISABLE_HMR` (default `true`) som styr om webpack-HMR-pluginen inaktiveras i preview-VM:ens Next dev — av som default eftersom Fly's edge-proxy droppar WS-handshakes på `/<chatId>/_next/webpack-hmr`-pathen och annars spammar klient-konsolen. Sätt `false` för att återaktivera HMR vid direkt-debug av VM:en.

Praktisk rekommendation:

- Sätt `SAJTMASKIN_PREVIEW_HOST_BASE_URL=https://<din-app>.fly.dev` (root-URL, inte `/preview`)
- Sätt `SAJTMASKIN_PREVIEW_HOST_API_KEY` i appens env och samma secret som `PREVIEW_HOST_API_KEY` på preview-hosten
- Sätt `NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES=fly.dev`
- Låt `PREVIEW_HOST_DATA_DIR=/data` leva på host-sidan (`fly.toml` / Fly-env), inte i repo-rotens `.env.local`
- Låt `SAJTMASKIN_PREVIEW_DISABLE_HMR=true` (default) ligga på host-sidan; ändra bara om du behöver hot-reload mellan kod-ändringar i en pågående preview-VM

När `SAJTMASKIN_PREVIEW_HOST_BASE_URL` finns satt behandlar appen preview-host som den aktiva tier-2-vägen.

---

## Ny nyckel i projektet

1. Lägg till i [`src/lib/env.ts`](../src/lib/env.ts) (`serverSchema`).
2. Uppdatera [`config/env-policy.json`](../config/env-policy.json) (regel + ev. `extraKnownKeys` / targets).
3. Sätt värde i `.env.local` och i Vercel.
4. Kör `python scripts/env/manage_env.py audit` (eller `--strict` enligt er vana).

Djupare ämnen:

- Modellprofiler och override-nycklar: `docs/schemas/model-build-profiles.md`, `docs/architecture/fas2-orchestration-and-build.md`, `config/ai_models/manifest.json`
- OpenClaw / avatar: `docs/architecture/system-overview.md`, `src/lib/config.ts`
- Exporterade Next-projekt och preview-host: `docs/architecture/fas3-preview-and-deploy.md`, `preview-host/README.md`
- DB-skrivskydd: `scripts/README.md`

---

## Genererade användarsajter (preview / VM runtime)

Sajtmaskin **≠** den genererade Next-appen i preview-/VM-runtime. Merge av placeholders och projekt-env i VM sker i kod (`src/lib/gen/preview/env-local.ts`) med underlag från `config/ai_models/` — se **fas3-preview-and-deploy.md**, avsnitt om tier-2 preview `.env.local`.

### Project env file (`env.example`) — användar­synlig dokumentationsfil

Varje genererad sajt får en egen `env.example`-fil i projektets filträd (syns i builderns filpanel). Den genereras av [`src/lib/gen/preview/project-env-file.ts`](../src/lib/gen/preview/project-env-file.ts) och **regenereras vid varje generering** så lokala ändringar skrivs över — riktiga värden ska in via env-panelen i F3, eller (lokalt) genom att kopiera till `.env.local`.

> **Filnamnet hette tidigare `env.env`.** Renamed 2026-04 till `env.example` för att följa standardkonventionen och tydliggöra att Next.js INTE läser filen vid runtime — det är ren dokumentation. Injectorn rensar gamla `env.env`-filer automatiskt vid nästa generering, så befintliga projekt slipper manuell migrering.

Filen tar bort behovet av att fråga användaren om env-variabler i chatten under F2:

| Stage | Innehåll i `env.example` | Källor |
|-------|---------------------|--------|
| **F2** (`design`) | Alla harmless-placeholders **+** tier-3-stubs **+** projekt-preview-tokens. Användaren ser exakt vilka nycklar projektet kan tänkas använda. Ingen interaktion krävs — preview-VM:en bootar oberoende av denna fil. | `40-harmless-placeholders.env.txt` + `41-tier3-stub-placeholders.env.txt` + `project-preview-env.ts` |
| **F3** (`integrations`) | Tier-3-stubs strippas. Värden från env-panelen (`projectEnvVars` i DB) mergas in som "user"-lager. Saknade tier-3 nycklar surfar som blockers via [`src/lib/integrations/tier3-build-spec.ts`](../src/lib/integrations/tier3-build-spec.ts). | Som F2 utan tier-3 + DB-lagrade `projectEnvVars` + ev. modell-emitterad `.env.local` |

`env.example` skrivs in i `versions.files_json` som vilken annan genererad fil som helst. Preview-host fortsätter parallellt skriva sin egen `.env.local` i sandboxen — det är `.env.local` som faktiskt boot:ar previewen, `env.example` är **användarsynlig spegling** + förklaringsdokument. Detaljer: [`src/lib/gen/stream/finalize-version.ts`](../src/lib/gen/stream/finalize-version.ts) (kallar `injectProjectEnvFileIntoFilesJson`).

### Regelkontrakt: F2-tystnad

F2 får aldrig generera env-frågor i chatten. Detta är en hård regel — se [`.cursor/rules/env-flow-f2-mute.mdc`](../.cursor/rules/env-flow-f2-mute.mdc). Fyra lager skydd är på plats:

1. **Tool exposure gate** — `requestEnvVar` / `suggestIntegration` exponeras inte för LLM:n i F2 ([`create-chat-stream-post.ts`](../src/lib/api/engine/chats/create-chat-stream-post.ts), [`chat-message-stream-post.ts`](../src/lib/api/engine/chats/chat-message-stream-post.ts)).
2. **SSE filter** — om verktygen ändå råkar kallas droppas tool-events av [`generation-stream-tools.ts`](../src/lib/providers/own-engine/generation-stream-tools.ts) i F2 (defense-in-depth, tool-call-pathen).
3. **Panel mount-gate** — `ProjectEnvVarsPanel` renderas bara när `lifecycleStage === "integrations"` ([`BuilderShellContent.tsx`](../src/app/builder/BuilderShellContent.tsx)). I F2 visas en kompakt rad som pekar på `env.example` + "Bygg nu"-knappen.
4. **Post-finalize code-scan gate** — efter finalize scannar [`generation-stream-post-finalize.ts`](../src/lib/providers/own-engine/generation-stream-post-finalize.ts) genererad kod efter integrations-imports (Stripe, Upstash etc.). I F2 droppas resultatet (loggas som warning). I F3 emitteras integration-SSE som vanligt. Tillagt 2026-04-18 efter regression där Stripe+Upstash visades i F2-chatten på en museum-prompt.

Lansering-spärren (readiness-route) gatas också på lifecycleStage så att F2 alltid returnerar `ready: true` oavsett vad som detekteras i koden.

---

## Filer som inte committas

`.env.local`, `.env.production`, `.env.*.local`, m.fl. — se `.gitignore`. Håll UTF-8 **LF** utan BOM i env-filer (särskilt viktigt på Windows).
