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
| **Telemetri** (scaffold/retry/autofix/quality gate/preview) | Postgres `generation_telemetry` | `--kinds=telemetry` |
| Pipeline-fel + `[BUGGFYND]` | Postgres `engine_version_error_logs` | `--kinds=errors` |
| Chat-metadata | Postgres `engine_chats` | `--kinds=chats` |
| **OpenClaw bug-hunt-fynd** (Mode B) | Postgres `oc_debug_findings` | `--kinds=oc` |
| RAG fault/fix-telemetri | Postgres `error_log_events` | `--kinds=ragevents` |
| Vercel-deploy för sajten | Postgres `deployments` (ids + url + status) | `--kinds=deploys` |
| Vercel **build**-loggar | Vercel-plattformen | MCP `get_deployment_build_logs` |
| Vercel **runtime**-loggar/fel | Vercel-plattformen | MCP `get_runtime_logs` / `get_runtime_errors` |
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
   - MCP `list_teams` → `list_projects` (server `plugin-vercel-vercel`).
3. **Fly-åtkomst** (för preview-loggar): `fly` CLI inloggad (app `vm-fly-jakem`), **eller**
   `SAJTMASKIN_PREVIEW_HOST_BASE_URL` + `SAJTMASKIN_PREVIEW_HOST_API_KEY`.

Saknas en källa: hoppa över den, notera "ej tillgänglig" i rapporten, fortsätt med resten.

## Arbetsflöde

Kopiera checklistan och bocka av:

```text
- [ ] 0. Env: prod-snapshot finns, Vercel-ids + Fly-åtkomst upplösta
- [ ] 1. Hitta senaste sajten (chatId, versionId, projectId, previewUrl, created_at)
- [ ] 2. Alla prod-DB-loggar för chatId (dump-logs, alla kinds)
- [ ] 3. Vercel: appens runtime-fel under körningsfönstret + sajtens deploy-loggar
- [ ] 4. Fly: preview-host-loggar för sajtens previewSessionId
- [ ] 5. Syntes: en rapport om hur körningen gick
```

### 1. Hitta senaste genererade sajten

```powershell
npm run db:latest -- --prod
```

Plocka ut `chatId`, `versionId`, `projectId`, `model`, `scaffoldId`, `previewUrl`,
`created_at` och telemetri-blocket. Spara `created_at` — det blir tidsfönstret för Vercel.
(Hoppa över detta steg om användaren gav `chatId`.)

### 2. Alla prod-DB-loggar för sajten

```powershell
node scripts/db/dump-logs.mjs --json `
  --env=.env.vercel.production.pulled `
  --kinds=prompts,generations,versions,telemetry,errors,chats,oc,ragevents,deploys `
  --chat=<chatId> --limit=100 --allow-insecure-ssl
```

Detta ger telemetri, fel, OpenClaw bug-hunt-fynd (`oc`), RAG-events (`ragevents`) och
deploy-raden (`deploys`) i ett svep. Notera från `deploys`: `vercel_deployment_id`,
`vercel_project_id`, `url`, `status` — de behövs i steg 3.

### 3. Vercel-loggar (MCP `plugin-vercel-vercel`)

**a) Sajtmaskin-appen** (server-side under själva genereringen) — använd appens
`projectId` + `teamId`, tidsfönster kring `created_at`:

- `get_runtime_errors` `{ projectId, teamId, since, until }` — grupperade felkluster (kör först).
- `get_runtime_logs` `{ projectId, teamId, environment: "production", level: ["error","warning"], since, until, limit: 100 }`.

**b) Sajtens egen deploy** (bara om steg 2 `deploys` gav en rad; användarsajter får eget
Vercel-projekt `sajtmaskin-<chatId>`):

- `get_deployment_build_logs` `{ idOrUrl: <url eller vercel_deployment_id>, teamId, errorsOnly: false }` — varför bygget gick/föll.
- `get_runtime_logs` `{ projectId: <vercel_project_id från deploys>, teamId, environment: "production", since, until }`.

Om ingen deploy-rad finns: sajten är sannolikt bara en preview (F2) — notera det och hoppa till steg 4.

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
| Telemetri | retry_count, autofix, quality_gate, preview_success, preflight_errors | generation_telemetry |
| Pipeline-fel | level/category/message (topp 5) | engine_version_error_logs |
| OpenClaw-fynd | severity/build_result/repair_outcome | oc_debug_findings (+ [BUGGFYND]) |
| Deploy | status, url | deployments |
| Vercel build | pass/fail + felrad | MCP get_deployment_build_logs |
| Vercel runtime | felkluster / 5xx | MCP get_runtime_errors/logs |
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
- Observability-regel: [`.cursor/rules/agent-observatory.mdc`](../../rules/agent-observatory.mdc)
- Preview-host & Fly: `preview-host/README.md`
- Env-sanning: [`docs/ENV.md`](../../../docs/ENV.md)
