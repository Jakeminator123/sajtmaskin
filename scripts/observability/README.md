# Observability-script

Läsverktyg för att förstå hur en körning gick. Allt här är read-only.

| Script                                                                                                            | Vad                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`last-generated-usersite.py`](last-generated-usersite.py)                                                        | Drar hem **alla** loggar för den senast genererade användarsajten (Postgres, Vercel, Fly preview-host, OpenAI, D-ID) och skriver en körningsmapp med sammanfattning + tokenrapport. |
| `control-stats-baseline-*.json`                                                                                   | Fryst jämförelsebas för `compare-control-stats.mjs`.                                                                                                                                |
| `compare-control-stats.mjs`                                                                                       | Jämför aktuell kontrollstatistik mot baseline.                                                                                                                                      |
| `fault-matrix.mjs`, `index-error-log-rag.mjs`, `dump-fixer-registry.mjs`, `report-fault-promotion-candidates.mjs` | Fault-/RAG-verktyg.                                                                                                                                                                 |

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

| Fil                                  | Innehåll                                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `summary.md`                         | Svensk sammanfattning: bedömning först, sedan identitet, tokens och källstatus.                             |
| `report.html`                        | Självständig rapport (canvas) — öppna direkt i webbläsaren.                                                 |
| `tokens.json`                        | Tokenrollup per modell/fas för **versionen**, chat-summan separat, vad som **inte** mäts, samt org-siffror. |
| `index.json`                         | Hela manifestet (identitet, fönster, signaler, källstatus, filer).                                          |
| `db/*.json`                          | En fil per loggtyp: prompts, generations, versions, telemetry, errors, oc, ragevents, deploys, llmusage.    |
| `vercel/`, `fly/`, `openai/`, `did/` | Råsvar per extern källa + logg-tails.                                                                       |

### Vad som krävs per källa

| Källa            | Env                                                                                  | Utan den                                         |
| ---------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Postgres         | `POSTGRES_URL` (eller `..._NON_POOLING`/`STORAGE_*`/`DATABASE_URL`)                  | Skriptet avbryter — sajten kan inte identifieras |
| Vercel           | `VERCEL_TOKEN` (+ `VERCEL_TEAM_ID`/`VERCEL_PROJECT_ID` eller `.vercel/project.json`) | Bygg-/runtime-loggar hoppas över                 |
| Fly preview-host | `SAJTMASKIN_PREVIEW_HOST_BASE_URL` + `SAJTMASKIN_PREVIEW_HOST_API_KEY`               | Preview-loggar hoppas över                       |
| OpenAI           | `OPENAI_ADMIN_KEY` (admin-nyckel, `sk-admin-…`)                                      | Org-förbrukning hoppas över                      |
| D-ID             | `DID_API_KEY` (`API_USER:API_PASSWORD`)                                              | Credits hoppas över                              |

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
  D-ID (credits, inte tokens). **Beslutat 2026-07-28:** det är avsiktligt — se
  "Vad mätningen är till för" nedan.
- **OpenAI:s org-siffra kan inte attribueras per körning eller slutanvändare.**
  Minsta bucket är en minut, och `group_by=user_id` betyder organisationens
  medlem — inte Sajtmaskins `users.id`.
- **D-ID mäter credits, inte tokens.** Saldot är ett nuläge, inte körningens pris.
- **Kostnaden är en reproducerbar beräkning, inte fakturaraden.** Runtime sparar
  `cached_input_tokens` och `cache_write_tokens`; kostnadsmotorn prissätter
  ordinarie input, cache read, cache write och output separat och applicerar
  modellens dokumenterade long-context-uplift per anrop. Vissa äldre/estimerade
  modeller, avtalsrabatter, separat prissatta serververktyg och regionalt
  inference-påslag kan fortfarande avvika från leverantörens faktura. Därför
  stäms periodsumma av mot konto-API:t, medan per-version-attributionen kommer
  från `llm_usage`.

### Vad mätningen är till för (ägarbeslut 2026-08-12)

Tokenmätningen är både ett internt modell-/kostnadsunderlag och debiteringsgrund
för own-engine-genereringar. Det fulla kontraktet finns i
[`docs/architecture/llm-pipeline.md`](../../docs/architecture/llm-pipeline.md#generationskostnad-och-credit-debitering).

| Fråga                                                                                       | Beslut                                                                                                                                                                                                             | Varför                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ska credits dras från tokenkostnaden?                                                       | **Ja, för own-engine-genereringar.** Versionens beräknade leverantörskostnad × adminstyrt X-påslag omvandlas till hela credits. Det tidigare fasta priset är förhandsgrind och reservpris, inte dubbel debitering. | Usage-svaret är den enda källan som kan knyta alla fasers kostnad till Sajtmaskins användare/version. Pris, FX och multiplikator fryses i en revisionsbar snapshot; sena verifier-/repair-anrop debiterar bara positiv differens.                                                                    |
| Ska sekundära ytor (wizard, audit, analyze, transcribe, inspector) instrumenteras?          | **Inte som eget projekt.** I stället en stående regel: **en yta som drar diamonds ska logga `llm_usage` i samma PR som den börjar dra dem.**                                                                       | De omätta ytorna är operatörs-/backofficeverktyg. Att mäta dem nu ökar täckningsprocenten men ändrar inget beslut. Regeln fångar dem automatiskt den dag de blir användarbetalda — utan att någon behöver komma ihåg en backlog-rad.                                                                 |
| Ska OpenClaw-förbrukning rapporteras tillbaka, och D-ID:s credits läsas före/efter i appen? | **Skjuts upp.** Båda fortsätter redovisas **separat** (de finns redan i `/logg`), aldrig invävda i körningens tokensumma.                                                                                          | OpenClaw kör utanför appen och D-ID mäter credits, inte tokens. Att slå ihop dem till ett tal blandar två enheter och gör summan mindre sann, inte mer komplett. Vill man ha en gemensam kostnadsbild ska den byggas som en kostnadsvy i valuta — inte genom att tokenfältet får betyda flera saker. |

Konsekvens för `coverage.unmeasuredPhases`: den visar ytor som inte ingår i den
usage-baserade generationsdebiteringen. En ny användarbetald AI-yta ska logga
`llm_usage` och få en uttrycklig billing-owner i samma ändring.

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
