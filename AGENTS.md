# Agent entry (Sajtmaskin)

Tunn pekare — canonical innehåll finns redan i `docs/` och `.cursor/rules/`.

## Läs i denna ordning innan du börjar

1. [`docs/README.md`](docs/README.md) — dokumentationsnav
2. [`docs/concepts/mental-model.md`](docs/concepts/mental-model.md) — stabil mental modell
3. [`docs/architecture/code-map.md`](docs/architecture/code-map.md) — kodkarta
4. [`docs/architecture/glossary.md`](docs/architecture/glossary.md) — kanonisk ordlista
5. [`.cursor/README.md`](.cursor/README.md) — fulla regel-index + prioriteringsordning
6. [`.cursor/rules/terminology.mdc`](.cursor/rules/terminology.mdc) — snabb förväxlingstabell
7. [`config/env-policy.json`](config/env-policy.json) + [`docs/ENV.md`](docs/ENV.md) — env-sanning

## Kritiska regler att plocka upp tidigt

Välj utifrån vad du gör — komplett tabell finns i [`.cursor/README.md`](.cursor/README.md):

- **LLM-pipeline / gen:** [`pipeline-rules.mdc`](.cursor/rules/pipeline-rules.mdc), [`scaffold-rules.mdc`](.cursor/rules/scaffold-rules.mdc)
- **Git / commit / workflow:** [`git.mdc`](.cursor/rules/git.mdc), [`workflow.mdc`](.cursor/rules/workflow.mdc), [`agent-worktree.mdc`](.cursor/rules/agent-worktree.mdc) (flera agenter → använd `git worktree`)
- **Plattform:** [`platform-quirks.mdc`](.cursor/rules/platform-quirks.mdc) (Windows/PowerShell), [`unicode-regex.mdc`](.cursor/rules/unicode-regex.mdc)
- **Repo-router:** [`repo-router.mdc`](.cursor/rules/repo-router.mdc)
- **Lokal tooling (MCP/Vercel/Supabase/shadcn):** [`local-tooling-mcp.mdc`](.cursor/rules/local-tooling-mcp.mdc)
- **OpenClaw / env-flow:** [`openclaw-bridge.mdc`](.cursor/rules/openclaw-bridge.mdc), [`env-flow-f2-mute.mdc`](.cursor/rules/env-flow-f2-mute.mdc)
- **Observability:** [`agent-observatory.mdc`](.cursor/rules/agent-observatory.mdc), [`useful-commands.mdc`](.cursor/rules/useful-commands.mdc)
- **Plan-/bug-livscykel:** [`plan-lifecycle.mdc`](.cursor/rules/plan-lifecycle.mdc) — när planer ska parkas/avklaras/raderas + frontmatter-krav. Avklarad historik: läs det tunna indexet [`docs/plans/avklarat/README.md`](docs/plans/avklarat/README.md) + git — gräv inte i eller återskapa stora plandetaljfiler.
- **Terminologi / ton:** [`terminology.mdc`](.cursor/rules/terminology.mdc), [`response-format.mdc`](.cursor/rules/response-format.mdc)
- **MVP-fas:** [`mvp-scope-freeze.mdc`](.cursor/rules/mvp-scope-freeze.mdc) — stabilitet före coolhet; inga nya features, ytor eller UI-element utan uttrycklig begäran

## Codex Desktop

Projektets Codex-lager finns i [`.codex/README.md`](.codex/README.md) och
[`.codex/config.toml`](.codex/config.toml). Starta nya Codex-chattar med
repo-roten `C:\Users\jakem\dev\projects\sajtmaskin` som primary folder; då
upptäcks `AGENTS.md`, projektkonfig och worktree-regler på samma sätt varje gång.
Codex har ingen `.codexignore`; `.cursorignore` gäller Cursor, medan Codex
förlitar sig på `.gitignore`, instruktionerna här och `.worktreeinclude` för
hanterade worktrees.

## Allmänt per-PR-klart

