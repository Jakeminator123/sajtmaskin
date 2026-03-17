# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Sajtmaskin is an AI-powered Swedish website builder (Next.js 16, React 19, TypeScript 5.9). Users describe a website in natural language and get a working site generated, previewed, and deployed. See `.cursor/rules/project-overview.mdc` for the full architecture.

### Running the app

- `npm run dev` starts the Next.js dev server on port 3000 (Turbopack). It also runs `predev` which executes `scripts/refresh-token.mjs` (OIDC token refresh — will warn/fail harmlessly without Vercel CLI auth) and `scripts/db-init.mjs` (idempotent DB schema setup).
- The dev server auto-starts the inspector-worker sidecar on port 3310 if `INSPECTOR_CAPTURE_WORKER_URL` points to localhost.

### Environment

- All secrets are injected as environment variables by the Cloud Agent VM. A `.env.local` file must be created from these injected env vars before running the app, because `predev` scripts and `next-runner.mjs` read from `.env.local` directly.
- The OIDC token refresh in `predev` will fail without `vercel login` — this is safe to ignore; it doesn't block the dev server.

### Key commands

| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Unit/integration tests | `npm run test:ci` |
| DB schema init | `npm run db:init` |
| Scaffold validation | `npm run scaffolds:validate` |
| Full dev check | `npm run devtest` |

### Known pre-existing test failures

As of setup, 7 tests out of 282 fail on `main` (pre-existing):
- `src/lib/rateLimit.test.ts` — rate limit header test
- `src/lib/builder/promptLimits.test.ts` — 4 tests with stale expected values
- `src/app/api/v0/chats/[chatId]/stream/route.test.ts` — 2 clarification flow tests returning 500

### Gotchas

- No lockfile is committed. `npm install` uses whatever npm resolves. Dependency versions may drift between sessions.
- `.nvmrc` says 25.4.0 but `package.json` engines require `>=22.0.0`. The Cloud VM ships Node 22.x which works fine.
- The `predev` hook runs `refresh-token.mjs` which tries `npx vercel env pull`; it fails without Vercel CLI credentials but is non-blocking.
