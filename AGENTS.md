# Agent entry (Sajtmaskin)

Tunn pekare — canonical innehåll finns redan i `docs/` och `.cursor/rules/`.

## Läs i denna ordning innan du börjar

1. [`docs/README.md`](docs/README.md) — dokumentationsnav
2. [`docs/architecture/repo-tree.md`](docs/architecture/repo-tree.md) — repokarta
3. [`docs/architecture/glossary.md`](docs/architecture/glossary.md) — kanonisk ordlista (~100 begrepp)
4. [`.cursor/README.md`](.cursor/README.md) — fulla regel-index + prioriteringsordning
5. [`.cursor/rules/terminology.mdc`](.cursor/rules/terminology.mdc) — snabb förväxlingstabell
6. [`config/env-policy.json`](config/env-policy.json) + [`docs/ENV.md`](docs/ENV.md) — env-sanning

## Kritiska regler att plocka upp tidigt

Välj utifrån vad du gör — komplett tabell finns i [`.cursor/README.md`](.cursor/README.md):

- **LLM-pipeline / gen:** [`pipeline-rules.mdc`](.cursor/rules/pipeline-rules.mdc), [`scaffold-rules.mdc`](.cursor/rules/scaffold-rules.mdc)
- **Git / commit / workflow:** [`git.mdc`](.cursor/rules/git.mdc), [`workflow.mdc`](.cursor/rules/workflow.mdc)
- **Plattform:** [`platform-quirks.mdc`](.cursor/rules/platform-quirks.mdc) (Windows/PowerShell), [`unicode-regex.mdc`](.cursor/rules/unicode-regex.mdc)
- **Builder/coexistence + repo-router:** [`builder-coexistence.mdc`](.cursor/rules/builder-coexistence.mdc), [`repo-router.mdc`](.cursor/rules/repo-router.mdc)
- **OpenClaw / env-flow:** [`openclaw-bridge.mdc`](.cursor/rules/openclaw-bridge.mdc), [`env-flow-f2-mute.mdc`](.cursor/rules/env-flow-f2-mute.mdc)
- **Observability:** [`agent-observatory.mdc`](.cursor/rules/agent-observatory.mdc), [`useful-commands.mdc`](.cursor/rules/useful-commands.mdc)
- **Terminologi / ton:** [`terminology.mdc`](.cursor/rules/terminology.mdc), [`response-format.mdc`](.cursor/rules/response-format.mdc)

## Allmänt per-PR-klart

- `npm run typecheck` → 0 errors
- `npm run lint` → 0 errors
- `npx vitest run` → existing tester gröna
- `node scripts/dev/check-unicode-regex.mjs` om du rört regex
- Synk docs/schemas/backoffice vid pipeline-ändringar (se [`pipeline-rules.mdc`](.cursor/rules/pipeline-rules.mdc))
- Commit- och PR-hygien enligt [`git.mdc`](.cursor/rules/git.mdc) och [`workflow.mdc`](.cursor/rules/workflow.mdc)

## Source-of-truth-regel

Kod är alltid source of truth. Introducera inte nya begrepp utan att registrera dem i glossaryn.