- `npm run typecheck` → 0 errors
- `npm run lint` → 0 errors
- `npx vitest run` → existing tester gröna
- `node scripts/dev/check-unicode-regex.mjs` om du rört regex
- `npm run hygiene` → docs-färskhet + dödkod/orphan-filer i **en knapp** (grönt = rent, rött pekar på exakt problem). Full dödkods-lista: `npm run knip` (läs deps-kategorin försiktigt — mest falska positiver, se runbook). Städning + hur man läser knip: [`docs/runbooks/hygiene.md`](docs/runbooks/hygiene.md). CI blockerar på orphan-**filer** och docs-gates automatiskt.
- Synk docs/schemas/backoffice vid pipeline-ändringar (se [`pipeline-rules.mdc`](.cursor/rules/pipeline-rules.mdc))
- Commit- och PR-hygien enligt [`git.mdc`](.cursor/rules/git.mdc) och [`workflow.mdc`](.cursor/rules/workflow.mdc)
- **Alla PR:er går mot `master`** (trunk) — ingen direktcommit/-push till master. Kör ett **bugbot-pass** (bugbot-subagent, `model: <grok-4.5>`) på egen diff före PR/push. Se [`git.mdc`](.cursor/rules/git.mdc) → "Branch-modell".

## Vercel-åtkomst

Maskinen är inloggad och länkad mot Vercel (`vercel whoami` → `jakeminator0`, projekt `sajtmaskin`). CLI-loggar: `vercel logs <dpl>` (runtime), `vercel inspect <dpl> --logs` (build). Samlad logghämtning: `/logg`.

Servrar, projekt-id:n, OAuth och 403-felsökning: [`local-tooling-mcp.mdc`](.cursor/rules/local-tooling-mcp.mdc).

## Review guidelines

PR-författaren äger bugg-efterkontrollen. Kör ett **Cursor Bugbot-pass** på egen diff (`bugbot`-subagent, `readonly: true`, `model: <grok-4.5>`) före PR **och** före push till master — samma pass täcker både för-filter och efterkontroll för den head-SHA:n. Det finns **ingen** `bugbot run` CLI i repot; använd `review-bugbot`-skillen eller subagenten. Obs: `review-bugbot` är en global skill utanför repot och sätter **varken** `model` eller `readonly` — kör du den vägen måste du ange dem själv, annars ärvs sessionens modell tyst.

**Faller Bugbot bort, gå nedåt i stegen — hoppa inte direkt till manuell review.** Den GitHub-integrerade Bugbot:en delar teamets budget och svarar `Bugbot couldn't run - usage limit reached` när den är slut. Att budgeten är slut på GitHub betyder **inte** att passet ska utebli: den lokala `bugbot`-subagenten är en egen väg och ska köras då.

1. GitHub-integrerad Bugbot på PR:en (gratis oberoende ögon när budgeten räcker).
2. Är den slut eller utebliven → **berörd agent kör Cursor Bugbot-passet lokalt** (`subagent_type: "bugbot"`, `readonly: true`, `description: "Bugbot"`, `model: "<grok-4.5>"`).
3. Först om även det misslyckas → strukturerad manuell diff-granskning med fil- och radreferenser.

Dokumentera alltid i PR:en vilket steg som användes: `bugbot` (GitHub), `bugbot-local` (subagent) eller `manual local bug review`. Samma värde går i `bugkoll:`-fältet i `merge:ready`-sign-offen.

Utöver den generella P0/P1-listan, flagga som **P1**:

- F2/F3-status som blir grön **utan** verklig verifiering.
- **Saknade tester** när ändringen rör pipeline, preview, DB, autofix, dependency-hantering eller något runtime-kontrakt.

Canonical merge-grind (7-min-fönster, `merge:ready`-ordning, proportionalitet, protected paths, Codex-triage, author-is-merger): [`pr-merge-review-gate.mdc`](.cursor/rules/pr-merge-review-gate.mdc) · [`git.mdc`](.cursor/rules/git.mdc) · [`auto-merge-automation.mdc`](.cursor/rules/auto-merge-automation.mdc).

## Canonical owner-regel

Canonical owner avgörs per faktatyp enligt
[`docs/documentation-lifecycle.md`](docs/documentation-lifecycle.md). Kod äger
exekverbart beteende; manifest, registries och policies kan äga deklarativa
beslut. Genererad Markdown är projektion. Introducera inte nya begrepp utan att
registrera dem i glossaryn.

## Cursor Cloud Agent

Pod-specifik miljö och gotchas (injicerade secrets, Postgres/SSL, OpenAI-kvot, admin-email, `predev` i `dash`): [`docs/runbooks/cursor-cloud-agent.md`](docs/runbooks/cursor-cloud-agent.md).

Snabbstart oavsett miljö: `npm ci --no-audit --no-fund`, sedan `npm run dev` (eller `node scripts/dev/next-runner.mjs dev` för att hoppa över `predev`). Node 22.23.1 via Volta.
