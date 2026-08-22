---
name: logg
description: >-
  Hämtar ALLA loggar för den senaste genererade användarsajten i produktion (eller en angiven chatId) och sammanfattar hur körningen gick. Täcker produktionsdatabasen (prompt/generation/version/telemetri/fel + OpenClaw bug-hunt-fynd + RAG-events + deploy-rad), Vercel build-/runtime-loggar via MCP, och Fly preview-host-loggar. Use when the user runs /logg, says "logg", or asks to pull/inspect all logs for the latest generated site in prod.
---

# /logg — alla loggar för senaste prod-sajten

Mål: när användaren kör `/logg`, samla **allt** som säger hur den senaste genererade
användarsajten i **produktion** gick — produktionsdatabas, telemetri, OpenClaw-fynd,
Vercel-loggar och Fly preview-host-loggar — och ge **en** sammanfattande bedömning.

Read-only. Skriv aldrig till prod. Hämtar bara. Se Guardrails.

## Trigger & argument

| Kommando | Betydelse |
|---|---|
| `/logg` | Senaste genererade sajten i prod (senaste `engine_versions.created_at`). |
| `/logg <chatId>` | En specifik sajt/chat. Hoppa över "hitta senaste" (steg 1), använd angivet `chatId`. |
| `/logg <chatId> limit=<N>` | Fler rader per loggtyp (default 100). |

## Var loggarna hamnar (hämta varje åtkomlig källa)

| Loggtyp | Destination | Åtkomst i `/logg` |
|---|---|---|
| Prompt-events | Postgres `prompt_logs` | `dump-logs --kinds=prompts` |
| Generering (model/tokens/tid) | Postgres `engine_generation_logs` | `--kinds=generations` |
| Versioner (verify/release/preview_url) | Postgres `engine_versions` | `--kinds=versions` |
| **Telemetri** (scaffold/retry/autofix/quality gate/preview + fas-tider i `meta`) | Postgres `generation_telemetry` | `--kinds=telemetry` |
| Pipeline-fel + `[BUGGFYND]` | Postgres `engine_version_error_logs` | `--kinds=errors` |
| **Defektklasser med räknare** (samma fel över tid/chattar) | Samma tabell, grupperad på `meta.defect.signature` | `--kinds=defects` |
| Chat-metadata | Postgres `engine_chats` | `--kinds=chats` |
| **OpenClaw bug-hunt-fynd** (Mode B) | Postgres `oc_debug_findings` | `--kinds=oc` |
| RAG fault/fix-telemetri | Postgres `error_log_events` | `--kinds=ragevents` |
| Vercel-deploy för sajten | Postgres `deployments` (ids + url + status) | `--kinds=deploys` |
| Vercel **build**-loggar | Vercel-plattformen | MCP `get_deployment_build_logs` |
| Vercel **runtime**-loggar/fel | Vercel-plattformen | MCP `get_runtime_logs` / `get_runtime_errors` |
| **Appens `console.warn`/`console.error`** (postcheck-krascher, `/tmp`-slut, droppade scaffold-filer, rutt-timeouts, CSP) | Postgres `vercel_log_drain_events` **eller** Vercel-plattformen — **XOR** | `--kinds=drain` om rader finns (2c); annars `vercel logs --json` |
| **DB-pool-hälsa** (connect-timeout / EMAXCONNSESSION) | Vercel runtime-logg + Postgres `pg_stat_activity` | MCP `get_runtime_logs` (sök felsträngarna) + valfri Supabase-MCP `pg_stat_activity` |
| Fly preview-host runtime-logg | Fly VM `vm-fly-jakem` | `fly logs` / store-fil / `/preview/logs/:id` |
| Per-run fil-logg (dev) | `logs/generationslogg/<run>/` | **bara om körningen skedde lokalt** — i prod avstängt |

> Telemetrin är per **version** (`generation_telemetry.version_id`, `chat_id`). Prod skriver
> **inte** `logs/generationslogg/` (avstängt) och `data/runs/` går till ephemeral `/tmp`. För
> prod är sanningen därför Postgres + Vercel + Fly. OpenClaw:s **chat-bubblor** i widgeten
> persisteras inte (browser-only) — det som finns i DB är `[BUGGFYND]` (`engine_version_error_logs`)
> och bug-hunt-fynd (`oc_debug_findings`).

## Förutsättningar (env)

Kör detta först. Skriv inga secrets själv — hämta prod-env via CLI.

1. **Prod-DB-snapshot** (krävs för alla `--prod`-läsningar):

```powershell
if (-not (Test-Path .env.vercel.production.pulled)) { npm run env:pull:prod-snapshot }
```

