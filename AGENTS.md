# AGENTS.md

## Cursor Cloud specific instructions

### Services overview

Sajtmaskin is a single Next.js 16 application (not a monorepo). The dev server runs the main app and optionally auto-starts the inspector-worker sidecar.

| Service | Command | Port | Notes |
|---|---|---|---|
| Next.js dev server | `npm run dev` | 3000 | Runs `predev` hook first (systemprompt check, token refresh, db:init) |
| Inspector worker | auto-started by `npm run dev` when `INSPECTOR_CAPTURE_WORKER_URL` contains `localhost` | 3310 | Optional Playwright-based screenshot service |

### Lint / Test / Build / Typecheck

Standard commands documented in `package.json`:

- **Lint:** `npm run lint` (ESLint, warnings only — 0 errors expected)
- **Tests:** `npm run test:ci` (Vitest, 73 test files, 332 tests)
- **Typecheck:** `npm run typecheck` (`tsc --noEmit`)
- **Build:** `npm run build` (production build)
- **Dev:** `npm run dev` (Turbopack dev server)
- **Full check:** `npm run devtest` (typecheck + scaffold validate + test:ci + lint)

### Environment variables

All secrets are injected as environment variables by the Cloud Agent platform. The `predev` hook (run automatically by `npm run dev`) reads from `.env.local`, so a `.env.local` file must be created from the injected env vars before running the dev server. The `db-init.mjs` script also reads from `.env.local` via dotenv.

Key requirement: `POSTGRES_URL` must point to a valid Supabase PostgreSQL instance. `OPENAI_API_KEY` is needed for AI generation. `JWT_SECRET` defaults to a dev value if unset.

### Database

`npm run db:init` (also run as part of `predev`) creates all tables idempotently using `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. No separate migration step needed for fresh setups.

### Non-obvious caveats

- The `predev` script runs `scripts/refresh-token.mjs` which tries to refresh `VERCEL_OIDC_TOKEN` from `.env.local`. If no `.env.local` exists or no token is found, it skips gracefully — this is not a blocker.
- The `scripts/next-runner.mjs` filters out `--localstorage-file` from `NODE_OPTIONS` (injected by some environments). This is handled automatically.
- The inspector worker will only auto-start if `INSPECTOR_CAPTURE_WORKER_URL` contains `localhost` AND the `services/inspector-worker/server.mjs` file exists. Without Playwright browsers installed (`npm run inspector:install`), the worker may fail — this is non-fatal for the main app.
- Redis is optional: without `REDIS_URL`, the app works but without caching (all requests go directly to Postgres). Rate limiting falls back to in-memory.
- `DB_SSL_REJECT_UNAUTHORIZED=false` is needed when connecting to Supabase from environments with non-standard CA certificates.
