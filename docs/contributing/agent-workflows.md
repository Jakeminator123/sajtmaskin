# Agent- och utvecklarflöden (Cursor)

Kort guide för att skilja **produktfunktioner** från **repo-lokala agentverktyg**. Utförligare produktordlista: [`.cursor/rules/terminology.mdc`](../../.cursor/rules/terminology.mdc). Mappar och research-pipeline: [`docs/architecture/structure-and-terminology.md`](../architecture/structure-and-terminology.md).

## Djup brief vs orchestrator-run

| Begrepp | Var | Vad det är |
|--------|-----|------------|
| **Djup brief** | Byggaren (`/builder`), produktlane | Prompt-assist **före** huvudgenerering — strukturerar användarens första prompt (UI: t.ex. *Djup brief*). Ingen koppling till `.cursor/orchestrator/`. |
| **Orchestrator-run** | `.cursor/orchestrator/` | **Cursor-lokalt** protokoll: roadmap, workloads, verifiering, final sweep. Triggas i chat med **`/orchestrator`** eller **`/automation`** (behandlas som **alias** i repot). Se [orchestrator-run-protocol.md](../architecture/orchestrator-run-protocol.md) och skillen `orchestrator-run` under `.cursor/skills/` om den är installerad i din Cursor-profil. |
| **`/orchestrator-run`** | Cursor-användarmeddelande | Samma **orchestrator-run**-arbetsflöde som ovan; repots slash-triggers i protokollet är `/orchestrator` och `/automation`. |

**Regel:** När någon skriver “orchestrator” i **byggarkontext** — kontrollera om de menar **Djup brief** / produktlane eller **multi-agent-körning i Cursor**.

## Runtime vs MCP vs Cursor-only

| Lager | Lever vid | Syfte |
|-------|-----------|--------|
| **App-runtime** (Sajtmaskin på Vercel/lokal Next) | `npm run dev` / produktion | Användare, builder, API-routes, DB, deploy. **Oberoende** av att MCP eller Cursor körs. |
| **Repo-lokala MCP-servrar** | Cursor `mcp.json` (lokal kopia från `.cursor/mcp.json.example`) | Hjälp för **agenter i editorn**: t.ex. `sajtmaskin-engine`, `sajtmaskin-scaffolds`, plus ev. `v0`, `Vercel`, OpenAI-docs. Se [`.cursor/README.md`](../../.cursor/README.md) § MCP. |
| **Orchestrator-run artefakter** | `.cursor/orchestrator/run/` (gitignorerad) + `archive/` | Körloggar, workloads — **inte** del av appens runtime. |
| **Vitest / Playwright** | CI & lokal utveckling | Tester körs utan MCP; `e2e/**` körs med Playwright, exkluderad från Vitest. |

**MCP är inte en produktionsberoende** för den deployade sajten — se även `docs/README.md` § Production boundary.

## Relaterade planfiler

- [External review — workloads](../plans/active/orchestrator-workloads-external-review.md) (W1–W5, copy-paste-brief)
- [External review — progress %](../plans/active/external-review-remediation-progress.md)
- [Execution — MASTER-ROADMAP](../plans/active/external-review-execution/MASTER-ROADMAP.md)
