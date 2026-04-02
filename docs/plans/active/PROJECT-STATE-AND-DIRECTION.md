# Project state & direction (aktiv)

Kort aktiv status. Behåll bara det som fortfarande styr arbete nu.

**Senast:** 2026-04-02  
**Historik:** gamla handoffs, procenttabeller och stangda korplaner ligger i `git log` och `docs/plans/avklarat/`.  
**Verifiering efter kod:** `npm run typecheck` och `npx vitest run`.

---

## 1. Kanoniska källor

| Behov | Fil |
|------|-----|
| Preview, tierer, deploy, persistens | [`docs/architecture/preview-deploy.md`](../../architecture/preview-deploy.md) |
| Generation och SSE | [`docs/architecture/builder-generation.md`](../../architecture/builder-generation.md) |
| System och builder | [`docs/architecture/system-overview.md`](../../architecture/system-overview.md) |
| Repo-layout och mappar | [`docs/architecture/repo-tree.md`](../../architecture/repo-tree.md), [`docs/architecture/repository-and-platform.md`](../../architecture/repository-and-platform.md) |
| Env | [`docs/ENV.md`](../../ENV.md), `config/env-policy.json`, `src/lib/env.ts` |
| Terminologi | [`.cursor/rules/terminology.mdc`](../../../.cursor/rules/terminology.mdc) |

---

## 2. Sant just nu

- **Own-engine** är enda aktiva codegen-vägen. `v0-sdk` och `V0_API_KEY` är borta ur runtime.
- **Tier-2 live-preview** är primärt `preview_host` / VM (Fly.io). `sandbox` lever kvar som **legacy-namn** i DB-kolumner, API-routes, Redis-nycklar och TypeScript-typer — ny kod ska använda preview/VM/tier-2-terminologi.
- **Vercel Sandbox** (`@vercel/sandbox`) används **enbart** för quality gate (typecheck/build-verifiering), inte som preview-provider.
- **AI Gateway** (`ai-gateway.vercel.sh`) fasas ut. Huvudkedjan använder direkt OpenAI/Anthropic API. Tre routes har fortfarande gateway-beroende (`inspector-ai-match`, `projects/[id]/analyze`, `text/analyze` fallback). `AI_GATEWAY_API_KEY` ska tas bort när dessa migrats.
- **Tre lager får inte blandas ihop:** preflight, runtime preview och build-verifiering.
- **Kärnkedjan** own-engine -> finalize -> tier-2 preview -> iframe är levererad. Detaljer och kodpekare finns i `preview-deploy.md`.
- **Kanonisk sparad artifact** är `engine_versions.files_json`. `project_data` är snapshot/UI-bro, inte source of truth för sparad kod.
- **Publika preview-svar** ska använda `previewUrl`, inte `demoUrl`.
- **Export** går genom `buildExportableProject()`.

---

## 3. Öppet nu

| Spår | Vad som faktiskt är kvar | Grov insats |
|-----|---------------------------|-------------|
| K-019 kontinuitet | Lås merge-policy för `orchestration_snapshot` och bestäm om snapshot/debug-UI eller sync create-path faktiskt ska göras | 0.5 dag om det bara blir policy + städning; 1-2 dagar om UI eller sync-flöde ska med |
| Preview-kvalitet | Ersätt placeholder/degraded preview för de integrationer som fortfarande inte blir bra nog | 1-3 dagar plus manuell verifiering |
| GitHub-export | Bara om den fortfarande behövs; läs kontraktet först så att Postgres + `files_json` fortsatt är kanon | cirka 1-2 dagar efter beslut |
| AI Gateway-avveckling | Migrera `inspector-ai-match`, `projects/[id]/analyze` och `text/analyze` fallback till direkt OpenAI API; ta bort `AI_GATEWAY_API_KEY` från env-schema och `pickAiGatewayKeyFromEnv()`-gates i audit/analyze-routes | Några timmar per route; `VERCEL_OIDC_TOKEN` behövs kvar för Vercel Sandbox |
| Sandbox-naming-städ | Gradvis byt cosmetic sandbox-namn (kommentarer, lokala variabler, loggar, hookknamn) mot preview/VM/tier-2; DB-kolumner och API-routes kräver migration och görs separat | Löpande vid andra ändringar |
| VM-start / telemetri | Justera kallstart, resume och readiness-heuristik utifrån riktig preview-latensdata | cirka 0.5-1 dag när tillräcklig telemetri finns |

---

## 4. Vad som inte ska bo här

- Långa historikblock, gamla remediation-procent och arkiverade planer hör hemma i `docs/plans/avklarat/` eller git-historik.
- Git- och agentrutiner hör hemma i regler och contributing-dokument, inte i den här filen.
- Om scaffold-harmonisering blir aktiv igen bör den få en egen plan i stället för att blåsa upp den här filen igen.
