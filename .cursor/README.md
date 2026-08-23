# Cursor i detta repo

## Grundprincip

Cursor ska ladda så lite som möjligt. `AGENTS.md` och always-applied regler är
startkontext; övriga regler/skills laddas först när beskrivning, glob eller
explicit kommando matchar uppgiften. Läs aldrig hela docs-, regel- eller
backloggstacken som rutin.

## Vad märker jag i mitt lokala Cursor?

Ja, ändringarna gäller lokalt efter att branchen med dem har hämtats. En ny
agentkörning får den korta startkontexten och hämtar detaljer först vid behov.

- En redan öppen chatt tappar inte text den redan har fått; börja en ny chatt
  efter `git pull` för tydligast effekt.
- Varje worktree följer sin egen branch. Gamla worktrees får inte reglerna förrän
  de uppdateras mot branchen som innehåller dem.
- Normal kodindexering sköts av Cursor. Vid stale sökträffar: öppna reporoten på
  nytt och kontrollera indexstatus i Cursor Settings.
- Sajtmaskins produktmodeller, runtime och `backoffice/` ändras inte av
  kontextreglerna. Backoffice förblir sökbart så att följdändringar upptäcks.

Sol är kvalitetsstandard för utvecklingsagenter; Luna är bara för mekanisk
read-only-sökning och Terra ett uttryckligt lågriskval. Godnatt behåller sina
separata profiler. Detta styr subagenter, inte Cursors modellväljare eller
produktens sajtrouting.

## Regler

Frontmatter i varje `.cursor/rules/*.mdc` äger aktiveringen. Tre tunna regler
är generella: `repo-router.mdc`, `git.mdc` och `workflow.mdc`. Övriga är
globstyrda eller agent-requested.

| Uppgift | Regel |
|---|---|
| Hitta owner/sökväg | `repo-router.mdc` |
| Skriva/branch/PR | `git.mdc`, `workflow.mdc`; vid parallellt arbete även `agent-worktree.mdc` |
| Merge eller PR-efterkontroll | `pr-merge.mdc` |
| Pipeline/scaffold/dossier/env | motsvarande globstyrd regel |
| Terminologi | `terminology.mdc` + riktad glossary-sökning |
| Subagenter | `subagent-models.mdc` |
| Lokal tooling/Vercel/Supabase | `local-tooling-mcp.mdc` |

Bifoga bara den regel som äger uppgiften. `@.cursor/rules/` i sin helhet skapar
brus och motstridiga instruktioner.

## Skills och kommandon

`.agents/skills/` är den kanoniska skill-katalogen för Cursor och repo-agenter
som stöder dessa skills. Miljöspecifika recept, exempelvis `/logg-internet`,
kräver fortfarande verktyget som skillen anger (där: Cursor-browsern). Stora
workflow-kommandon i `.cursor/commands/` är tunna routrar dit; mindre roll-/
leveranskommandon innehåller bara sin unika loop. Skapa inte en andra skillkopia
under `.cursor/skills/`.

Stora workflow-skills (`/automat`, `/kedja`, `/818`, `/logg`,
`/logg-internet`, `/godnatt-bugg`) ska bara läsas när de anropas. Ladda inte
både en lång command-text och samma skillrecept.

## Stora sanningskällor

- Glossary: sök exakt term/rubrik i `docs/architecture/glossary.md`.
- Backlogg: sök exakt `SM-###` eller sektion i `BUG-SWARM-BACKLOG.md`.
- Env: sök exakt nyckel i `config/env-policy.json`/`docs/ENV.md`.
- Runtimeinventarier: använd `docs/generated/` eller respektive registry.

`BUG-SWARM-BACKLOG.md` ligger utanför semantisk indexering men är fortsatt
läsbar och kanonisk. `övrigt/` är användarens gitignorerade, icke-kanoniska
arbetsyta och ligger också utanför indexet.

## Ignore-filer

- `.cursorignore` blockerar läsning: endast secrets och extrema Read-fällor.
- `.cursorindexingignore` blockerar bara indexering: stora artefakter, loggar,
  historik och operativa jättedokument som fortfarande kan behöva läsas riktat.
- Ignorera aldrig hela `src/`; det tvingar agenten till dyrare omvägar.

## Tokenhygien i praktiken

- Dämpa progress med quiet/no-progress, men dölj inte stderr utan att verifiera utfallet.
- Kör inte watch-loopar i chatten; gör en engångskontroll eller skriv bakgrundsstatus till `.cursor/tmp/`.
- Håll en chatt per arbetskluster och kräv korta, fyndfokuserade subagentsvar.
- Tester och oberoende review ska inte kapas; minska omläsning och brus.

## Workspace

Öppna `sajtmaskin.code-workspace` som en enda rot. Separata worktrees öppnas i
separata fönster. Lokal MCP-runtime är `.cursor/mcp.json` (gitignorerad); den
spårade mallen är `.cursor/mcp.json.example`.

## Kontroller

`npm run check:agent-context` håller budget för AGENTS, always-regler, glossary,
merge-regel och dubbla skills. Vanliga repo-kontroller väljs via `workflow.mdc`.
