# Cursor i detta repo

## Öppna projektet

File → Open Folder → repo-roten `sajtmaskin`. En Git-root, ingen
`.code-workspace`. Inte TEMP-fönster eller ett uppgifts-worktree.
MCP: `.cursor/mcp.json`. Terminal/pwsh 7: `.vscode/settings.json`.

## Grundprincip

Cursor ska ladda så lite som möjligt. `AGENTS.md` och always-applied regler är
startkontext; övriga regler/skills laddas först när beskrivning, glob eller
explicit kommando matchar uppgiften. Läs aldrig hela docs-, regel- eller
backloggstacken som rutin.

## Vad märker jag lokalt?

Ändringarna gäller efter att branchen hämtats.

- Börja en ny chatt efter `git pull`; öppna chattar behåller gammal kontext.
- Varje worktree följer sin branch och uppdateras separat.
- Stale sökträffar: öppna reporoten igen och kontrollera indexstatus.
- Produktmodeller, runtime och `backoffice/` påverkas inte av kontextreglerna.

Sol: Grok 4.6 Extra High Fast ur sessionens lista. Luna = mekanisk read-only,
Terra = uttrycklig lågrisk. Godnatt har egna profiler. Styr subagenter, inte
sajtrouting. Kopiera inte en gammal slug.

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
| MVP-bias / ny feature         | `project-phase-priorities.mdc`                                  |
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

`BUG-SWARM-BACKLOG.md` ligger utanför semantisk indexering men är kanonisk.
`övrigt/` är ägarens lokala yta (gitignorerad) — inte en repo-källa. Läs den
bara på uttrycklig pekare; nya dokument hör i `docs/`.

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
Före push: `npm run verify:pr -- --plan` + riktat. CI publicerar tung
profil eller light-kvitto.
`check:agent-context` låser den tunna startkontexten och enda skill-katalogen.

`npm run doctor` läser det CI **inte** kan se: RTK-hook, live-`mcp.json`,
dubblerade skill-rötter, plugin-kostnad. Tyst i `predev`, aldrig blockerande.