2. **Vercel MCP-ids** (för build/runtime-loggar). Behöver `teamId` + `projectId` för
   **Sajtmaskin-appen**:
   - Läs `.vercel/project.json` → `projectId` + `orgId` (orgId = teamId), eller
   - Läs `VERCEL_PROJECT_ID` / `VERCEL_TEAM_ID` från `.env.local` / `.env.vercel.production.pulled`, eller
   - MCP `list_teams` → `list_projects` (server `vercel` projekt-scopad, eller `user-vercel`).
3. **Fly-åtkomst** (för preview-loggar): `fly` CLI inloggad (app `vm-fly-jakem`), **eller**
   `SAJTMASKIN_PREVIEW_HOST_BASE_URL` + `SAJTMASKIN_PREVIEW_HOST_API_KEY`.

Saknas en källa: hoppa över den, notera "ej tillgänglig" i rapporten, fortsätt med resten.

## Arbetsflöde

Kopiera checklistan och bocka av:

```text
- [ ] 0. Env: prod-snapshot finns, Vercel-ids + Fly-åtkomst upplösta
- [ ] 1. Hitta senaste sajten (chatId, versionId, projectId, previewUrl, created_at)
- [ ] 2. Alla prod-DB-loggar för chatId (inkl. `drain`) + 2c XOR-regel för console
- [ ] 3. Vercel: felkluster/5xx + sajtens deploy-loggar + DB-pool — **inte** omgreppa 2c:s console-mönster
- [ ] 4. Fly: preview-host-loggar för sajtens previewSessionId
- [ ] 5. Syntes: en rapport om hur körningen gick
```

### 1. Hitta senaste genererade sajten

```powershell
npm run db:latest:prod
```

> OBS: skriv INTE `npm run db:latest -- --prod`. npm expanderar `--prod` till sin
> egen `--production`-flagga (även efter `--`), argumentet når aldrig skriptet
> och du läser tyst DEV-databasen. Alias:et ovan (eller
> `node scripts/db/latest-site.mjs --prod`) är den säkra vägen.

Plocka ut `chatId`, `versionId`, `projectId`, `model`, `scaffoldId`, `previewUrl`,
`created_at` och telemetri-blocket. Spara `created_at` — det blir tidsfönstret för Vercel.
(Hoppa över detta steg om användaren gav `chatId`.)

### 2. Alla prod-DB-loggar för sajten

```powershell
node scripts/db/dump-logs.mjs --json `
  --env=.env.vercel.production.pulled `
  --kinds=prompts,generations,versions,telemetry,errors,chats,oc,ragevents,deploys,defects,drain `
  --chat=<chatId> --limit=100 --allow-insecure-ssl
```

Detta ger telemetri, fel, OpenClaw bug-hunt-fynd (`oc`), RAG-events (`ragevents`) och
deploy-raden (`deploys`) i ett svep. Notera från `deploys`: `vercel_deployment_id`,
`vercel_project_id`, `url`, `status` — de behövs i steg 3.

#### 2b. Är felet chattens eller plattformens?

`defects` grupperar `engine_version_error_logs` på `meta.defect.signature` i stället
för att lista händelser. Kör den **en gång till utan `--chat`**:

```powershell
node scripts/db/dump-logs.mjs --json `
  --env=.env.vercel.production.pulled `
  --kinds=defects --limit=40 --allow-insecure-ssl
```

Jämför signaturerna från chatt-körningen mot den repo-breda listan. En signatur med
högt `chats`-tal är ett **plattformsfel** som råkade synas i den här sajten — det hör
hemma i rapportens bedömning, inte som "den här genereringen gick dåligt". En signatur
som bara finns i en chatt är chattspecifik. `first_seen` visar om felklassen är ny
(regression efter en deploy) eller gammal.

#### 2c. Appens egna console-rader — **en** källa, inte två

`engine_version_error_logs` innehåller bara det pipelinen medvetet persisterar.
Rutternas egna `console.warn`/`console.error` (kraschad postcheck, `/tmp`-slut,
droppade scaffold-filer, rutt-timeouts, CSP) finns antingen i Postgres via Log
Drain **eller** på Vercel-plattformen. **Aldrig båda i samma rapport.**

**Ordning (XOR):**

1. Hämta drain först:

```powershell
node scripts/db/dump-logs.mjs --json `
  --env=.env.vercel.production.pulled `
  --kinds=drain --limit=100 --allow-insecure-ssl
