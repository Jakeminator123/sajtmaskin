# Körningslogg lokalt + tokenmätning per användare

Status: steg 2 (`llm_usage` + instrumentering) är mergad till master 2026-07-25
(#613) och migrationen är applicerad i prod. Steg 1 (lokalt insamlingsskript)
ligger i #609. Steg 3 kräver beslut innan kod.

Mål: en knapp lokalt som drar hem **allt** som säger hur den senaste genererade
användarsajten gick, och samma datamodell som grund för att mäta
tokenförbrukning per användare.

## Varför

`/logg` (skill + kommando) gör redan detta — men manuellt, av en agent, i
chatten. Resultatet försvinner när sessionen tar slut och två körningar går inte
att jämföra. Tokenfrågan har samma problem: siffrorna finns i DB för
codegen-strömmen, men ingen samlar dem per körning eller per användare.

## Steg 1 — `last-generated-usersite.py` (levererat)

| Del | Beslut |
| --- | --- |
| Placering | `scripts/observability/last-generated-usersite.py` + paketet `scripts/observability/genlogs/` |
| Utdata | `data/gen-logs/<datum>_<chat>/` (gitignorerad) |
| Rotation | `MAX_GEN_LOGS=10` (env, `--max-logs` överstyr) — äldsta mappen raderas |
| Läge | Read-only. Bara `SELECT`/GET. Aldrig skriv, deploy, secrets-set eller migration |
| Källor | Postgres (Supabase), Vercel, Fly preview-host, OpenAI Admin usage/costs, D-ID credits |
| Rapport | `summary.md` (svensk bedömning) + `report.html` (självständig canvas) + `tokens.json` |
| Saknad källa | Hoppas över och redovisas som `unavailable` med orsak — aldrig hårt fel |

Skriptet är **konsument**, inte ägare: tabellnamn och priser läses från
befintliga ägare (`src/lib/db/schema.ts`, `config/ai_models/pricing.json`) och
kolumner introspekteras i runtime, så nya kolumner följer med utan kodändring.

## Steg 2 — tokenmätning som faktiskt täcker pipelinen (levererat, PR #613)

Före PR #613 loggades tokens bara för own-engine:s codegen-ström
(`engine_generation_logs` + `generation_telemetry`, skrivna från
`src/lib/gen/stream/finalize-version/`). Allt annat kastar `usage`:

| LLM-anrop | Tokens i DB före #613 | Efter #613 |
| --- | --- | --- |
| Codegen-ström (own-engine) | ja | ja, per anrop och utgång |
| Deep Brief / Snapshot-Brief | nej | ja, båda providergrenarna och båda schemaförsöken |
| verifier | nej | ja, inkl. felvägen |
| RepairGate (LLM-fixer) | nej | ja |
| Embeddings (scaffold/variant) | nej | ja |
| Intent-klassificerare, QA-short-circuit | nej | ja |
| Prompt assist | nej | ja |
| Wizard, audit, analyze, transcribe, inspector | nej | **fortfarande nej** — sekundära ytor, egna användaråtgärder snarare än delar av en generering |
| Sajtagenten (OpenClaw-gateway) | nej | **fortfarande nej** — körs utanför appen |
| D-ID | nej | **fortfarande nej** — credits, inte tokens |

Så här levererades det:

1. Tabellen `llm_usage` — en rad per LLM-anrop (`src/lib/db/schema.ts` +
   `migrations/add-llm-usage.sql`).
2. `recordLlmUsage()` i `src/lib/observability/llm-usage.ts` — fire-and-forget,
   kastar aldrig, laddar DB-lagret lazy.
3. Ägaren (`chat_id`, `version_id`, `user_id`, `session_id`, `run_id`) sätts en
   gång per request via `AsyncLocalStorage`, med efterstämpling för anrop som kör
   innan chatten respektive versionen finns.
4. `engine_generation_logs`/`generation_telemetry` orörda — befintliga konsumenter
   (backoffice, `generation-cost.mjs`, `control-stats.mjs`) påverkas inte.

`cached_input_tokens` gör att kostnaden nu kan bli **exakt** i stället för en övre
gräns (dagens caveat i `pricing.json` gällde just cachade tokens).

## Steg 3 — vad tokenmätningen ska användas till

| Fråga | Vad som krävs |
| --- | --- |
| Vad kostade en körning? | steg 2 + `pricing.json` (redan i `tokens.json` för det som loggas) |
| Vad kostar en användare per månad? | `llm_usage.user_id` + rollup-vy |
| Ska diamonds bli tokenbaserade? | produktbeslut — `src/lib/credits/` är fast pris per åtgärd idag |
| Vad kostar Sajtagenten? | OpenClaw-gatewayen måste rapportera usage tillbaka, eller läsas via OpenAI Admin API per projekt/API-nyckel |
| Vad kostar D-ID? | `GET /credits` före/efter, eller D-ID:s egen usage-yta — credits, inte tokens |

## Gränser att inte missförstå

- **OpenAI:s Admin API kan inte attribuera per slutanvändare.** `group_by`
  stödjer `project_id`, `user_id`, `api_key_id`, `model`, `batch`,
  `service_tier` — där `user_id` är organisationens medlem/servicekonto, inte
  vår `users.id`. Minsta bucket är `1m`. Org-siffran är därför en **kontroll**
  mot vår egen loggning i tidsfönstret, inte en per-körning-sanning.
- **Egen instrumentering är enda vägen till per-användare-sanning.**
- Separata API-nycklar krävs för de externa kontrollerna: `OPENAI_ADMIN_KEY`
  (Settings → Organization → Admin keys, `sk-admin-…`) och `DID_API_KEY`
  (`API_USER:API_PASSWORD`, Basic auth). Vanliga `OPENAI_API_KEY` duger inte.
- Genererade sajter som använder dossiern `openai-chat`/`rag-chat` kör på
  **kundens** nyckel — den förbrukningen syns aldrig i vår org.

## Nästa beslut

1. Ska de sekundära ytorna (wizard, audit, analyze, transcribe, inspector) också
   instrumenteras? De är egna användaråtgärder, inte delar av en generering — men
   de kostar pengar.
2. Ska Sajtagentens förbrukning rapporteras tillbaka från OpenClaw-gatewayen, och
   ska D-ID:s credits läsas före/efter i appen i stället för bara som saldo?
3. Ska `OPENAI_ADMIN_KEY` läggas i `.env.local` lokalt (aldrig i Vercel-env — den
   ger läsning på hela organisationen)?
4. Ska diamonds bli tokenbaserade, eller förblir de fast pris per åtgärd?
