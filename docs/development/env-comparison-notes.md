# Env-jämförelse (lokal referens, inga hemligheter)

Sajtmaskin — jämförelse gamla env-filer vs Vercel production (2026-03-24)

Inga hemliga värden i denna fil — bara nyckelnamn och rekommendationer.

## Vad som gjorts

- `vercel env pull .env.vercel.production.pulled --environment production` kördes framgångsrikt. Filen ligger i repo-roten, matchar `.gitignore`-mönstret `.env.*` och ska **inte** committas.
- `OLD.env.local` och `OLD.env.production` innehåller känslig data: de är ignorerade via `.gitignore` (`OLD.env*`) så de inte kan committas av misstag.

## Säkerhetsvarning

Om innehållet i OLD-filerna har visats i chat, loggar eller delats: rotera i prioritetsordning JWT, databas-URL, API-nycklar (OpenAI, Anthropic, Vercel, Stripe, Resend, Blob), admin-lösenord och OIDC-token. `ADMIN_CREDENTIALS` i klartext är extra känsligt.

## Nycklar i Vercel production som inte fanns i OLD.env.production (referens)

- `ENV_VAR_ENCRYPTION_KEY` — kommenterad i OLD.production men finns nu på Vercel.
- `VERCEL_OIDC_TOKEN` — fanns i OLD.local men saknades i OLD.production-referensen; Vercel pull innehåller den (byggs/körs på Vercel).
- `VERCEL_*`, `VERCEL_GIT_*`, `TURBO_*`, `NX_DAEMON` — plattforms-/bygginjicerade; normalt inget du sätter manuellt i en referenskopia.

## Nycklar som fanns i OLD.production men inte i Vercel production-pull

Tolkning: antingen borttagna i Vercel, tomma, eller aldrig satta i production. Exempel: `V0_FALLBACK_BUILDER`, `SAJTMASKIN_LOG`, `SAJTMASKIN_DEV_LOG`, `TEST_USER_*`, `CRON_SECRET`, `REGISTRY_*`, `NEXT_PUBLIC_REGISTRY_*`, `PEXELS_API_KEY`, extra Postgres-varianter, `GOOGLE_REDIRECT_URI` (tom i OLD), `AUTH_DEBUG`, `DEBUG`.

## Gamla vs nuvarande kod / schema

- `SAJTMASKIN_LOG` används i `src/lib/logging/file-logger.ts` men finns **inte** i `src/lib/env.ts` (Zod). Den läses direkt från `process.env` — funkar, men är utanför "single source of truth".
- Stripe: `STRIPE_PRICE_*_CREDITS` är fortfarande `price_*_placeholder` i OLD — felaktigt för riktig betalning tills riktiga Price IDs sätts i Vercel.
- Plan 17: byggmotor och sido-routes använder direkt `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`; AI Gateway används inte längre i runtime.

## Skillnad OLD.local vs OLD.production (snabbt)

- Local hade t.ex. `VERCEL_OIDC_TOKEN`, `V0_FALLBACK_BUILDER`, `DATA_DIR`, `BACKOFFICE_PASSWORD`, dev GitHub/Google ID-par, `INSPECTOR_*` mot localhost — production-referensen skiljer sig (t.ex. `GITHUB_REDIRECT_URI` satt, inspector tom/`FORCE_WORKER_ONLY`).
- `AUDIT_WEB_SEARCH` skiljer (true vs false mellan filerna du jämförde).

## Återkommande arbete

- Gå igenom Vercel Dashboard production mot `.env.vercel.production.pulled` (redigera aldrig pull-filen som sanning — `vercel env pull` igen vid behov).
- Besluta vilka saknade nycklar som ska bort från Vercel vs läggas till.
- Säkerställ att [`src/lib/env.ts`](../../src/lib/env.ts) / [`config/env-policy.json`](../../config/env-policy.json) speglar nuvarande direktnycklar och preview-host-flöden; [`../ENV.md`](../ENV.md) bara om ni vill lyfta något i *must-have*-tabellen.
- Sätt riktiga Stripe Price IDs om ni ska ta betalt.

## Kommando för att förnya production-pull

```bash
vercel env pull .env.vercel.production.pulled --environment production --yes
```

(Preview / development: byt `--environment`.)
