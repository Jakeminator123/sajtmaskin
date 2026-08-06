# When to use

- Use when a Next.js app needs server-side SQL access to a Neon Postgres database and the user explicitly asked for Neon.
- Good fit for dashboards, CRUD apps, SaaS products, ecommerce data, and relational reporting.
- Use from Route Handlers, Server Actions, Server Components, or backend utilities only.
- Pair with a separate ORM or migration dossier if the app needs schema management.

# How to integrate

- Install `@neondatabase/serverless`.
- Set `DATABASE_URL` to the Neon pooled/serverless Postgres connection string.
- Access the database ONLY through `getSql()` from `@/lib/db` — never construct the Neon client yourself, and never at module level.
- SEED FALLBACK CONTRACT (required — this is the dossier's `mock: seed` mode): every page/section that shows database content must branch on `isDbConfigured()` from `@/lib/db`. Configured → query via `getSql()`. Not configured (missing OR a `preview`/`placeholder` stub URL) → render `seedData` from `@/lib/seed-data` and mount a discreet `<DbConfigNotice />` (from `@/components/db-config-notice`) near that section. The site must render fully without `DATABASE_URL`, so the DB view looks alive in an F2/preview without a real database.
- API routes that need the database must return a 503 JSON response with a short configuration message when `isDbConfigured()` is false (same pattern as `/api/health/db`) — never let a missing env var throw.
- Keep the database helper server-only; never import it from a `use client` component.
- Query with the Neon tagged template form so values are parameterized safely.
- Add or keep `/api/health/db` for deployment verification.

# UX rules

- Validate request input before running SQL.
- Return structured JSON errors from API routes.
- Show friendly UI errors; do not expose raw SQL or connection errors to users.
- When seed data is shown, the config notice must be subtle (small muted banner) — the design preview should still look like the finished site.
- Use limits and pagination for list queries.
- Treat the DB health route as operational diagnostics, not user-facing UI.

# Avoid

- Do not put the connection string in any `NEXT_PUBLIC_*` variable.
- Do not concatenate user input into SQL strings.
- Do not query Neon directly from browser/client components.
- Do not skip the `isDbConfigured()` branch: an unconfigured database must show seed data, not a crash or a raw error.
- Do not include unrelated MCP/OAuth/tool-discovery routes from the source template.
- Do not rely on a generic app health route to prove database connectivity.

# Verification

- Start the app WITHOUT `DATABASE_URL`: pages must render seed data with the config notice, and `/api/health/db` must answer 503 — no crash, no raw DB error.
- Confirm `DATABASE_URL` is configured locally and in the deployment environment for real data.
- Run the app and request `/api/health/db`.
- Expect a successful response after `select 1 as ok` reaches Neon.
- Test one real read/write route with parameterized SQL.
- On Vercel, redeploy after setting env vars and check function logs for connection or TLS errors.
