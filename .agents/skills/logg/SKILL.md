---
name: logg
description: Hämta och sammanfatta read-only prodloggar för senaste sajt eller angiven chatId. Use for /logg or explicit production-log investigation.
---

# /logg — alla loggar för senaste prod-sajten

Samla allt som säger hur den senaste genererade användarsajten i produktion gick
— prod-DB, telemetri, OpenClaw-fynd, Vercel och Fly preview-host — och ge **en**
bedömning. Strikt read-only (se Guardrails).

| Kommando | Betydelse |
|---|---|
| `/logg` | Senaste sajten (senaste `engine_versions.created_at`) |
| `/logg <chatId>` | Given chat; hoppa över steg 1 |
| `/logg <chatId> limit=<N>` | Fler rader per loggtyp (default 100) |

Prod skriver inte `logs/generationslogg/` och `data/runs/` hamnar i ephemeral
`/tmp`; sanningen är Postgres (`scripts/db/dump-logs.mjs`), Vercel, Fly och
valfritt Redis. OpenClaws chattbubblor persisteras inte — bara `[BUGGFYND]` i
`engine_version_error_logs` och `oc_debug_findings`.

## Förutsättningar

1. Prod-DB-snapshot (hämta via CLI, skriv aldrig secrets själv):
   `if (-not (Test-Path .env.vercel.production.pulled)) { npm run env:pull:prod-snapshot }`
2. Vercel `teamId` + `projectId` för Sajtmaskin-appen: `.vercel/project.json`
   (`orgId` = teamId), `VERCEL_PROJECT_ID`/`VERCEL_TEAM_ID` i env-filerna eller
   MCP `list_teams` → `list_projects`.
3. Fly: `fly` CLI inloggad mot `vm-fly-jakem`, eller
   `SAJTMASKIN_PREVIEW_HOST_BASE_URL` + `SAJTMASKIN_PREVIEW_HOST_API_KEY`.

Saknas en källa: hoppa över den, skriv den under "Ej tillgängligt" och fortsätt.

## Arbetsflöde

```text
- [ ] 0. Env, Vercel-ids och Fly-åtkomst
- [ ] 1. Senaste sajten (chatId, versionId, projectId, previewUrl, created_at)
- [ ] 1b. Bootfält först om previewn ser död ut
- [ ] 2. Prod-DB-loggar för chatId + 2b defekter + 2c console (XOR) + ev. 2d Redis
- [ ] 3. Vercel: felkluster/5xx, sajtens deploy, DB-pool
- [ ] 4. Fly preview-host för sajtens previewSessionId
- [ ] 5. En rapport
```

### 1. Hitta sajten

```powershell
npm run db:latest:prod
```

Skriv **inte** `npm run db:latest -- --prod`: npm gör `--prod` till sin egen
`--production` och du läser tyst DEV. Alternativ: `node scripts/db/latest-site.mjs --prod`.
Plocka `chatId`, `versionId`, `projectId`, `model`, `scaffoldId`, `previewUrl`,
`created_at` (tidsfönstret) och telemetriblocket.

Prod-DB bevisar inte Production-deploy: Preview/Development använder DEV,
Production PROD (`config/db-targets.json`), och äldre preview-rader kan finnas i
PROD. Bekräfta miljön mot `deployments`-radens `url`/`vercel_project_id` eller
`created_at` i steg 3; annars skriv **«miljö ej bekräftad»** eller be om `chatId`.

### 1b. Bootfält först

När `preview_success` är `null`/`false`: läs `generation_telemetry.preview_success`
och `preview_blocking_reason`, sedan `engine_version_error_logs` med
`category=preview` och `meta.source=preview_readiness_probe` (hostens
`waitForReady`-text), först därefter Fly. Tomt bootfält betyder "inget kvitto",
inte "ingen kolumn"; `pollAndApplyPreviewReadinessOutcome` fyller fältet headless.

### 2. Prod-DB för sajten

```powershell
node scripts/db/dump-logs.mjs --json `
  --env=.env.vercel.production.pulled `
  --kinds=prompts,generations,versions,telemetry,errors,chats,oc,ragevents,deploys,defects `
  --chat=<chatId> --limit=100 --allow-insecure-ssl
