# Cursor-konfiguration i detta repo

## Agent: var börja?

Se [`docs/README.md`](../docs/README.md) — tunn dokumentationsrouter. Snabb ordning: `docs/README.md` → `docs/concepts/mental-model.md` → `docs/architecture/code-map.md` → `rules/terminology.mdc`.

## Workspace (en rot, samma verktygsinställningar)

- **Föredra** att öppna **`sajtmaskin.code-workspace`** i repots rot (`File → Open Workspace from File…`). Den är committad, pekar på en rot (`.`) med visningsnamnet `sajtmaskin`, och håller Cursor-sessionen konsekvent. Att öppna bara mappen fungerar också, men skapa inte två parallella fönster (folder + workspace) mot samma checkout.
- Lägg **inte** till globala Cursor-sökvägar (t.ex. `%USERPROFILE%\.cursor\plans`) eller andra worktrees som extra workspace-mappar — det ger brus i Problems/sök.
- **Standard:** huvudcheckouten `…\sajtmaskin` på `master` i ett eget fönster. Separata worktrees öppnas i egna fönster och tas bort när de inte längre bär unikt arbete.
- **VS Code / Cursor-delade** inställningar: **`.vscode/settings.json`** är canonical. När du öppnar mappen gäller hela filen. I `.code-workspace`-läge tillämpar VS Code bara dess resurs-/mappscopade värden, så workspace-filen speglar de sex Window-scopade TypeScript-/terminalvärdena som annars ignoreras. Ändra värdena i `.vscode` först och håll den smala speglingen synkad; duplicera inte resten av filen.
- **Endast Cursor**: **`.cursor/settings.json`** (t.ex. plugins). Den ersätter inte `.vscode` för vanliga tillägg.
- Markdown-projektkonfiguration: **`.markdownlint.json`**, **`.markdownlintignore`**. Filer _utanför_ repot kräver i regel **User Settings** (`markdownlint.ignore`) eller att de inte ingår i workspace.

## Prioriteringsordning

1. **Slash-kommandon** överstyr generella regler när de körs.
2. **Generella regler** (`alwaysApply: true`) gäller i alla sessioner.
3. **Glob-triggrade regler** gäller automatiskt vid relevanta filändringar.
4. **Manuellt bifogade regler** gäller när användaren lägger till dem med `@`.
5. "Ta inte bort om du är osäker" gäller alltid — men enkelhet är ett självständigt mål (se `workflow.mdc § Städning och scope`).

## Projektregler (`.cursor/rules/*.mdc`)

Varje regels frontmatter äger själv om den är generell, glob-triggad eller
manuellt bifogad; återge inte den klassificeringen i en parallell tabell här.
Börja med [`repo-router.mdc`](rules/repo-router.mdc) och välj därefter ägare:

- ändrings-/Git-/mergeflöde: [`workflow.mdc`](rules/workflow.mdc),
  [`git.mdc`](rules/git.mdc), [`pr-merge.mdc`](rules/pr-merge.mdc),
  [`agent-worktree.mdc`](rules/agent-worktree.mdc),
  [`agent-roles.mdc`](rules/agent-roles.mdc),
- pipeline/runtime: [`pipeline-rules.mdc`](rules/pipeline-rules.mdc),
  [`scaffold-rules.mdc`](rules/scaffold-rules.mdc),
  [`evals.mdc`](rules/evals.mdc),
  [`dossier-rules.mdc`](rules/dossier-rules.mdc),
  [`db-env-parity.mdc`](rules/db-env-parity.mdc),
  [`env-flow-f2-mute.mdc`](rules/env-flow-f2-mute.mdc),
- plattform/tooling: [`bash-och-pwsh.mdc`](rules/bash-och-pwsh.mdc),
  [`local-tooling-mcp.mdc`](rules/local-tooling-mcp.mdc),
  [`useful-commands.mdc`](rules/useful-commands.mdc) (token-hygien, inte kommandolista),
