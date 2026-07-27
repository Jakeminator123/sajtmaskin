# Observability-script

Läsverktyg för att förstå hur en körning gick. Allt här är read-only.

| Script | Vad |
| --- | --- |
| [`last-generated-usersite.py`](last-generated-usersite.py) | Drar hem **alla** loggar för den senast genererade användarsajten (Postgres, Vercel, Fly preview-host, OpenAI, D-ID) och skriver en körningsmapp med sammanfattning + tokenrapport. |
| `control-stats-baseline-*.json` | Fryst jämförelsebas för `compare-control-stats.mjs`. |
| `compare-control-stats.mjs` | Jämför aktuell kontrollstatistik mot baseline. |
| `fault-matrix.mjs`, `index-error-log-rag.mjs`, `dump-fixer-registry.mjs`, `report-fault-promotion-candidates.mjs` | Fault-/RAG-verktyg. |

## `last-generated-usersite.py`

Samma insamling som `/logg`-skillen gör manuellt, men sparad på disk så körningar
kan jämföras.

```powershell
python -m pip install -r requirements.genlogs.txt   # en gång (pg8000)

npm run logg:site                                    # dev-env (.env.local) — default
npm run logg:site -- --prod                          # prod (.env.vercel.production.pulled)
npm run logg:site -- --chat <chatId> --open          # specifik chat + öppna rapporten
python scripts/observability/last-generated-usersite.py --db-only
```

Default är **dev**. Prod läses bara med `--prod` (eller `--env <fil>`), även om
prod-snapshotet ligger kvar på disk — så ingen råkar läsa produktionsdata av
misstag. Hämta snapshotet med `npm run env:pull:prod-snapshot` och radera det
när du är klar.

### Utdata

`data/gen-logs/<datum>_<chat>/` (gitignorerad). Högst `MAX_GEN_LOGS` mappar
sparas — default **10**, `--max-logs` överstyr.

| Fil | Innehåll |
| --- | --- |
| `summary.md` | Svensk sammanfattning: bedömning först, sedan identitet, tokens och källstatus. |
| `report.html` | Självständig rapport (canvas) — öppna direkt i webbläsaren. |
| `tokens.json` | Tokenrollup per modell/fas för **versionen**, chat-summan separat, vad som **inte** mäts, samt org-siffror. |
| `index.json` | Hela manifestet (identitet, fönster, signaler, källstatus, filer). |
| `db/*.json` | En fil per loggtyp: prompts, generations, versions, telemetry, errors, oc, ragevents, deploys, llmusage. |
| `vercel/`, `fly/`, `openai/`, `did/` | Råsvar per extern källa + logg-tails. |

### Vad som krävs per källa

| Källa | Env | Utan den |
| --- | --- | --- |
| Postgres | `POSTGRES_URL` (eller `..._NON_POOLING`/`STORAGE_*`/`DATABASE_URL`) | Skriptet avbryter — sajten kan inte identifieras |
| Vercel | `VERCEL_TOKEN` (+ `VERCEL_TEAM_ID`/`VERCEL_PROJECT_ID` eller `.vercel/project.json`) | Bygg-/runtime-loggar hoppas över |
| Fly preview-host | `SAJTMASKIN_PREVIEW_HOST_BASE_URL` + `SAJTMASKIN_PREVIEW_HOST_API_KEY` | Preview-loggar hoppas över |
| OpenAI | `OPENAI_ADMIN_KEY` (admin-nyckel, `sk-admin-…`) | Org-förbrukning hoppas över |
| D-ID | `DID_API_KEY` (`API_USER:API_PASSWORD`) | Credits hoppas över |

`OPENAI_API_KEY` räcker **inte** för usage/costs, och de publika
`NEXT_PUBLIC_AVATAR_*` är client-nycklar — inte D-ID:s server-API-nyckel.

### Gränser att inte missförstå

- **Två scope, aldrig blandade.** Körningens summa (`tokens.byModel`/`totals`)
  räknar bara rader som bär versionens `version_id` —
  `generation_telemetry` och `llm_usage` (sedan #613). Chat-summan
  (`tokens.chat`) tar allt hämtat och redovisas separat, eftersom
  `engine_generation_logs` saknar `version_id` och därför inte kan knytas till en
  enskild körning. En version med flera telemetri-rader (retry/repair) flaggas
  som möjlig dubbelräkning i `tokens.notes`.
- **Tokensumman är en undre gräns.** Bara LLM-anrop som loggar usage räknas.
  `tokens.json` → `coverage.unmeasuredPhases` listar resten. Sedan `llm_usage`
  (#613) täcks Deep Brief, verifier, RepairGate, embeddings, intent-klassificerare
  och prompt assist. Kvar omätt: de sekundära ytorna (wizard, audit, analyze,
  transcribe, inspector), Sajtagenten (OpenClaw-gatewayen kör utanför appen) och
  D-ID (credits, inte tokens). Om de ska mätas är ett öppet produktbeslut — se
  [`docs/plans/active/README.md`](../../docs/plans/active/README.md)
  § Väntar på ägarbeslut.
- **OpenAI:s org-siffra kan inte attribueras per körning eller slutanvändare.**
  Minsta bucket är en minut, och `group_by=user_id` betyder organisationens
  medlem — inte Sajtmaskins `users.id`.
- **D-ID mäter credits, inte tokens.** Saldot är ett nuläge, inte körningens pris.
- Kostnaden per rad är exakt för `llm_usage`-rader, som bär
  `cached_input_tokens` sedan #613. För äldre rader utan det fältet prissätts
  input som ocachad, vilket gör siffran till en **övre** gräns.

### Säkerhet

- Bara `SELECT` och `GET`. Ingen skrivning, ingen deploy, ingen migration.
- Secrets maskeras innan något skrivs (env-värden + mönster för
  provider-nycklar, JWT, Basic/Bearer och lösenord i connection strings).
- Körningsmappen är gitignorerad. `.env.vercel.production.pulled` läses men
  kopieras aldrig in i mappen.

### Tester

```powershell
npm run observability:test
```
