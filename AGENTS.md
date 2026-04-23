# Agent entry (Sajtmaskin)

Tunn pekare — canonical innehåll ligger under `docs/` och `.cursor/`.

## Start här (i ordning)

1. **Dokumentationsnav:** [`docs/README.md`](docs/README.md)
2. **Snabb repokarta:** [`docs/architecture/repo-tree.md`](docs/architecture/repo-tree.md)
3. **Kanonisk ordlista:** [`docs/architecture/glossary.md`](docs/architecture/glossary.md)
4. **Terminologi (snabbreferens):** [`.cursor/rules/terminology.mdc`](.cursor/rules/terminology.mdc)
5. **Cursor-regler-index:** [`.cursor/README.md`](.cursor/README.md)
6. **Env:** [`config/env-policy.json`](config/env-policy.json), [`docs/ENV.md`](docs/ENV.md)

Kod är alltid source of truth. Introducera inte nya begrepp utan att registrera dem i glossaryn.

## Operativa guardrails (kritiska för bakgrundsagenter)

### Done-criteria per PR

Innan du öppnar PR ska allt detta vara uppfyllt:

- `npm run typecheck` → 0 errors
- `npm run lint` → 0 errors
- `npx vitest run` → alla existing tester gröna (notera testräknaren i PR-body)
- `node scripts/dev/check-unicode-regex.mjs` → 0 violations om du rört regex
- PR-body har Sammanfattning + Verifiering, avslutas med `DONE` på egen rad
- `gh pr merge --auto --squash` aktiverat
- Label satt som matchar spåret (se Konfliktzoner nedan)

### Konfliktzoner — stäm av om flera agenter jobbar parallellt

Dessa filer är känsliga och rörs ofta av flera spår. Varje agent ska deklarera sitt revir i PR-body:

- `src/lib/gen/*` (hot-files: `system-prompt*`, `build-spec*`, `stream/finalize-version*`, `autofix/**`, `scaffolds/matcher.ts`)
- `src/lib/providers/own-engine/*`
- `src/lib/hooks/chat/*`
- `src/lib/builder/promptAssist*`
- `src/lib/env.ts`, `src/lib/gen/config.ts`, `config/env-policy.json`
- `src/lib/db/types.ts`, UI-badge-komponenter
- `config/prompt-core/**`
- Kanoniska arkitekturdocs under `docs/architecture/`

### PR-konventioner

- Branch: `agent/<kort-id>` (t.ex. `agent/fixer-consolidation`)
- Label: matcha spåret (`eval-baseline`, `fixer-consolidation`, `wave-leftovers`, `status-unification`, `prompt-core-audit`)
- En commit per logisk ändring. Efter varje commit: typecheck + lint + vitest isolerat grönt.
- Branch protection på master kräver PR. Cloud-agenter bypass:ar inte — `--auto --squash` väntar på CI grönt + approval.
- Om du är blockerad av konflikt eller icke-trivialt CI-fel: kommentera PR med "stopped: \<reason\>" och lämna ifred. Rör aldrig master direkt.

### Plattform / språk

- **Windows:** PowerShell är primär utvecklingsmiljö. Subprocesser som spawnar `npx`/`tsx` måste sätta `shell: true` på Windows — se [`scripts/observability/dump-fixer-registry.mjs`](scripts/observability/dump-fixer-registry.mjs) för mönster.
- **Unicode-regex:** ASCII `\b` matchar inte `åäö`. Omge alltid med explicit `[A-Za-z_$]`-klass. Se [`.cursor/rules/unicode-regex.mdc`](.cursor/rules/unicode-regex.mdc) + [`src/lib/gen/autofix/rules/import-alias-type-syntax-fixer.ts`](src/lib/gen/autofix/rules/import-alias-type-syntax-fixer.ts) som referensmönster.
- **Språk:** användarvänd text (docs, PR-body, kommentarer till användaren) på **svenska**. Kod, commit-meddelanden, test-labels, inline-kodkommentar: **engelska** enligt befintlig stil.

### Relevanta regler per typ av arbete

| Område | Viktigaste regler |
|---|---|
| LLM-pipeline / gen | [gen-pipeline-simplicity.mdc](.cursor/rules/gen-pipeline-simplicity.mdc), [signal-ownership.mdc](.cursor/rules/signal-ownership.mdc), [scaffold-architecture.mdc](.cursor/rules/scaffold-architecture.mdc), [llm-pipeline-docs-sync.mdc](.cursor/rules/llm-pipeline-docs-sync.mdc) |
| Git / PR / commit | [session-git-docs.mdc](.cursor/rules/session-git-docs.mdc), [git.mdc](.cursor/rules/git.mdc) |
| Plattform | [platform-quirks.mdc](.cursor/rules/platform-quirks.mdc), [unicode-regex.mdc](.cursor/rules/unicode-regex.mdc) |
| Cleanup / refactor | [cleanup-and-scope.mdc](.cursor/rules/cleanup-and-scope.mdc), [file-structure-conventions.mdc](.cursor/rules/file-structure-conventions.mdc) |
| Observability | [agent-observatory.mdc](.cursor/rules/agent-observatory.mdc), [useful-commands.mdc](.cursor/rules/useful-commands.mdc) |

### Verifiera nedströms-effekter

Ändring i pipeline-kod måste stämma mot:

- `docs/schemas/strict/*.schema.json` (machine-readable kontrakt)
- `docs/schemas/*.md` (human-readable kontrakt)
- `backoffice/` (Streamlit-paneler måste reflektera faktisk runtime, inte ambition)

Se [`llm-pipeline-docs-sync.mdc`](.cursor/rules/llm-pipeline-docs-sync.mdc).
