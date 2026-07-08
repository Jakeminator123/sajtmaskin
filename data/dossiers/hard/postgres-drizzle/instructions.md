# When to use

- Use when the generated app needs persistent relational data in PostgreSQL.
- Use for server-side database access from Server Components, Server Actions, route handlers, or server utilities.
- Use when the app should manage schema and migrations with Drizzle Kit.
- Prefer this as the default database layer for dashboards, app shells, ecommerce, and SaaS-style apps.

# How to integrate

- Install `drizzle-orm`, `pg`, `@types/pg`, `server-only`, and `drizzle-kit`.
- Add `DATABASE_URL` from the Postgres provider.
- Emit the DB client at `lib/db/index.ts`, schema at `lib/db/schema.ts`, seed data at `lib/db/seed-data.ts`, and `drizzle.config.ts` at the project root.
- Replace the starter `items` schema table AND the matching `seedData` rows with tables/rows required by the app domain.
- Access the database ONLY through `getDb()` / `getPool()` from `@/lib/db` — never construct a Pool or Drizzle client yourself, and never at module level.
- SEED FALLBACK CONTRACT (required): every page/section that shows database content must branch on `isDbConfigured()` from `@/lib/db`. Configured → query via `getDb()`. Not configured → render `seedData` from `@/lib/db/seed-data` and mount a discreet `<DbConfigNotice />` (from `@/components/db-config-notice`) near that section. The site must render fully without `DATABASE_URL`.
- API routes that need the database must return a 503 JSON response with a short configuration message when `isDbConfigured()` is false (same pattern as `/api/health/db`) — never let a missing env var throw.
- Add scripts such as `db:generate`, `db:migrate`, `db:push`, and `db:studio` for Drizzle Kit.
- Use `@/lib/db` only from server code.
- Keep the `/api/health/db` route if the app or platform needs a database connectivity probe.

# UX rules

- Show loading, empty, and error states for database-backed UI.
- When seed data is shown, the config notice must be subtle (small muted banner) — the design preview should still look like the finished site.
- Validate user input before inserts or updates.
- Confirm destructive mutations before running them.
- Limit or paginate large result sets.
- Surface friendly errors to users; keep raw database errors in server logs.

# Avoid

- Do not import the DB client into client components.
- Do not expose `DATABASE_URL` or database credentials to the browser.
- Do not construct a Postgres pool at module level or per request — always go through `getPool()`.
- Do not skip the `isDbConfigured()` branch: an unconfigured database must show seed data, not a crash or a raw error.
- Do not treat `db:push` as the production migration strategy for mature apps.
- Do not keep the starter `items` schema or the generic seed rows if they do not match the app.
- Do not hardcode provider-specific SSL behavior without checking local development.

# Verification

- Start the app WITHOUT `DATABASE_URL`: pages must render seed data with the config notice, and `/api/health/db` must answer 503 — no crash, no raw DB error.
- Confirm `DATABASE_URL` is present in the target environment for real data.
- Run migration generation with Drizzle Kit.
- Apply migrations to the target database.
- Start the app and request `/api/health/db` — expect `{ "ok": true }`.
- Verify a real server-side read from a table.
- Verify a real server-side write through a route handler or server action.
- In development, confirm hot reload does not create runaway Postgres connections.