```

Notera från `deploys`: `vercel_deployment_id`, `vercel_project_id`, `url`,
`status` (steg 3).

**2b. Chattens eller plattformens fel?** Kör samma kommando med
`--kinds=defects --limit=40` och utan `--chat`. En signatur med högt `chats`-tal
är ett plattformsfel, en signatur i bara en chatt är chattspecifik; `first_seen`
visar regression.

**2c. Appens console-rader — en källa.** Kör samma kommando med
`--kinds=drain --limit=100` och utan `--chat`; kinden saknar `chat_id`, så
korrelera på `log_timestamp` mot `created_at` eller på `request_id`.

- Drain har rader inom körningens fönster → det är console-sanningen; kör inte
  `vercel logs` för samma grepp. Rader men inga i fönstret: notera «drain aktiv
  men utan rader i fönstret» och hämta `vercel logs` för fönstret.
- Drain tom/saknas/skippad → fallback, och skriv
  `App-console: vercel logs (drain tom/ej aktiv)`. En tom query bevisar inte att
  drainen är aktiv (`VERCEL_LOG_DRAIN_ENABLED`/`VERCEL_LOG_DRAIN_SECRET` kan saknas).

```powershell
New-Item -Force -ItemType Directory .cursor/tmp | Out-Null
vercel logs https://sajtmaskin.vercel.app --json | Set-Content -Encoding utf8 .cursor/tmp/app-runtime.jsonl
```

| Mönster | Betyder |
|---|---|
| `[product-postcheck] skipped` | Postcheck kraschade — läs `skippedReason` i DB |
| `free space in temporary directory` · `AllocateRingBuffer` · `Thumbnail capture failed` | `/tmp` slut → Chromium dör |
| `stillMissing: [` | scaffold-skyddad fil kunde inte återinjiceras |
| `Vercel Runtime Timeout Error` | rutt slog i `maxDuration` |
| `[CSP Violation]` | egen CSP blockerar resurs |
| `AI SDK Warning` | modell-/parameterproblem |

**2d. Redis (valfritt).** Bara SCAN + GET; prefix default `prod:` för prod-env.
`--chat` tar bara briefs vars nyckel har chatId (init-briefs är `anon`) och
hoppar över handoffs (id-only-nycklar); tom `--chat=` avvisas.

```powershell
node scripts/db/dump-redis-cache.mjs --json --env=.env.vercel.production.pulled `
  --kinds=briefs,handoffs,previews --chat=<chatId> --limit=50
```

### 3. Vercel

MCP-servern `vercel` är projekt-scopad; `plugin-vercel-vercel` kan ge 403 — byt
server eller använd `vercel logs <dpl>` (repot är länkat).

- **Appen** (appens `projectId` + `teamId`, fönster kring `created_at`):
  `get_runtime_errors` först, sedan `get_runtime_logs` med
  `environment: "production"`, `level: ["error","warning"]`, `limit: 100`.
  Använd för felkluster/5xx, inte för att greppa 2c:s mönster en gång till.
- **Sajtens deploy** (bara om `deploys` gav en rad; projekt `sajtmaskin-<chatId>`):
  `get_deployment_build_logs` `{ idOrUrl, teamId, errorsOnly: false }` och
  `get_runtime_logs` med `vercel_project_id` från `deploys`. Ingen rad: sannolikt
  bara preview (F2) — notera och gå till steg 4.
- **DB-pool:** sök `timeout exceeded when trying to connect` och
  `EMAXCONNSESSION: max clients reached` i appens loggar. 0 träffar = inga i det
  hämtade fönstret, inte «poolen är frisk». Valfritt read-only `pg_stat_activity`
  via Supabase-MCP (nuläge, inte körningsfönstret). Felen kräver motsatt fix:
  connect-timeout → höj `POSTGRES_POOL_MAX`; `EMAXCONNSESSION` → sänk den eller
  använd `POSTGRES_URL_NON_POOLING`. Båda 0 → lämna default (3); se
  `src/lib/db/client.ts`.

### 4. Fly preview-host

Preview-URL `{PREVIEW_BASE_URL}/{chatId}`; loggarna nycklas på `previewSessionId`.

```powershell
fly logs -a vm-fly-jakem --no-tail
fly ssh console -a vm-fly-jakem -C "cat /data/preview-host-store.json"
```

Utan CLI: `curl.exe -s -H "Authorization: Bearer <key>" "<base>/admin/sessions"`
för att hitta sessionen, sedan `"<base>/preview/logs/<previewSessionId>"`.

### 5. Rapport (svenska, bedömning först)

```text
## Senaste sajten: <title> (<created_at>)
Identitet: chatId=… · versionId=… · projectId=… · model=… · scaffold=… · previewUrl=…

Bedömning: <lyckad / delvis / misslyckad> — <1–2 meningar varför>

| Fas | Signal | Källa |
|---|---|---|
| Prompt/brief | build_intent, model_tier | prompt_logs |
| Generering | tokens, duration, success | engine_generation_logs |
| Telemetri | retry_count, autofix, quality_gate, preview_success, preflight_errors, `meta` | generation_telemetry |
| Pipeline-fel | level/category/message (+ `meta`) | engine_version_error_logs |
| F3 env-readiness | `category=f3-readiness:missing-env` → `meta.missingByIntegration` | engine_version_error_logs |
| Plan-läge | `plan_mode_turn_entry`/`_exit` (`meta.outcome`), `plan_mode_credit_gate_rejected`; entry utan exit = turen dog tyst | prompt_logs |
| OpenClaw | severity/build_result/repair_outcome | oc_debug_findings (+ [BUGGFYND]) |
| Deploy / Vercel build / runtime | status, url, felrad, felkluster/5xx | deployments + MCP |
| App-console (2c) | postcheck, `/tmp`, `stillMissing`, timeout, CSP — en källa | drain eller `vercel logs` |
| DB-pool | connect-timeout / EMAXCONNSESSION (0 = inga i fönstret) | Vercel runtime + pg_stat_activity |
| Preview (Fly) | boot/install/exit-tail | preview-host-loggar |

Miljö: <Production / Preview / ej bekräftad> — <hur>
Fönster: <since>–<until>
Ej tillgängligt: <källor och varför>
Säkerhet: <%>. Verifierat mot <källor>; inte live-kört mot X.
```

Skriv «inga träffar i tillgängligt fönster», aldrig «inga fel finns».

## Guardrails

- Read-only mot prod: bara `SELECT`, SCAN+GET och loggläsning; aldrig write,
  deploy, secrets-set eller migration.
- Inga secrets i filer eller svar; prod-env hämtas bara via
  `npm run env:pull:prod-snapshot`. Stage aldrig `.env.vercel.production.pulled`
  eller `.vercel/project.json`.
- Appens `VERCEL_PROJECT_ID` ≠ användarsajtens `vercel_project_id`.
- Gamla loggar är historik, inte bevis för nuvarande master
  (`agent-observatory.mdc` för lokala körningar).
- Drain-mottagare: `src/app/api/drains/vercel/route.ts`, setup i
  [`docs/runbooks/vercel-log-drain.md`](../../../docs/runbooks/vercel-log-drain.md).
