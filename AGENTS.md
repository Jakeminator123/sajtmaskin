# Agent entry (Sajtmaskin)

Tunn pekare — canonical innehåll finns redan i `docs/` och `.cursor/rules/`.

## Läs i denna ordning innan du börjar

1. [`docs/README.md`](docs/README.md) — dokumentationsnav
2. [`docs/architecture/code-map.md`](docs/architecture/code-map.md) — kodkarta
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
- **Alla PR:er går mot `master`** (trunk) — ingen direktcommit/-push till master. Kör `/granska` före PR/push. Se [`git.mdc`](.cursor/rules/git.mdc) → "Branch-modell".

## Vercel-åtkomst (CLI + MCP) — inloggat läge

Lokala maskinen är **inloggad och länkad** mot Vercel (verifierat 2026-07-02):

- **CLI:** `vercel whoami` → `jakeminator0`. Repot är länkat via `vercel link --yes` → `.vercel/repo.json` (gitignored) med projekt `sajtmaskin` (`prj_AK7FqC8NwKorjoxGpkXi6nKGUsoe`, team `jakeminator123s-projects`). Länka om med `npm run vercel:link` om `.vercel/` saknas.
- **Loggar via CLI:** `vercel logs <deployment-url|dpl_id>` (runtime, live), `vercel inspect <dpl> --logs` (build). Prod-env: `npm run env:pull:prod-snapshot`.
- **MCP:** `.cursor/mcp.json` har projekt-scopad server `vercel` (`https://mcp.vercel.com/jakeminator123s-projects/sajtmaskin`) — engångs-OAuth via "Needs login" i Cursor. Fungerar även: user-nivå `user-vercel`. **Obs:** plugin-varianten (`plugin-vercel-vercel`) kan ge 403 — byt server i stället för att felsöka.
- **Samlad logg-hämtning:** `/logg` (senaste prod-sajten, alla källor) · `node scripts/db/control-stats.mjs --json --env=.env.vercel.production.pulled --days=14 --allow-insecure-ssl` (kvantitativ kontroll-statistik) · `node scripts/db/dump-logs.mjs` (rå export).

## Review guidelines (PR author owns the bug post-check)

