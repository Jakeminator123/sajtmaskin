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
- **Git / commit / workflow:** [`git.mdc`](.cursor/rules/git.mdc), [`workflow.mdc`](.cursor/rules/workflow.mdc), [`agent-worktree.mdc`](.cursor/rules/agent-worktree.mdc) (flera agenter → använd `git worktree`)
- **Plattform:** [`platform-quirks.mdc`](.cursor/rules/platform-quirks.mdc) (Windows/PowerShell), [`unicode-regex.mdc`](.cursor/rules/unicode-regex.mdc)
- **Repo-router:** [`repo-router.mdc`](.cursor/rules/repo-router.mdc)
- **OpenClaw / env-flow:** [`openclaw-bridge.mdc`](.cursor/rules/openclaw-bridge.mdc), [`env-flow-f2-mute.mdc`](.cursor/rules/env-flow-f2-mute.mdc)
- **Observability:** [`agent-observatory.mdc`](.cursor/rules/agent-observatory.mdc), [`useful-commands.mdc`](.cursor/rules/useful-commands.mdc)
- **Plan-/bug-livscykel:** [`plan-lifecycle.mdc`](.cursor/rules/plan-lifecycle.mdc) — när planer ska parkas/avklaras/raderas + frontmatter-krav
- **Terminologi / ton:** [`terminology.mdc`](.cursor/rules/terminology.mdc), [`response-format.mdc`](.cursor/rules/response-format.mdc)

## Allmänt per-PR-klart

- `npm run typecheck` → 0 errors
- `npm run lint` → 0 errors
- `npx vitest run` → existing tester gröna
- `node scripts/dev/check-unicode-regex.mjs` om du rört regex
- Synk docs/schemas/backoffice vid pipeline-ändringar (se [`pipeline-rules.mdc`](.cursor/rules/pipeline-rules.mdc))
- Commit- och PR-hygien enligt [`git.mdc`](.cursor/rules/git.mdc) och [`workflow.mdc`](.cursor/rules/workflow.mdc)

## Review guidelines (Codex/GitHub-review + fallback)

External Codex review (`chatgpt-codex-connector`) is **recommended, not a hard merge blocker**. If it can't run (out of credits/quota/outage) the PR/merge flow must **not** stall — fall back to an independent local review. Canonical merge-gate detail: [`pr-merge-review-gate.mdc`](.cursor/rules/pr-merge-review-gate.mdc).

**A review prioritizes P0/P1:** runtime regressions; false-green (a gate that turns green without real verification — verify / quality-gate / server-verify / promote / lifecycle / status); preview/VM failures; DB/schema drift; env/secret leaks; security/cross-tenant risk; broken LLM-pipeline contracts.

- Flag F2/F3 status that goes green **without** real verification as **P1**.
- Flag **missing tests as P1** when the change touches pipeline, preview, DB, autofix, dependency handling, or any runtime contract.
- Ignore taste/style unless it is a real UX/runtime/maintainability risk. Keep comments to concrete, merge-blocking problems.

**Fallback when Codex review can't run** (missing / errors / "out of credits") — do **not** wait or spin:

1. Run an independent Cursor Bugbot pass — the `review-bugbot` skill or the `bugbot` subagent (`subagent_type: "bugbot"`, `readonly: true`). There is **no** `bugbot run` CLI in this repo.
2. If Bugbot is unavailable, do a structured manual review of the diff: read `git diff`, identify changed owners/files, hunt for regressions / missing tests / env-DB-preview risk / false-green / broken contracts, run the repo verifications (`npm run typecheck`, targeted `npx vitest run`, `npm run lint`, `npm run db:schema-drift`, …), and summarize findings with file/line refs.

**Author-is-merger rule:** when the agent merging a PR is the **same** agent that authored it, re-reading your own diff is **not** review. If external Codex review is absent, the author-merger MUST get an *independent* pass — spawn the `bugbot` subagent (a separate agent) or a human — before merging, especially on protected paths (`src/lib/db|auth|tenant|gen|providers|integrations|logging`, `src/app/api`, CI, `package*`, `migrations`, `env*`, grandmaster-docs, `BUG-SWARM-BACKLOG.md`). Don't route around the Cursor PR Auto-Merger's `NEEDS_HUMAN` with a self-approval.

**Merge-ready criteria:**

- Codex ran, no P0/P1, verification passed → merge-ready.
- Codex couldn't run (credits/quota) **but** an *independent* review passed with no P0/P1 **and** verification passed → merge-ready. "Independent" = the reviewer is **not** the PR author: the `bugbot` subagent or a human. A `manual local bug review` qualifies **only** when done by a non-author merger reviewing someone else's PR; an **author-merger must use the `bugbot` subagent or a human** (per the Author-is-merger rule above) — re-reading your own diff never makes a PR merge-ready.
- Always state in the final report which review path was used: `codex-review`, `bugbot` (Cursor subagent), or `manual local bug review`.
- Triage every finding to exactly one of fixed / logged in [`BUG-SWARM-BACKLOG.md`](BUG-SWARM-BACKLOG.md) / dismissed (per [`pr-merge-review-gate.mdc`](.cursor/rules/pr-merge-review-gate.mdc)).

