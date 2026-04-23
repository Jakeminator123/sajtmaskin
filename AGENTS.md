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

- **LLM-pipeline / gen:** [`pipeline-rules.mdc`](.cursor/rules/pipeline-rules.mdc), [`signal-ownership.mdc`](.cursor/rules/signal-ownership.mdc), [`scaffold-architecture.mdc`](.cursor/rules/scaffold-architecture.mdc), [`llm-pipeline-docs-sync.mdc`](.cursor/rules/llm-pipeline-docs-sync.mdc)
- **Git / PR / commit:** [`session-git-docs.mdc`](.cursor/rules/session-git-docs.mdc), [`git.mdc`](.cursor/rules/git.mdc)
- **Plattform:** [`platform-quirks.mdc`](.cursor/rules/platform-quirks.mdc) (Windows/PowerShell), [`unicode-regex.mdc`](.cursor/rules/unicode-regex.mdc)
- **Cleanup / refactor:** [`cleanup-and-scope.mdc`](.cursor/rules/cleanup-and-scope.mdc), [`file-structure-conventions.mdc`](.cursor/rules/file-structure-conventions.mdc)
- **Observability:** [`agent-observatory.mdc`](.cursor/rules/agent-observatory.mdc), [`useful-commands.mdc`](.cursor/rules/useful-commands.mdc)
- **Språk / ton:** [`response-format.mdc`](.cursor/rules/response-format.mdc)

## Allmänt per-PR-klart

- `npm run typecheck` → 0 errors
- `npm run lint` → 0 errors
- `npx vitest run` → existing tester gröna
- `node scripts/dev/check-unicode-regex.mjs` om du rört regex
- Synk docs/schemas/backoffice enligt [`llm-pipeline-docs-sync.mdc`](.cursor/rules/llm-pipeline-docs-sync.mdc) vid pipeline-ändringar
- Commit- och PR-hygien enligt [`git.mdc`](.cursor/rules/git.mdc) och [`session-git-docs.mdc`](.cursor/rules/session-git-docs.mdc)

## Source-of-truth-regel

Kod är alltid source of truth. Introducera inte nya begrepp utan att registrera dem i glossaryn.
