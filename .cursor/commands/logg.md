# /logg — alla loggar för senaste prod-sajten

Hämtar **allt** som säger hur den senaste genererade användarsajten i **produktion** gick och ger **en** sammanfattande bedömning. Täcker produktionsdatabasen (prompt, generering, version, **telemetri**, pipeline-fel, OpenClaw bug-hunt-fynd, RAG-events, deploy-rad), **Vercel** build-/runtime-loggar via MCP, och **Fly** preview-host-loggar.

**Read-only mot prod.** Bara `SELECT`/SCAN+GET/`fly logs`. Aldrig skriv, deploy, secrets eller migration. Hämta prod-env via CLI — skriv inga secrets själv.

## Argument

| Kommando | Betydelse |
|---|---|
| `/logg` | Senaste sajten (senaste `engine_versions.created_at`). |
| `/logg <chatId>` | En specifik sajt/chat. |
| `/logg <chatId> limit=<N>` | Fler rader per loggtyp (default 100). |

## Flöde

1. **Env:** säkra prod-snapshot (`npm run env:pull:prod-snapshot` om `.env.vercel.production.pulled` saknas). Lös upp Vercel `teamId`/`projectId` (`.vercel/project.json` eller env) + Fly-åtkomst.
2. **Hitta senaste sajten:** `npm run db:latest:prod` → `chatId`, `versionId`, `projectId`, `previewUrl`, `created_at`, telemetri. (Inte `npm run db:latest -- --prod` — npm sväljer `--prod` och skriptet läser då tyst DEV.)
3. **Alla prod-DB-loggar:** `node scripts/db/dump-logs.mjs --json --env=.env.vercel.production.pulled --kinds=prompts,generations,versions,telemetry,errors,chats,oc,ragevents,deploys,defects,drain --chat=<chatId> --limit=100 --allow-insecure-ssl`.
   - **App-console (steg 2c) — XOR:** `--kinds=drain` med **minst en rad** = console-sanningen (greppa 3c där, kör inte `vercel logs` ovanpå). **Tom lista / skipped / tabell saknas** → fallback `vercel logs … --json` (tom query ≠ aktiv drain). Rapportera källa. Kinden bär ingen `chat_id` — korrelera på `log_timestamp`/`request_id`.
   - `defects` är ett **aggregat**, inte rader: `engine_version_error_logs` grupperade på `meta.defect.signature` med `occurrences`, `chats`, `first_seen`/`last_seen`. Kör den **en gång till utan `--chat`** för att se om körningens fel är chattspecifika eller ett återkommande plattformsfel — ett fel med högt `chats`-tal är det senare och hör hemma i rapportens bedömning, inte i "den här sajten hade otur".
   - **Redis-cache (valfritt, steg 2d):** `node scripts/db/dump-redis-cache.mjs --json --env=.env.vercel.production.pulled --chat=<chatId> --limit=50` (eller `npm run db:redis-cache -- …`). Deep Brief / preview-session (inkl. legacy `sandbox-preview:`). **`--chat` tar bara briefs vars nyckel innehåller chatId** — init-briefs (`anon`) hoppas över. **Handoffs hoppas över vid `--chat`** (ingen chatId i payloaden). Tom `--chat=` avvisas. Bara SCAN+GET.
4. **Vercel (MCP-server `vercel` projekt-scopad, eller `user-vercel`; `plugin-vercel-vercel` kan ge 403):** `get_runtime_errors` + `get_runtime_logs` för appen kring körningsfönstret; `get_deployment_build_logs` + `get_runtime_logs` för sajtens egen deploy (om `deploys` gav en rad). CLI-alternativ: `vercel logs <dpl>`. Använd MCP för felkluster/5xx — **inte** för att upprepa 2c:s console-grep. **DB-pool-hälsa:** sök runtime-loggarna efter `timeout exceeded when trying to connect` (→ *höj* `POSTGRES_POOL_MAX`) och `EMAXCONNSESSION` (→ *sänk* den / kör direkt-URL) — motsatta fixar; 0 träffar = frisk. Valfritt live-mått: Supabase-MCP `pg_stat_activity` (read-only).
5. **Fly:** `fly logs -a vm-fly-jakem --no-tail` + preview-host-loggar för sajtens `previewSessionId` (store-fil eller `/preview/logs/:id`).
6. **Syntes:** en svensk rapport — kort bedögning (lyckad/delvis/misslyckad) först, sedan fas-tabell + "ej tillgängligt" + säkerhets-%.

## Var telemetrin/loggarna hamnar

Prod skriver **inte** `logs/generationslogg/` (avstängt) och `data/runs/` går till ephemeral `/tmp`. Sanningen i prod är därför **Postgres + Vercel + Fly**. OpenClaw:s chat-bubblor persisteras inte (browser-only); det som finns i DB är `[BUGGFYND]` (`engine_version_error_logs`) och bug-hunt-fynd (`oc_debug_findings`).

## Anti-mönster

- Skriva till prod (deploy/secrets/migration) — kommandot är strikt read-only.
- Klistra in råa connection strings, tokens eller nycklar i svaret.
- Förväxla appens `VERCEL_PROJECT_ID` med användarsajtens per-deploy `vercel_project_id`.
- Anta att `logs/generationslogg/` finns för en prod-körning (den skapas bara lokalt).
- Anta att höjd `POSTGRES_POOL_MAX` = snabbare (poolstorlek = samtidighet, inte latens) eller vrida ratten utan att först se vilket av connect-timeout/EMAXCONNSESSION som faktiskt loggas.
- Köra **både** `--kinds=drain` **och** `vercel logs --json` för samma console-grep (XOR — se steg 2c).
- Hämta drain/console separat i `/logg-internet` när `/logg` redan körts (dubbelrapport).

## Projekt-skill

Fullständigt arbetsflöde, env-krav och rapportmall: [`.cursor/skills/logg/SKILL.md`](../skills/logg/SKILL.md).