**Codex review may be on or off depending on credits** (off 2026-07-02, back 2026-07-08). Never *block indefinitely* on `chatgpt-codex-connector` or treat its absence as a gap (a **bounded** 7-min window applies before merge — see below — after which the author's bugbot pass covers external eyes) — but **if a Codex review is present, read and triage it** (it can land a few minutes after CI goes green, so re-read reviews right before merge). Regardless of Codex, the **PR-authoring agent** owns the bug post-check. Canonical merge-gate detail: [`pr-merge-review-gate.mdc`](.cursor/rules/pr-merge-review-gate.mdc).

**A review prioritizes P0/P1:** runtime regressions; false-green (a gate that turns green without real verification — verify / quality-gate / server-verify / promote / lifecycle / status); preview/VM failures; DB/schema drift; env/secret leaks; security/cross-tenant risk; broken LLM-pipeline contracts.

- Flag F2/F3 status that goes green **without** real verification as **P1**.
- Flag **missing tests as P1** when the change touches pipeline, preview, DB, autofix, dependency handling, or any runtime contract.
- Ignore taste/style unless it is a real UX/runtime/maintainability risk. Keep comments to concrete, merge-blocking problems.
- **Proportionality (the gate protects, it does not brake):** a well-motivated improvement is **never** held back by style nits — log the nit (P2/backlog) and merge. Restrictive on real breakage (P0/P1, security, broken schema/policy/test/contract, false-green), generous on value. A nitpicky/flaky gate that catches no real risk → log + merge, fix the gate separately. Canonical table: [`pr-merge-review-gate.mdc`](.cursor/rules/pr-merge-review-gate.mdc) → "Proportionalitet".

**Before opening the PR:** run `/granska` (8 `composer-2.5-fast` subagents on your own diff) as a pre-filter — also before any push to master. See [`git.mdc`](.cursor/rules/git.mdc). It does **not** replace the post-check below.

**Bug post-check (run by the PR author, before or right after opening the PR):**

1. Spawn a Cursor Bugbot pass — the `review-bugbot` skill or the `bugbot` subagent (`subagent_type: "bugbot"`, `readonly: true`). The subagent is a separate agent instance, so this satisfies the independent-eyes requirement even though the author drives it. There is **no** `bugbot run` CLI in this repo.
2. If Bugbot is unavailable, do a structured manual review of the diff: read `git diff`, identify changed owners/files, hunt for regressions / missing tests / env-DB-preview risk / false-green / broken contracts, run the repo verifications (`npm run typecheck`, targeted `npx vitest run`, `npm run lint`, `npm run db:schema-drift`, …), and summarize findings with file/line refs.
3. Document the outcome in the PR (which path was used + finding triage) so the merging agent does not redo the pass — the merger's job is to verify the post-check is documented, checks are green, and no P0/P1 is open.

**7-min external-review window:** after opening the PR, wait up to 7 min for a Codex review to land; if none does, run the `bugbot` subagent (above). Never merge a PR younger than 7 min (`gh pr view <n> --json createdAt`) — external reviewers need time to look. This window is now **technically enforced** by the required check `review-window` (`.github/workflows/review-window.yml`), which stays pending until the PR is ≥ 7 min old **and** the known external bots for the head SHA have finished (10-min cap). A normal `gh pr merge` therefore cannot happen too early; `--admin` can still override it, so verify age manually on admin merges. Detail: [`pr-merge-review-gate.mdc`](.cursor/rules/pr-merge-review-gate.mdc) → "Minsta granskning innan merge".

**Author-is-merger rule:** re-reading your own diff is never review. The `bugbot` subagent pass (a separate agent) is the minimum on protected paths (`src/lib/db|auth|tenant|gen|providers|integrations|logging`, `src/app/api`, CI, `package*`, `migrations`, `env*`, grandmaster-docs, `BUG-SWARM-BACKLOG.md`). Don't self-approve around a `NEEDS_HUMAN` verdict. (The dashboard PR Auto-Merger is off per the 2026-07-09 agent-merger decision; if it is ever re-enabled, the same no-self-approval rule applies to its verdict.)

**Merge-ready criteria:**

- The author's bug post-check ran (bugbot subagent, or documented manual review when Bugbot is unavailable), no open P0/P1, verification passed, PR ≥ 7 min old with the external-review window satisfied → merge-ready.
- The author then applies the **`merge:ready`** label + a sign-off line; the **merge-agent** (a Cursor agent) verifies the label + gate and runs `gh pr merge`. There is **no** dashboard auto-merger in the flow (decision 2026-07-09: agent-merger) — see [`auto-merge-automation.mdc`](.cursor/rules/auto-merge-automation.mdc) → "Vem mergar".
- Codex may be present or absent depending on credits — never block *waiting* for it to appear, but if a Codex review **is** present, read and triage its findings like any other bot (a P1/security finding blocks merge; P2 is fixed or logged — see [`pr-merge-review-gate.mdc`](.cursor/rules/pr-merge-review-gate.mdc)).
- Always state in the PR/final report which review path was used: `bugbot` (Cursor subagent) or `manual local bug review`.
- Triage every finding to exactly one of fixed / logged in [`BUG-SWARM-BACKLOG.md`](BUG-SWARM-BACKLOG.md) / dismissed (per [`pr-merge-review-gate.mdc`](.cursor/rules/pr-merge-review-gate.mdc)).

## Source-of-truth-regel

Kod är alltid source of truth. Introducera inte nya begrepp utan att registrera dem i glossaryn.

## Cursor Cloud specific instructions

### Environment

- Node.js 22.23.1 (pinned via Volta in `package.json`). The `.cursor/Dockerfile` builds from `node:22.23.1-bookworm`.
- Package manager: **npm** (lockfile: `package-lock.json`). Use `npm ci --no-audit --no-fund` to install.
- `.env.local` is gitignored. Secrets are injected as environment variables by the Cloud Agent platform; write them to `.env.local` before running the app (Next.js reads from dotenv).

### Running services

| Service | Command | Notes |
|---------|---------|-------|
| Next.js dev | `node scripts/dev/next-runner.mjs dev` | Starts on port 3000. Bypasses `predev` if DB init already done. Full `npm run dev` runs `predev` first (preflight checks, schema-drift, shadcn sync, db:init). |

### Gotchas

- `npm run dev` runs a `predev` hook that includes `db:perf-indexes:soft`. This may fail with `sh: Syntax error` in minimal shells (dash vs bash). It is soft-failing (`|| echo ...`) and does not block the dev server from starting. If `predev` exits non-zero, run `node scripts/dev/next-runner.mjs dev` directly.
- The `db:init` script requires `POSTGRES_URL` to be set. Without it, the script exits with code 1 — but the Next.js app itself starts fine (DB features degrade gracefully).
- **Not every flow degrades gracefully without a DB — the landing→builder entry flow needs Postgres:** the landing-page prompt submit calls `POST /api/projects`, which requires a DB. With no `POSTGRES_URL` set, that route returns an HTML `500` and the landing submit fails client-side with `SyntaxError: Unexpected token '<', "<!DOCTYPE"... is not valid JSON` (never navigating to `/builder`). If the Cloud Agent env has **no** injected Postgres at all, spin up a throwaway local Postgres (`apt-get install -y postgresql`, `pg_ctlcluster 16 main start`, create a DB) and point `POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/<db>?sslmode=disable` in `.env.local`, then run `npm run db:init` and restart the dev server so it picks up `.env.local`.
- **Local Postgres SSL:** For local Postgres without SSL, add `?sslmode=disable` to `POSTGRES_URL`. Both `db-init.mjs` and the runtime client respect this parameter.
- **Cloud Agent injected Postgres (self-signed cert):** The platform-injected Supabase `POSTGRES_URL` uses TLS with a **self-signed certificate chain**, so `db-init` and runtime DB queries fail with `self-signed certificate in certificate chain` under the default strict verification. Set `DB_SSL_REJECT_UNAUTHORIZED=false` (e.g. add it to a gitignored `.env.local`) before running `db:init` or any DB-backed flow (saving projects/chats/versions). Both `scripts/db/db-init.mjs` and `src/lib/db/client.ts` honor this flag. The app still boots without it, but DB persistence degrades.
- **`predev` `db:init:soft` aborts in `dash`:** The `npm run db:init:soft` script's `|| echo [db:init] WARN: skipped (DB unreachable) - dev continues` fails at shell-parse time in `dash`/`sh` because of the unquoted `(DB unreachable)` parens (`sh: Syntax error: "(" unexpected`). This is independent of whether `db-init` succeeds, and it makes `predev`'s `&&` chain exit non-zero, so `npm run dev` never reaches `next dev`. Run `node scripts/dev/next-runner.mjs dev` directly (preferred) or `SKIP_PREDEV=1 npm run dev`.
- **Migration ordering:** Fixed -- `db-init.mjs` runs dependency migrations first automatically. No manual steps needed on fresh DB.
- **Testing the generate flow (own-engine → preview):** Generation starts only after an explicit send in the builder chat input — the landing-page prompt just creates the project and pre-fills the input. Anonymous sessions get **one** free generation (`guestLimit: 1` for `prompt.create`/`prompt.template` in `src/lib/credits/server.ts`), after which the builder shows the "Du har använt din gratis generation"-gate. To run or repeat full generations, use an account with credits: set `ADMIN_EMAILS=<email>` for the dev process and register that email (auto-verified, auto-logged-in, large credit grant), then log in and generate. Full generation streams files locally and then renders a live preview on the remote preview host (`SAJTMASKIN_PREVIEW_HOST_BASE_URL`, a Fly.dev VM) — confirm that host is reachable before relying on preview-based E2E tests; the full prompt → generate → preview loop takes ~2 min end-to-end.
- **`.env.local` does NOT override Cloud-injected env vars (admin-email gotcha):** Next.js dotenv only fills vars that are *not already set* in the real process env. The Cloud Agent platform injects `ADMIN_EMAILS`/`NEXT_PUBLIC_ADMIN_EMAILS` (a redacted real admin email) into the environment, so appending your own test email to `.env.local` is silently ignored — `isAdminEmail()`/`isTestUser()` read the injected value, the account is treated as a normal guest (email-verification required, `0 credits`, credit gate blocks generation), and `bootstrapAdminUser` never grants diamonds. To use a self-chosen admin test email, **export it in the dev process** so it wins, e.g. start the server with `ADMIN_EMAILS="$ADMIN_EMAILS,you@test.dev" NEXT_PUBLIC_ADMIN_EMAILS="$NEXT_PUBLIC_ADMIN_EMAILS,you@test.dev" node scripts/dev/next-runner.mjs dev`. Then registering + logging in that email auto-verifies it and grants 10 000 diamonds on login (`src/lib/auth/auth.ts` `bootstrapAdminUser`). (Alternatively, just grant diamonds directly via SQL: `UPDATE users SET diamonds=10000 WHERE email='<you>'`.)
- **First request to a freshly-restarted dev server can 404 (Turbopack cold compile):** right after restarting the dev server, the very first hit to an on-demand-compiled API route (e.g. `/api/engine/chats/stream`) may briefly return `HTTP 404` / "Failed to create chat (HTTP 404)" before the route finishes compiling. Retry after a couple seconds; it resolves once the route is built.
- **LLM provider keys in Cloud Agent env — OpenAI is out of quota:** The injected `OPENAI_API_KEY` authenticates (HTTP 200) but has **no billing quota** (every call returns `429 You exceeded your current quota`). So any build profile that routes codegen through OpenAI — **Snabb / Lagom (default) / Tanker / Kod Max** — fails the generation stream instantly with `Stream error` → `Model produced no text events (silent output). No code was emitted`. The injected `ANTHROPIC_API_KEY` **works** (its account exposes `claude-opus-4-8` etc.). To exercise end-to-end site generation in the builder, select the **"Anthropic"** build profile (header model selector "Modell: …"), which routes the `generator`/brief phases to `claude-opus-4.8` (normalized to `claude-opus-4-8`). The dependent OpenAI-only steps (server auto-brief, scaffold embeddings, post-gen verifier/autofix) soft-fail/degrade and do not block code generation. Anthropic-tier generation streams real files and starts a preview session on the configured preview host.
- **Guest Deep Brief returns 401 by design:** `/api/ai/brief` (client-triggered Deep Brief) intentionally returns 401 for guest/anonymous users — that is by design and is soft (server auto-brief covers create-chat), not a misconfiguration. (The guest generation quota itself is covered above: one free generation per session cookie.)
- Typecheck uses `--max-old-space-size=8192`; ensure sufficient memory.
- All test files pass as of 2026-05. If a test fails, investigate — it is likely a real regression, not a pre-existing environment issue. **Exception in the Cloud Agent env:** `npm run test:ci` reports 3 failures (`src/lib/kostnadsfri/index.test.ts`, `src/app/api/domains/link/route.test.ts`, `src/app/api/kostnadsfri/[slug]/verify/route.test.ts`) that are caused purely by platform-injected secrets (`VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `KOSTNADSFRI_API_KEY`, `KOSTNADSFRI_PASSWORD_SEED`) — these negative-path tests assume those vars are unset. They are not regressions; they pass when those vars are unset (e.g. `env -u VERCEL_PROJECT_ID -u VERCEL_TEAM_ID -u KOSTNADSFRI_API_KEY -u KOSTNADSFRI_PASSWORD_SEED npx vitest run <files>`). Other known pre-existing test failures are tracked in [`BUG-SWARM-BACKLOG.md`](BUG-SWARM-BACKLOG.md) (e.g. 2 `PreviewPanel.test.tsx` save-flow tests) — check there before assuming a regression.

### Useful commands (see `package.json` for full list)

- `npm run typecheck` — TypeScript check (0 errors expected)
- `npm run lint` — ESLint (0 errors expected)
- `npm run test:ci` — Vitest run all tests
- `npm run dev` — Full dev startup with preflight
- `node scripts/dev/next-runner.mjs dev` — Dev server only (skip predev)