- kommunikation och scope: [`response-format.mdc`](rules/response-format.mdc),
  [`mvp-scope-freeze.mdc`](rules/mvp-scope-freeze.mdc),
  [`project-phase-priorities.mdc`](rules/project-phase-priorities.mdc),
  [`subagent-models.mdc`](rules/subagent-models.mdc).

Övriga regler väljs direkt från `.cursor/rules/` efter filens `description` och
`globs`. I chat: bifoga **bara den regel som äger uppgiften** (`@` + sökväg).
Dumpa inte hela `.cursor/rules/`.

## Terminologi

**Kanonisk och enda ordlista:** [`docs/architecture/glossary.md`](../docs/architecture/glossary.md) — kärntermer, namnskuggor, legacy, URL-nivåer, fas-skillnad och agent-/modellplan.

**Tunn terminologirouter:** [rules/terminology.mdc](rules/terminology.mdc) — always-applied pekare till glossaryn utan en parallell ordlista.

I chat: `@terminology` eller `@.cursor/rules/terminology.mdc`.

## Schemas

**Human-readable:** [`docs/schemas/`](../docs/schemas/) — kontrakt och fältformer för människor.

**Strict (machine-readable):** [`docs/schemas/strict/`](../docs/schemas/strict/) — JSON schemas för tooling och validering.

Canonical owner avgörs per faktatyp enligt
[`docs/documentation-lifecycle.md`](../docs/documentation-lifecycle.md).
Strict schemas speglar runtime-typer där sådana äger formen; de blir inte en
parallell owner.

## Slash-kommandon (`.cursor/commands/*.md`)

Kommandofilens instruktion är ägare; README:t återger inte dess steg, antal
agenter eller historiska defaults. Se [`commands/`](commands/) och börja med
den namngivna filen, till exempel [`scout.md`](commands/scout.md),
[`builder.md`](commands/builder.md), [`steward.md`](commands/steward.md),
[`automat.md`](commands/automat.md),
[`kedja.md`](commands/kedja.md), [`avslutning.md`](commands/avslutning.md),
[`buggrapport.md`](commands/buggrapport.md), [`pr-herde.md`](commands/pr-herde.md),
[`logg.md`](commands/logg.md) eller
[`logg-internet.md`](commands/logg-internet.md). När ett kommando delegerar till
en skill äger dess länkade `SKILL.md` detaljflödet.

Modellval för alla subagenter ägs av
[`rules/subagent-models.mdc`](rules/subagent-models.mdc); respektive command
eller skill äger sin rollindelning. Kopiera inte modellsluggar eller mätdata hit.

## Backoffice

**Kanonisk Streamlit-app:** `backoffice/` (sidmoduler, delad logik i `backoffice/shared.py`).

**Entrypoint:** `npm run backoffice` från repo-rot (kanonisk, plattformsoberoende). Direktanrop `python(3) sajtmaskin_backoffice.py` fungerar också.

**Domänkarta:** `config/backoffice/domain-map.json` — mappar Backoffice-vyer till kanoniska sökvägar, docs och kodsanningar.

## Flera agenter / parallellt arbete

Rollerna Scout / Builder / Steward och säte A/B ägs av
[`rules/agent-roles.mdc`](rules/agent-roles.mdc). Branch-/worktree-regler ägs av
[`rules/agent-worktree.mdc`](rules/agent-worktree.mdc). Scope, staging och
verifiering ägs av [`rules/workflow.mdc`](rules/workflow.mdc) och
[`rules/git.mdc`](rules/git.mdc).

## MCP (`mcp.json`)

Cursor läser den lokala **`.cursor/mcp.json`** (riktig runtime-fil, gitignorerad
just därför). Den spårade mallen är [`.cursor/mcp.json.example`](mcp.json.example).
Installation, synk, varför mallen är spårad och dev/prod-säkerhet ägs av
[`rules/local-tooling-mcp.mdc`](rules/local-tooling-mcp.mdc) och
[`rules/project-phase-priorities.mdc`](rules/project-phase-priorities.mdc).
