# Cursor i detta repo

## Öppna projektet

File → Open Folder → repo-roten `sajtmaskin`. En Git-root.
Inte TEMP-fönster, worktree eller Codex-kopian. MCP: `.cursor/mcp.json`.
`sajtmaskin.code-workspace` är valfri, inte multi-root. Terminal/pwsh 7 ligger i `.vscode/settings.json`.

## Grundprincip

Cursor ska ladda så lite som möjligt. `AGENTS.md` och always-applied regler är
startkontext; övriga regler/skills laddas först när beskrivning, glob eller
explicit kommando matchar uppgiften. Läs aldrig hela docs-, regel- eller
backloggstacken som rutin.

## Vad märker jag i mitt lokala Cursor?

Ja, ändringarna gäller lokalt efter att branchen med dem har hämtats. En ny
agentkörning får den korta startkontexten och hämtar detaljer först vid behov.

- Börja en ny chatt efter `git pull`; öppna chattar behåller gammal kontext.
- Varje worktree följer sin branch och får nya regler först efter uppdatering.
- Vid stale sökträffar: öppna reporoten igen och kontrollera Cursors indexstatus.
- Sajtmaskins produktmodeller, runtime och `backoffice/` ändras inte av
  kontextreglerna. Backoffice förblir sökbart så att följdändringar upptäcks.

Sol-körningar använder Grok 4.6 Extra High Fast; Luna är bara för mekanisk
read-only-sökning och Terra ett uttryckligt lågriskval. Godnatt behåller sina
separata profiler. Detta styr subagenter, inte Cursors modellväljare eller
produktens sajtrouting.

## Regler

Frontmatter i varje `.cursor/rules/*.mdc` äger aktiveringen. Tre tunna regler
är generella: `repo-router.mdc`, `git.mdc` och `workflow.mdc`. Övriga är
globstyrda eller agent-requested.

| Uppgift                       | Regel                                                           |
| ----------------------------- | --------------------------------------------------------------- |
| Hitta owner/sökväg            | `repo-router.mdc`                                               |
| Skriva/branch/PR              | `pr-workflow` + `git.mdc`, `workflow.mdc`, `agent-worktree.mdc` |
| Merge/PR-efterkontroll        | `pr-merge.mdc`                                                  |
| Pipeline/scaffold/dossier/env | matchande globregel                                             |
| Terminologi                   | `terminology.mdc` + riktad glossary-sökning                     |
| Subagenter                    | `subagent-models.mdc`                                           |
| Lokal tooling/Vercel/Supabase | `local-tooling-mcp.mdc`                                         |

Bifoga bara den regel som äger uppgiften. `@.cursor/rules/` i sin helhet skapar
brus och motstridiga instruktioner.

## Skills och kommandon

`.agents/skills/` är den enda kanoniska skill-katalogen. Miljöspecifika recept
kräver verktyget som skillen anger. Stora kommandon är tunna routrar dit; skapa
inte en andra editorlokal skillkopia.

`pr-workflow` laddas för allt skriv-, PR- och mergearbete. Övriga stora skills
(`/automat`, `/kedja`, `/818`, `/logg`, `/logg-internet`, `/godnatt-bugg`) läses
bara när de anropas. Ladda inte både lång command-text och samma skillrecept.

## Stora sanningskällor

- Glossary: sök exakt term/rubrik i `docs/architecture/glossary.md`.
- Backlogg: sök exakt `SM-###` eller sektion i `BUG-SWARM-BACKLOG.md`.
- Env: sök exakt nyckel i `config/env-policy.json`/`docs/ENV.md`.
- Runtimeinventarier: använd `docs/generated/` eller respektive registry.

`BUG-SWARM-BACKLOG.md` ligger utanför semantisk indexering men är fortsatt
läsbar och kanonisk. `övrigt/` är användarens gitignorerade, icke-kanoniska
arbetsyta och ligger också utanför indexet.

## Ignore-filer

- `.cursorignore` blockerar läsning: bara secrets och extrema Read-fällor.
- `.cursorindexingignore` blockerar bara indexering av stora riktläsbara ytor.
- Ignorera aldrig hela `src/`; det tvingar agenten till dyrare omvägar.

## Tokenhygien i praktiken

- Dämpa progress, men dölj inte stderr. Kör engångskontroller, inte watch-loopar.
- Håll en chatt per arbetskluster och kräv fyndfokuserade subagentsvar.
- Tester och oberoende review ska inte kapas; minska omläsning och brus.

## Kontroller

`config/agent-workflow.json` äger branch-, protected-path- och verifieringsdata.
Kör `npm run verify:pr -- --plan` tidigt och `npm run verify:pr` före push.
`check:agent-context` låser den tunna startkontexten och enda skill-katalogen.
