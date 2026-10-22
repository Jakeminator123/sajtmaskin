# Cursor i detta repo

Öppna repo-roten `sajtmaskin` med File → Open Folder: en Git-root, ingen
`.code-workspace`, inte ett TEMP-fönster eller uppgifts-worktree. Terminal/pwsh 7:
`.vscode/settings.json`. Valfri projekt-MCP: `.cursor/mcp.json` från
`.cursor/mcp.json.example`; felsök med `npm run doctor` och
`local-tooling-mcp.mdc`. Codex har egna anslutningar.

## Kontext

Ladda så lite som möjligt. Startkontext är `AGENTS.md` (router och arbetsregel)
plus always-reglerna `git.mdc` och `workflow.mdc`. Övriga regler aktiveras av sin
frontmatter (glob eller beskrivning); läs regeln som äger uppgiften, inte hela
`.cursor/rules/`. Codex och Cursor följer samma arbetsregler.

Efter `git pull`: starta en ny chatt (öppna chattar behåller gammal kontext).
Varje worktree följer sin branch. Stale sökträffar: öppna reporoten igen och
kontrollera indexstatus. Produktmodeller, runtime och `backoffice/` påverkas inte
av kontextreglerna.

## Skills och kommandon

`.agents/skills/` är enda skill-katalogen; spårade skills allowlistas i
`.gitignore`. `.cursor/commands/*.md` är tunna routrar till en skill — ladda inte
både command-text och samma recept. `pr-workflow` gäller allt skriv-, PR- och
mergearbete och `bug-koll` gäller ChatGPT-bugg-koll före merge; `/automat`,
`/logg` och `/logg-internet` läses bara när de anropas.

Codex kan spegla kommandon som gitignorerade `.agents/skills/source-command-*`.
Speglingarna dubblerar kommandona och kostar kontext varje tur;
`check:agent-context` varnar och de tas bort lokalt.

## Ignore-filer

- `.cursorignore` blockerar läsning: bara secrets och extrema Read-fällor.
- `.cursorindexingignore` blockerar bara indexering av stora riktläsbara ytor,
  t.ex. `BUG-SWARM-BACKLOG.md` (kanonisk; sök exakt `SM-###`).
- Ignorera aldrig hela `src/`; det tvingar agenten till dyrare omvägar.
- `övrigt/` är ägarens gitignorerade lokala yta; läs den bara på uttrycklig pekare.

## Kontroller

`config/agent-workflow.json` äger branch-, protected-path- och
verifieringsdata. `npm run check:agent-context` låser startkontext, budgetar och
skill-katalog. `npm run doctor` läser det CI inte ser (RTK-hook, live-`mcp.json`,
dubblerade skill-rötter, plugin-kostnad); tyst i `predev`, aldrig blockerande.
