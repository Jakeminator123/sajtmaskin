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
- **Builder/coexistence + repo-router:** [`builder-coexistence.mdc`](.cursor/rules/builder-coexistence.mdc), [`repo-router.mdc`](.cursor/rules/repo-router.mdc)
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
- **Cloud-injected Postgres SSL:** The managed `POSTGRES_URL` injected into Cloud Agent VMs presents a self-signed certificate chain, so `db:init` (and runtime DB access) fail with `self-signed certificate in certificate chain` unless `DB_SSL_REJECT_UNAUTHORIZED=false` is set. This is now baked into `.cursor/Dockerfile` (`ENV DB_SSL_REJECT_UNAUTHORIZED=false`); if that change is not yet merged, export it before running `db:init`/dev.
- **Migration ordering:** Fixed -- `db-init.mjs` runs dependency migrations first automatically. No manual steps needed on fresh DB.
- Typecheck uses `--max-old-space-size=8192`; ensure sufficient memory.
- Test files pass as of 2026-05. If a test fails, investigate — it is usually a real regression. Known exception: when the platform injects real secrets, 3 unit tests that assert *unconfigured* behavior fail because the value now exists — `src/lib/kostnadsfri/index.test.ts` + `src/app/api/kostnadsfri/[slug]/verify/route.test.ts` (driven by `KOSTNADSFRI_PASSWORD_SEED`/`KOSTNADSFRI_API_KEY`) and `src/app/api/domains/link/route.test.ts` (driven by `VERCEL_PROJECT_ID`/`VERCEL_TEAM_ID`). They pass once those vars are unset; not regressions.
- **Guest generation limits:** Without logging in, the builder runs as a guest. Guests have a free-generation cap (`guest_usage` table) and max 3 projects per session (`app_projects` where `user_id IS NULL`). When exhausted you see "Du har använt din gratis generation" or "Gästkontot kan skapa max 3 projekt". To keep testing the generation flow, either log in, or clear the guest rows: `DELETE FROM guest_usage` and `DELETE FROM app_projects WHERE user_id IS NULL AND session_id IS NOT NULL`. The Next.js dev error overlay for these is sticky in the browser tab — dismiss it (Escape) and reload after clearing.
- **Guest brief 401 (expected):** `POST /api/ai/brief` returns 401 for guest sessions by design (`userId.startsWith("guest:")`); the builder surfaces "Instruktions-generering misslyckades: unauthorized" but generation continues with a server-auto brief. Not an environment problem.
- **Live preview** of generated sites uses the external preview-host at `SAJTMASKIN_PREVIEW_HOST_BASE_URL` (a shared Fly.io app); generation + preview work end-to-end against it from the VM.

### Useful commands (see `package.json` for full list)

- `npm run typecheck` — TypeScript check (0 errors expected)
- `npm run lint` — ESLint (0 errors expected)
- `npm run test:ci` — Vitest run all tests
- `npm run dev` — Full dev startup with preflight
- `node scripts/dev/next-runner.mjs dev` — Dev server only (skip predev)
