# Agent- och utvecklarflöden (Cursor)

Kort guide för att skilja **produktfunktioner** från **repo-lokala agentverktyg**. Utförligare produktordlista: `[.cursor/rules/terminology.mdc](../../.cursor/rules/terminology.mdc)`. Mappar och research-pipeline: `[repository-and-platform.md](../architecture/repository-and-platform.md)` · djup: [arkiv `structure-and-terminology.md`](../architecture/archive/pre-2026-03-consolidation/structure-and-terminology.md).

## Djup brief (produkt) vs stora arbetspaket (repo)

| Begrepp        | Var                               | Vad det är |
| -------------- | --------------------------------- | ---------- |
| **Djup brief** | Byggaren (`/builder`), produktlane | Prompt-assist **före** huvudgenerering (UI: t.ex. *Djup brief*). |
| **Större spår** | `docs/plans/active/`, issues     | Dela upp manuellt i planfiler eller milestones — repot har **inte** längre ett separat Cursor-orchestrator-protokoll under `.cursor/` (historik: [orchestrator-run-protocol.md](../architecture/archive/pre-2026-03-consolidation/orchestrator-run-protocol.md)). |

## Runtime vs MCP vs Cursor-only


| Lager                                             | Lever vid                                                       | Syfte                                                                                                                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **App-runtime** (Sajtmaskin på Vercel/lokal Next) | `npm run dev` / produktion                                      | Användare, builder, API-routes, DB, deploy. **Oberoende** av att MCP eller Cursor körs.                                                                                            |
| **Valfria MCP-kopplingar i Cursor**               | Cursor `mcp.json` (lokal kopia från `.cursor/mcp.json.example`) | **Inte** källan till projektets dokumentation — den ligger i **`docs/`**, `README` och `.cursor/rules/`. MCP här är valfria hjälpmedel för agenter (plattforms-API:er, egen motor/scaffold-verktyg). Se `[.cursor/README.md](../../.cursor/README.md)` § MCP. |
| **Vitest / Playwright**                           | CI & lokal utveckling                                           | Tester körs utan MCP; `e2e/`** körs med Playwright, exkluderad från Vitest.                                                                                                        |


**Preview / sandbox (ephemeral norm, inspector m.m.):** [`preview-deploy.md`](../architecture/preview-deploy.md) — översikt; detalj: [arkiv `preview-and-sandbox-flow.md`](../architecture/archive/pre-2026-03-consolidation/preview-and-sandbox-flow.md).

**MCP är inte en produktionsberoende** för den deployade sajten — se även `docs/README.md` § Production boundary.

## Agent-underlag i git (`.j_to_agent`)

Underlag och kritikfiler kan ligga i `**.j_to_agent/`** för reproducerbarhet. **Committa inte** secrets, tokens, personuppgifter eller stora binärer — använd `.gitignore` och samma hygien som i `[external-review-remediation-progress.md](../plans/active/external-review-remediation-progress.md)` § *Arbetsyta / commit*.

**Worktree:** säkerställ `git fetch` + `master` synkad mot `origin/master` om du jämför plan/remediation med lokala filer (se samma progress-dokument § *Gren och arbetsyta*).

## Verifiering före större merge

Kör `**npm run typecheck`** och `**npx vitest run**` (plus `npm run lint` vid behov) innan du pushar större ändringar — särskilt om flera agenter rör samma spår.

## Relaterade planfiler

- [External review — workloads](../plans/active/orchestrator-workloads-external-review.md) (stub → [full snapshot](../plans/avklarat/orchestrator-workloads-external-review.md); aktiv backlog: [REMAINING-WORK](../plans/active/REMAINING-WORK.md))
- [External review — progress %](../plans/active/external-review-remediation-progress.md)
- [Execution — MASTER-ROADMAP (arkiv)](../plans/avklarat/external-review-execution/MASTER-ROADMAP.md) · [stub](../plans/active/external-review-execution/README.md)
- [Allt kvar — MASTER](../plans/active/MASTER-ALLT-KVAR.md) · [KORFIL (pekare)](../plans/active/queue/KORFIL.md) · valfria `queue/PLAN-*.md`
- [Kritik-derived backlog](../plans/active/kritik-derived-backlog.md) — öppna punkter från parallell granskning

