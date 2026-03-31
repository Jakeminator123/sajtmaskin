# Miljövariabler (kort översikt)

**Den här filen är inte “source of truth”.** Den ska bara hjälpa människor att snabbt förstå *vad som krävs*, *vad som är valfritt*, och *var sanningen finns i kod*.

**Viktigt:** `.env.local` i **repo-roten** gäller **Sajtmaskin-appen**. En **annan** `.env.local` finns i **användarens genererade Next-projekt** (sandbox / export) — se avsnitt *Genererade användarsajter* och [`.cursor/rules/terminology.mdc`](../.cursor/rules/terminology.mdc) § Env. Rotens `.env*` är ofta gitignorerad **och** borttagen från Cursor-index (`.cursorignore`); agenter ser dem inte om du inte öppnar dem explicit.

| Källa | Roll |
|--------|------|
| [`src/lib/env.ts`](../src/lib/env.ts) | Alla namn som appen faktiskt läser (Zod `serverSchema`). |
| [`config/env-policy.json`](../config/env-policy.json) | Klassificering per nyckel (`shared_runtime`, `optional_runtime`, `vercel_managed`, …), rekommenderade Vercel-miljöer, `knownEmptyOk`, m.m. |
| [`scripts/env/manage_env.py`](../scripts/env/manage_env.py) | Kanonisk env-CLI för audit / status / sync mot lokala filer och Vercel. Root-wrappern [`manage_env.py`](../manage_env.py) finns kvar för bakåtkompatibilitet. |

**Djupare ämnesdokument** (lägg inte in backlog eller långa tabeller här):

- Preview / sandbox / credentials: [`architecture/preview-deploy.md`](./architecture/preview-deploy.md), [`architecture/vercel-sandbox-credentials.md`](./architecture/vercel-sandbox-credentials.md)
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
| Blob / uppladdning | `BLOB_READ_WRITE_TOKEN` | Vercel Blob; lokalt kan vissa flöden falla tillbart till filsystem (`DATA_DIR`). |
| Betalning | `STRIPE_*` | Om credits/betalning används. |
| E-post | `RESEND_API_KEY` | Utan: vissa mailflöden noop:ar. |
| Sandbox (live preview i VM) | `VERCEL_OIDC_TOKEN` eller `VERCEL_TOKEN` + team/project | Detaljer: `vercel-sandbox-credentials.md` + `preview-deploy.md`. |
| Fil-/konsol-logg (lokal) | `SAJTMASKIN_LOG=true` → `logs/sajtmaskin.log` via `src/lib/logging/file-logger.ts`; `SAJTMASKIN_DEV_LOG` styr `devLog` (se kod) | Varken `SAJTMASKIN_LOG` eller dev-loggnycklarna finns i Zod-schemat; de är runtime-only i `env-policy.json`. |
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

## Databasskript och skyddsräcken

`npm run db:init`, `npm run db:migrate` och `npm run db:push` är **skrivande** kommandon. De jämför aktuell DB-target i `.env.local` mot `.env.vercel.production.pulled` när den filen finns. Om host/port/databas matchar vägrar de köra som standard.

Om du **medvetet** måste skriva mot en sådan target krävs explicit override:

- `DB_ALLOW_PROD_LIKE_WRITE=1`

`npm run db:check` och `npm run db:rows` är read-only men varnar om targeten ser production-lik ut, så att “lokal sanity” inte råkar betyda “produktion”.

---

## Ny nyckel i projektet

1. Lägg till i [`src/lib/env.ts`](../src/lib/env.ts) (`serverSchema`).
2. Uppdatera [`config/env-policy.json`](../config/env-policy.json) (regel + ev. `extraKnownKeys` / targets).
3. Sätt värde i `.env.local` och i Vercel.
4. Kör `python scripts/env/manage_env.py audit` (eller `--strict` enligt er vana). Root-wrappern `python manage_env.py audit` fungerar fortfarande om någon gammal rutin använder den.

---

## Genererade användarsajter (sandbox)

Sajtmaskin **≠** den genererade Next-appen i sandlådan. Merge av placeholders och projekt-env i VM sker i kod (`src/lib/gen/sandbox-env-local.ts`) med underlag från `config/ai_models/` — se **preview-deploy.md**, avsnitt om sandbox `.env.local`.

---

## Filer som inte committas

`.env.local`, `.env.production`, `.env.*.local`, m.fl. — se `.gitignore`. Håll UTF-8 **LF** utan BOM i env-filer (särskilt viktigt på Windows).
