# Agent- och utvecklarflöden (Cursor)

Kort guide för att skilja **produktfunktioner** från **repo-lokala agentverktyg**. Utförligare produktordlista: `[.cursor/rules/terminology.mdc](../../.cursor/rules/terminology.mdc)`. Mappar och research-pipeline: `[repository-and-platform.md](../architecture/repository-and-platform.md)`.

## Djup brief (produkt) vs stora arbetspaket (repo)

| Begrepp        | Var                               | Vad det är |
| -------------- | --------------------------------- | ---------- |
| **Djup brief** | Byggaren (`/builder`), produktlane | Prompt-assist **före** huvudgenerering (UI: t.ex. *Djup brief*). |
| **Större spår** | `docs/plans/active/`, issues     | Dela upp manuellt i planfiler eller milestones — repot har **inte** längre ett separat Cursor-orchestrator-protokoll under `.cursor/` (historik i git om behov). |

## Runtime vs MCP vs Cursor-only


| Lager                                             | Lever vid                                                       | Syfte                                                                                                                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **App-runtime** (Sajtmaskin på Vercel/lokal Next) | `npm run dev` / produktion                                      | Användare, builder, API-routes, DB, deploy. **Oberoende** av att MCP eller Cursor körs.                                                                                            |
| **Valfria MCP-kopplingar i Cursor**               | Cursor `mcp.json` (lokal kopia från `.cursor/mcp.json.example`) | **Inte** källan till projektets dokumentation — den ligger i **`docs/`**, `README` och `.cursor/rules/`. MCP här är valfria hjälpmedel för agenter (plattforms-API:er). Motor/scaffold-kod läses i repot (`src/lib/mcp/*`, `src/lib/gen/scaffolds/`). Se `[.cursor/README.md](../../.cursor/README.md)` § MCP. |
| **Vitest / Playwright**                           | CI & lokal utveckling                                           | Tester körs utan MCP; `e2e/` körs med Playwright, exkluderad från Vitest.                                                                                                            |


**Preview / sandbox (ephemeral norm, inspector m.m.):** [`preview-deploy.md`](../architecture/preview-deploy.md).

**MCP är inte en produktionsberoende** för den deployade sajten — se även `docs/README.md` § Production boundary.

## Agent-underlag i git (`.j_to_agent`)

Underlag och kritikfiler kan ligga i `**.j_to_agent/`** för reproducerbarhet. **Committa inte** secrets, tokens, personuppgifter eller stora binärer — använd `.gitignore` och [`.cursor/rules/repo-env-indexing.mdc`](../../.cursor/rules/repo-env-indexing.mdc).

**Worktree:** `git fetch` + `git pull` innan du jämför plan med `origin/master`.

## Verifiering före större merge

Kör `npm run typecheck` och `npx vitest run` (plus `npm run lint` vid behov) innan du pushar större ändringar — särskilt om flera agenter rör samma spår.

## Plan / backlog

- [PROJECT-STATE-AND-DIRECTION.md](../plans/active/PROJECT-STATE-AND-DIRECTION.md) — kanonisk backlog  
- [`avklarat/README.md`](../plans/avklarat/README.md) — äldre planhandoff i git-historik  
- [KRITIK-OVERVIEW.md](../../.j_to_agent/structure_bugs_and_parralells/kritik/KRITIK-OVERVIEW.md) — parallell kritikspårning