## Source-of-truth-regel

Kod är alltid source of truth. Introducera inte nya begrepp utan att registrera dem i glossaryn.

## Cursor Cloud specific instructions

### Environment

- Node.js 22.22.2 (pinned via Volta in `package.json`). The `.cursor/Dockerfile` builds from `node:22.22.2-bookworm`.
- Package manager: **npm** (lockfile: `package-lock.json`). Use `npm ci --no-audit --no-fund` to install.
- `.env.local` is gitignored. Secrets are injected as environment variables by the Cloud Agent platform; write them to `.env.local` before running the app (Next.js reads from dotenv).

### Running services

| Service | Command | Notes |
|---------|---------|-------|
| Next.js dev | `node scripts/dev/next-runner.mjs dev` | Starts on port 3000. Bypasses `predev` if DB init already done. Full `npm run dev` runs `predev` first (preflight checks, schema-drift, shadcn sync, db:init). |
| Inspector worker | Starts automatically with dev server | Runs on port 3310 (embedded in `next-runner.mjs`). |

### Gotchas

- `npm run dev` runs a `predev` hook that includes `db:perf-indexes:soft`. This may fail with `sh: Syntax error` in minimal shells (dash vs bash). It is soft-failing (`|| echo ...`) and does not block the dev server from starting. If `predev` exits non-zero, run `node scripts/dev/next-runner.mjs dev` directly.
- The `db:init` script requires `POSTGRES_URL` to be set. Without it, the script exits with code 1 — but the Next.js app itself starts fine (DB features degrade gracefully).
- **Local Postgres SSL:** For local Postgres without SSL, add `?sslmode=disable` to `POSTGRES_URL`. Both `db-init.mjs` and the runtime client respect this parameter.
- **Cloud Agent injected Postgres (self-signed cert):** The platform-injected Supabase `POSTGRES_URL` uses TLS with a **self-signed certificate chain**, so `db-init` and runtime DB queries fail with `self-signed certificate in certificate chain` under the default strict verification. Set `DB_SSL_REJECT_UNAUTHORIZED=false` (e.g. add it to a gitignored `.env.local`) before running `db:init` or any DB-backed flow (saving projects/chats/versions). Both `scripts/db/db-init.mjs` and `src/lib/db/client.ts` honor this flag. The app still boots without it, but DB persistence degrades.
- **`predev` `db:init:soft` aborts in `dash`:** The `npm run db:init:soft` script's `|| echo [db:init] WARN: skipped (DB unreachable) - dev continues` fails at shell-parse time in `dash`/`sh` because of the unquoted `(DB unreachable)` parens (`sh: Syntax error: "(" unexpected`). This is independent of whether `db-init` succeeds, and it makes `predev`'s `&&` chain exit non-zero, so `npm run dev` never reaches `next dev`. Run `node scripts/dev/next-runner.mjs dev` directly (preferred) or `SKIP_PREDEV=1 npm run dev`.
- **Migration ordering:** Fixed -- `db-init.mjs` runs dependency migrations first automatically. No manual steps needed on fresh DB.
- **Testing the generate flow (own-engine → Tier-2 preview):** A prompt from the landing page creates a project and pre-fills the builder chat, but generation only starts after an explicit send in the builder chat input. Anonymous sessions get **one** free generation, then the builder shows "Du har använt din gratis generation. Skapa ett konto för att fortsätta bygga!". To run/repeat full generations, use an account with credits: set `ADMIN_EMAILS=<email>` for the dev process and register that email (auto-verified, 10 000 diamonds, auto-logged-in) — then log in and generate. Full generation streams files and then boots a remote Tier-2 preview-host that renders the site (takes ~2 min end-to-end).
- Typecheck uses `--max-old-space-size=8192`; ensure sufficient memory.
- All test files pass as of 2026-05. If a test fails, investigate — it is likely a real regression, not a pre-existing environment issue. **Exception in the Cloud Agent env:** `npm run test:ci` reports 3 failures (`src/lib/kostnadsfri/index.test.ts`, `src/app/api/domains/link/route.test.ts`, `src/app/api/kostnadsfri/[slug]/verify/route.test.ts`) that are caused purely by platform-injected secrets (`VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `KOSTNADSFRI_API_KEY`, `KOSTNADSFRI_PASSWORD_SEED`) — these negative-path tests assume those vars are unset. They are not regressions; they pass when those vars are unset (e.g. `env -u VERCEL_PROJECT_ID -u VERCEL_TEAM_ID -u KOSTNADSFRI_API_KEY -u KOSTNADSFRI_PASSWORD_SEED npx vitest run <files>`). Other known pre-existing test failures are tracked in [`BUG-SWARM-BACKLOG.md`](BUG-SWARM-BACKLOG.md) (e.g. 2 `PreviewPanel.test.tsx` save-flow tests) — check there before assuming a regression.

### Useful commands (see `package.json` for full list)

- `npm run typecheck` — TypeScript check (0 errors expected)
- `npm run lint` — ESLint (0 errors expected)
- `npm run test:ci` — Vitest run all tests
- `npm run dev` — Full dev startup with preflight
- `node scripts/dev/next-runner.mjs dev` — Dev server only (skip predev)
