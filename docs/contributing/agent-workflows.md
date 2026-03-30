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

## Operativa dokument (kör utan separata plan-ID)

- **Preview / sandbox / deploy:** [`preview-deploy.md`](../architecture/preview-deploy.md) — inkl. § *Levererat* och länkar till kod.
- **Backlog / beslut:** [`PROJECT-STATE-AND-DIRECTION.md`](../plans/active/PROJECT-STATE-AND-DIRECTION.md).

Historiska planhandoff finns i **git-historik** (`docs/plans/avklarat/`, äldre commits). **Aktuell drift:** tabellen *Operativa dokument* ovan — inga separata numrerade kördokument i repo-trädet.

**Worktree:** `git fetch` + `git pull` innan du jämför med `origin/master`.

## Flera agenter / säker merge till `master`

För att slå ihop parallellt arbete utan att blanda staging: skapa en **tillfällig branch** (t.ex. `chore/…`), `git restore --staged .` om index är blandat, **separata commits** (docs vs tooling vs kod — inte `git add .` i en klump), `npm run typecheck` + riktade tester, sedan `git merge --no-ff` in i `master` och `git push origin master`. När allt ligger på `master`: ta bort den tillfälliga branchen lokalt (`git branch -d …`) och på origin (`git push origin --delete …`) så historiken förblir enkel. Vilka doc-filer som rörts i en större städvåg kan spåras i den arkiverade [`POST-EPIC-CLEANUP.md`](../plans/avklarat/POST-EPIC-CLEANUP.md) § *Dokumentation som berörts*.

## Verifiering före större merge

Kör `npm run typecheck` och `npx vitest run` (plus `npm run lint` vid behov) innan du pushar större ändringar — särskilt om flera agenter rör samma spår.

## Plan / backlog

- [PROJECT-STATE-AND-DIRECTION.md](../plans/active/PROJECT-STATE-AND-DIRECTION.md) — kanonisk backlog  
- [`avklarat/README.md`](../plans/avklarat/README.md) — äldre planhandoff i git-historik

