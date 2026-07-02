# /logg — alla loggar för senaste prod-sajten

Hämtar **allt** som säger hur den senaste genererade användarsajten i **produktion** gick och ger **en** sammanfattande bedömning. Täcker produktionsdatabasen (prompt, generering, version, **telemetri**, pipeline-fel, OpenClaw bug-hunt-fynd, RAG-events, deploy-rad), **Vercel** build-/runtime-loggar via MCP, och **Fly** preview-host-loggar.

**Read-only mot prod.** Bara `SELECT`/GET/`fly logs`. Aldrig skriv, deploy, secrets eller migration. Hämta prod-env via CLI — skriv inga secrets själv.

## Argument

| Kommando | Betydelse |
|---|---|
| `/logg` | Senaste sajten (senaste `engine_versions.created_at`). |
| `/logg <chatId>` | En specifik sajt/chat. |
| `/logg <chatId> limit=<N>` | Fler rader per loggtyp (default 100). |

## Flöde

1. **Env:** säkra prod-snapshot (`npm run env:pull:prod-snapshot` om `.env.vercel.production.pulled` saknas). Lös upp Vercel `teamId`/`projectId` (`.vercel/project.json` eller env) + Fly-åtkomst.
2. **Hitta senaste sajten:** `npm run db:latest -- --prod` → `chatId`, `versionId`, `projectId`, `previewUrl`, `created_at`, telemetri.
3. **Alla prod-DB-loggar:** `node scripts/db/dump-logs.mjs --json --env=.env.vercel.production.pulled --kinds=prompts,generations,versions,telemetry,errors,chats,oc,ragevents,deploys --chat=<chatId> --limit=100 --allow-insecure-ssl`.
4. **Vercel (MCP `plugin-vercel-vercel`):** `get_runtime_errors` + `get_runtime_logs` för appen kring körningsfönstret; `get_deployment_build_logs` + `get_runtime_logs` för sajtens egen deploy (om `deploys` gav en rad).
5. **Fly:** `fly logs -a vm-fly-jakem --no-tail` + preview-host-loggar för sajtens `previewSessionId` (store-fil eller `/preview/logs/:id`).
6. **Syntes:** en svensk rapport — kort bedögning (lyckad/delvis/misslyckad) först, sedan fas-tabell + "ej tillgängligt" + säkerhets-%.

## Var telemetrin/loggarna hamnar

Prod skriver **inte** `logs/generationslogg/` (avstängt) och `data/runs/` går till ephemeral `/tmp`. Sanningen i prod är därför **Postgres + Vercel + Fly**. OpenClaw:s chat-bubblor persisteras inte (browser-only); det som finns i DB är `[BUGGFYND]` (`engine_version_error_logs`) och bug-hunt-fynd (`oc_debug_findings`).

## Anti-mönster

- Skriva till prod (deploy/secrets/migration) — kommandot är strikt read-only.
- Klistra in råa connection strings, tokens eller nycklar i svaret.
- Förväxla appens `VERCEL_PROJECT_ID` med användarsajtens per-deploy `vercel_project_id`.
- Anta att `logs/generationslogg/` finns för en prod-körning (den skapas bara lokalt).

## Projekt-skill

Fullständigt arbetsflöde, env-krav och rapportmall: [`.cursor/skills/logg/SKILL.md`](../skills/logg/SKILL.md).
