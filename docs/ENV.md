# Miljövariabler (kort översikt)

**Den här filen är inte “source of truth”.** Den ska bara hjälpa människor att snabbt förstå *vad som krävs*, *vad som är valfritt*, och *var sanningen finns i kod*.

**Viktigt:** `.env.local` i **repo-roten** gäller **Sajtmaskin-appen**. En **annan** `.env.local` finns i **användarens genererade Next-projekt** (sandbox / export) — se avsnitt *Genererade användarsajter*, [`.cursor/rules/terminology.mdc`](../.cursor/rules/terminology.mdc) och [`docs/architecture/glossary.md`](architecture/glossary.md) (§ Env-lager). Rotens `.env*` är ofta gitignorerad **och** borttagen från Cursor-index (`.cursorignore`); agenter ser dem inte om du inte öppnar dem explicit.

| Källa | Roll |
|--------|------|
| [`src/lib/env.ts`](../src/lib/env.ts) | Alla namn som appen faktiskt läser (Zod `serverSchema`). |
| [`config/env-policy.json`](../config/env-policy.json) | Klassificering per nyckel (`shared_runtime`, `optional_runtime`, `vercel_managed`, …), rekommenderade Vercel-miljöer, `knownEmptyOk`, m.m. |
| [`scripts/env/manage_env.py`](../scripts/env/manage_env.py) | Kanonisk env-CLI för audit / status / sync mot lokala filer och Vercel. |

**Djupare ämnesdokument** (lägg inte in backlog eller långa tabeller här):

- Preview / sandbox / credentials: [`architecture/preview-deploy.md`](./architecture/preview-deploy.md)
- Modeller / assist / builder-generering: [`architecture/builder-generation.md`](./architecture/builder-generation.md), `src/lib/models/catalog.ts`
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
| Tier 2 live preview | `SAJTMASKIN_PREVIEW_HOST_BASE_URL`, `SAJTMASKIN_PREVIEW_HOST_API_KEY`, `NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES` | Preview-sessioner kör nu via preview-host / Fly. Detaljer: `preview-deploy.md`. |
| Statisk Visual QA (heuristik) | `SAJTMASKIN_VISUAL_QA` satt till `1` eller `true` | Efter att **alla** verify-lanekontroller passerat kan appen köra `analyzeVisualQuality` på exportabla filer (ingen screenshot). Resultatet syns i quality-gate-svar och kan loggas kompakt i `preflight:quality-gate`-meta. Standard är av. Läses direkt från `process.env` i `src/lib/gen/visual-qa.ts`, inte via `serverSchema` i `env.ts`. |
| LLM reasoning/thinking | `SAJTMASKIN_DEFAULT_THINKING=true` | Server-side default för reasoning/thinking-flaggan i kodgenerering. Gäller när klienten inte skickar ett explicit val. `SAJTMASKIN_SHOW_THINKING` i `engine.ts` är en äldre fallback men nås sällan i builder-flödet. |
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

## Ny nyckel i projektet

1. Lägg till i [`src/lib/env.ts`](../src/lib/env.ts) (`serverSchema`).
2. Uppdatera [`config/env-policy.json`](../config/env-policy.json) (regel + ev. `extraKnownKeys` / targets).
3. Sätt värde i `.env.local` och i Vercel.
4. Kör `python scripts/env/manage_env.py audit` (eller `--strict` enligt er vana).

Djupare ämnen:

- Modellprofiler och override-nycklar: `docs/schemas/model-build-profiles.md`, `docs/architecture/builder-generation.md`, `config/ai_models/manifest.json`
- OpenClaw / avatar: `docs/architecture/builder-generation.md`, `src/lib/config.ts`
- Exporterade Next-projekt och preview-host: `docs/architecture/preview-deploy.md`, `preview-host/README.md`
- DB-skrivskydd: `scripts/README.md`

---

## Genererade användarsajter (preview / VM runtime)

Sajtmaskin **≠** den genererade Next-appen i preview-/VM-runtime. Merge av placeholders och projekt-env i VM sker i kod (`src/lib/gen/preview/env-local.ts`) med underlag från `config/ai_models/` — se **preview-deploy.md**, avsnitt om tier-2 preview `.env.local`.

---

## Filer som inte committas

`.env.local`, `.env.production`, `.env.*.local`, m.fl. — se `.gitignore`. Håll UTF-8 **LF** utan BOM i env-filer (särskilt viktigt på Windows).