```

2. **Om drain-kinden returnerar minst en rad:** behandla det som console-sanningen.
   Sök mönstren nedan i `drain`-raderna. **Kör inte** `vercel logs … --json` för
   samma grepp — det dubblerar.
3. **Om drain är tom, saknas eller skippas** (`[]`, `skipped.drain`, tabell saknas,
   eller ingest inte konfigurerad): falla tillbaka till

```powershell
vercel logs https://sajtmaskin.vercel.app --json | Set-Content -Encoding utf8 .cursor/tmp/app-runtime.jsonl
```

   Scratch hör hemma i `.cursor/tmp/`, aldrig som `.cursor/tmp-*` i `.cursor/`-roten.

   och skriv i rapporten `App-console: vercel logs (drain tom/ej aktiv)`.
   En tom lyckad query betyder **inte** att drainen är aktiv — tabellen kan
   finnas efter migration medan `VERCEL_LOG_DRAIN_ENABLED=true` /
   `VERCEL_LOG_DRAIN_SECRET` fortfarande saknas.

Kinden bär **ingen** `chat_id` — korrelera på `log_timestamp` mot körningens
`created_at` eller på `request_id`.

Sök minst efter:

| Mönster | Betyder |
|---|---|
| `[product-postcheck] skipped` | Postcheck kraschade — läs `skippedReason` i DB |
| `free space in temporary directory` · `AllocateRingBuffer` | `/tmp` slut → Chromium dör |
| `Thumbnail capture failed` | samma rotorsak |
| `stillMissing: [` | scaffold-skyddad fil kunde inte återinjiceras |
| `Vercel Runtime Timeout Error` | rutt slog i `maxDuration` |
| `[CSP Violation]` | egen CSP blockerar resurs |
| `AI SDK Warning` | modell-/parameterproblem |

### 3. Vercel-loggar (MCP-server `vercel` — projekt-scopad, eller `user-vercel`)

> Servern `vercel` i `.cursor/mcp.json` är projekt-scopad (`mcp.vercel.com/jakeminator123s-projects/sajtmaskin`).
> `plugin-vercel-vercel` kan ge 403 — byt då server. CLI-alternativ: `vercel logs <dpl>` (repot är länkat, `.vercel/repo.json`).

**a) Sajtmaskin-appen** (server-side under själva genereringen) — använd appens
`projectId` + `teamId`, tidsfönster kring `created_at`:

- `get_runtime_errors` `{ projectId, teamId, since, until }` — grupperade felkluster (kör först).
- `get_runtime_logs` `{ projectId, teamId, environment: "production", level: ["error","warning"], since, until, limit: 100 }`.

  Använd MCP här för felkluster/5xx — **inte** som ersättning för steg 2c:s
  console-grep. Om 2c redan läste drain, greppa inte samma 3c-mönster igen ur MCP.

**b) Sajtens egen deploy** (bara om steg 2 `deploys` gav en rad; användarsajter får eget
Vercel-projekt `sajtmaskin-<chatId>`):

- `get_deployment_build_logs` `{ idOrUrl: <url eller vercel_deployment_id>, teamId, errorsOnly: false }` — varför bygget gick/föll.
- `get_runtime_logs` `{ projectId: <vercel_project_id från deploys>, teamId, environment: "production", since, until }`.

Om ingen deploy-rad finns: sajten är sannolikt bara en preview (F2) — notera det och hoppa till steg 4.

**c) Appens `console.warn`/`console.error` — se steg 2c (XOR).**

Gör **inte** en separat obligatorisk `vercel logs`-körning här. Console-sanningen
hämtas i 2c: drain om den har rader, annars `vercel logs`. Om 2c redan läste drain,
upprepa inte samma 3c-mönster ur MCP/`vercel logs`.

**d) DB-pool-hälsa** (återkommande fråga — logga den så den inte utreds från noll varje gång):

- Sök i appens runtime-loggar från (a) efter `timeout exceeded when trying to connect` och `EMAXCONNSESSION: max clients reached`. **0 träffar = poolen frisk** (normalläget; koden försvarar sig redan mot svälten).
- Valfritt live-mått (om Supabase-MCP är inloggad, **read-only**): `pg_stat_activity` — aktiva vs idle backends mot poolerns tak (Pro ~60, Free ~15 sessioner). Detta är *nuläge*, inte körningsfönstret.
- **Tolkning — vrid inte `POSTGRES_POOL_MAX` blint, de två felen kräver MOTSATT fix:** `timeout exceeded when trying to connect` = per-instans-poolen för liten → *höj* `POSTGRES_POOL_MAX`. `EMAXCONNSESSION` = för många sessioner totalt (instanser × max) → *sänk* den / kör direkt-URL (`POSTGRES_URL_NON_POOLING`). Poolstorlek = samtidighet, **inte** hastighet — fler anslutningar gör inte queries snabbare. Mät vilket fel du har innan du ändrar; är båda 0 = lämna default (3). Bakgrund: backlog **M#db1** + `src/lib/db/client.ts`.

### 4. Fly preview-host-loggar

Preview-URL:en är `{PREVIEW_BASE_URL}/{chatId}`; runtime-loggarna nycklas på
`previewSessionId`. Välj en väg:

**CLI (allt på en gång):**

```powershell
fly logs -a vm-fly-jakem --no-tail
fly ssh console -a vm-fly-jakem -C "cat /data/preview-host-store.json"
```

Sök i store-filen efter sessionen som hör till `chatId` → läs dess `logs`-array.

**HTTP (om ingen fly-CLI):**

```powershell
$base = $env:SAJTMASKIN_PREVIEW_HOST_BASE_URL   # t.ex. https://vm-fly-jakem.fly.dev
$key  = $env:SAJTMASKIN_PREVIEW_HOST_API_KEY
curl.exe -s -H "Authorization: Bearer $key" "$base/admin/sessions"
# hitta previewSessionId för chatId, sedan:
curl.exe -s -H "Authorization: Bearer $key" "$base/preview/logs/<previewSessionId>"
```

### 5. Syntes — hur gick körningen?

Ge **en** svensk rapport. Kort bedömning först, sedan detaljer.

```text
## Senaste sajten: <title> (<created_at>)
Identitet: chatId=… · versionId=… · projectId=… · model=… · scaffold=… · previewUrl=…

Bedömning: <lyckad / delvis / misslyckad> — <1–2 meningar varför>

| Fas | Signal | Källa |
|---|---|---|
| Prompt/brief | build_intent, model_tier | prompt_logs |
| Generering | tokens, duration, success | engine_generation_logs |
| Telemetri | retry_count, autofix, quality_gate, preview_success, preflight_errors, **`meta`** (`streamMs`, `postStreamSteps`, `buildSpec`, …) | generation_telemetry |
| Pipeline-fel | level/category/message (+ `meta` när relevant) | engine_version_error_logs |
| F3 env-readiness | `category=f3-readiness:missing-env` → `meta.missingByIntegration` | engine_version_error_logs |
| Plan-lägets turer | `event=plan_mode_turn_entry` / `plan_mode_turn_exit` (→ `meta.outcome`) · `plan_mode_credit_gate_rejected`. Entry **utan** exit = turen dog tyst mellan planner-start och persistering | prompt_logs |
| OpenClaw-fynd | severity/build_result/repair_outcome | oc_debug_findings (+ [BUGGFYND]) |
| Deploy | status, url | deployments |
| Vercel build | pass/fail + felrad | MCP get_deployment_build_logs |
| Vercel runtime | felkluster / 5xx | MCP get_runtime_errors/logs |
| App-console (2c) | postcheck-krasch, `/tmp`-slut, `stillMissing`, rutt-timeout, CSP — **en** källa | `--kinds=drain` om rader finns, annars `vercel logs --json` — aldrig båda |
| DB-pool | connect-timeout / EMAXCONNSESSION-antal (0 = frisk) · ev. pg_stat_activity-peak | Vercel runtime + pg_stat_activity |
| Preview (Fly) | boot/install/exit-tail | preview-host-loggar |

Ej tillgängligt: <lista källor som saknades och varför>
Säkerhet: <%>. Verifierat mot <källor>; inte live-kört mot X.
```

## Guardrails

- **Read-only mot prod.** Bara `SELECT`/GET/`fly logs`. Aldrig skriv, deploy, secrets-set eller migration.
- Skriv **inte** secrets till filer. Hämta prod-env via `npm run env:pull:prod-snapshot` (CLI äger creds).
- `.env.vercel.production.pulled` och `.vercel/project.json` är gitignored — stage dem aldrig.
- Klistra inte in råa connection strings, tokens eller nycklar i svaret.
- Appens `VERCEL_PROJECT_ID` ≠ användarsajtens `vercel_project_id` (per-deploy). Använd rätt id i rätt anrop.
- Gamla loggar är historik, inte bevis för nuvarande master (jfr `agent-observatory.mdc`).

## Related

- Kommando: [`.cursor/commands/logg.md`](../../commands/logg.md)
- Read-only DB-dumper: `scripts/db/dump-logs.mjs` · senaste sajt: `scripts/db/latest-site.mjs`
- Log Drain-mottagare (`--kinds=drain`): `src/lib/vercel/vercel-log-drain.ts`, `src/app/api/drains/vercel/route.ts` · setup + URL: [`docs/runbooks/vercel-log-drain.md`](../../../docs/runbooks/vercel-log-drain.md)
- Observability-regel: [`.cursor/rules/agent-observatory.mdc`](../../rules/agent-observatory.mdc)
- Preview-host & Fly: `preview-host/README.md`
- Env-sanning: [`docs/ENV.md`](../../../docs/ENV.md)
