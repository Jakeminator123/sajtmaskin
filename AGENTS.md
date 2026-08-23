# Agent entry (Sajtmaskin)

Tunn pekare — canonical innehåll finns redan i `docs/` och `.cursor/rules/`.

## Läs i denna ordning innan du börjar

1. [`docs/README.md`](docs/README.md) — dokumentationsnav
2. [`övrigt/FUSKLAPP-BYGGBLOCK.md`](övrigt/FUSKLAPP-BYGGBLOCK.md) — Byggblock/dossiers på en sida (koden vinner)
3. [`docs/concepts/mental-model.md`](docs/concepts/mental-model.md) — stabil mental modell
4. [`docs/architecture/code-map.md`](docs/architecture/code-map.md) — kodkarta
5. [`docs/architecture/glossary.md`](docs/architecture/glossary.md) — kanonisk ordlista
6. [`.cursor/README.md`](.cursor/README.md) — regelrouter + prioriteringsordning
7. [`.cursor/rules/terminology.mdc`](.cursor/rules/terminology.mdc) — tunn router till glossaryn
8. [`config/env-policy.json`](config/env-policy.json) + [`docs/ENV.md`](docs/ENV.md) — env-sanning

## Kritiska regler att plocka upp tidigt

Välj regel efter uppgift via [`.cursor/README.md`](.cursor/README.md). Där finns
en router till rules frontmatter; själva regeln äger sitt bindande innehåll.
Git-/ändringsflödet ägs av [`git.mdc`](.cursor/rules/git.mdc),
[`workflow.mdc`](.cursor/rules/workflow.mdc) och, för merge,
[`pr-merge.mdc`](.cursor/rules/pr-merge.mdc).
Cursor-roller (Scout / Builder / Steward) ägs av
[`.cursor/rules/agent-roles.mdc`](.cursor/rules/agent-roles.mdc).

## Codex Desktop

Projektets Codex-lager finns i [`.codex/README.md`](.codex/README.md) och
[`.codex/config.toml`](.codex/config.toml). Öppna repo-roten som primary folder;
plattformsspecifik setup, ignorering och worktree-paritet ägs av Codex-guiden.

## Allmänt per-PR-klart

Välj minsta verifiering efter ändringstyp i
[`workflow.mdc`](.cursor/rules/workflow.mdc). Kommandon ägs av `package.json`.
Token-hygien: [`useful-commands.mdc`](.cursor/rules/useful-commands.mdc).
Docs-/schema-/Backoffice-sync vid pipelineändringar ägs av
[`pipeline-rules.mdc`](.cursor/rules/pipeline-rules.mdc). Dependency-PR:er följer
[`docs/dependency-policy.md`](docs/dependency-policy.md).

## Vercel-åtkomst

Vercel-/MCP-setup, projektkoppling, loggar, OAuth och 403-felsökning ägs av
[`local-tooling-mcp.mdc`](.cursor/rules/local-tooling-mcp.mdc). Samlad
logghämtning körs via [`.cursor/commands/logg.md`](.cursor/commands/logg.md).

## Review guidelines

PR-författarens bugg-efterkontroll ägs av [`git.mdc`](.cursor/rules/git.mdc).
Fallback, bot-fyndsvep, protected paths, `merge:ready` och mergegrinden ägs helt
av [`pr-merge.mdc`](.cursor/rules/pr-merge.mdc); följ dess ordning utan att
återskapa checklistan här.

Utöver den generella P0/P1-listan, flagga som **P1**:

- Design- eller integrationsstatus som blir grön **utan** verklig verifiering.
- **Saknade tester** när ändringen rör pipeline, preview, DB, autofix, dependency-hantering eller något runtime-kontrakt.

Bakgrund och incidenter: [`docs/runbooks/pr-merge-gate.md`](docs/runbooks/pr-merge-gate.md).

## Canonical owner-regel

Canonical owner och dokumentationsnivåer ägs av
[`docs/documentation-lifecycle.md`](docs/documentation-lifecycle.md).
Terminologiregeln och den kanoniska ordlistan äger hur nya begrepp hanteras:
[`terminology.mdc`](.cursor/rules/terminology.mdc) och
[`docs/architecture/glossary.md`](docs/architecture/glossary.md).

Terminologisemantik för människor ägs endast av glossaryn. Den maskinläsbara
dictionaryn väljer valideringsregler men definierar inte begreppen; se
[`docs/documentation-lifecycle.md`](docs/documentation-lifecycle.md#terminologi).

## Cursor Cloud Agent

Pod-specifik miljö, gotchas och snabbstart ägs av
[`docs/runbooks/cursor-cloud-agent.md`](docs/runbooks/cursor-cloud-agent.md).
