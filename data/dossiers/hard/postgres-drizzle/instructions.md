# When to use

Use for persistent relational data in PostgreSQL.

# How to integrate

Use `getDb()`/`getPool()` and seed fallback; if Prisma is explicit, do not add Drizzle.

# UX rules

- Show loading, empty, and error states for database-backed UI.
- When seed data is shown, the config notice must be subtle (small muted banner) — the design preview should still look like the finished site.
- Validate user input before inserts or updates.
- Confirm destructive mutations before running them.
- Limit or paginate large result sets.
- Surface friendly errors to users; keep raw database errors in server logs.

# Avoid

Run migrations, queries, or writes only in an authorized test environment; never expose `DATABASE_URL`.

# Verification

- Perform every migration, query, and write check below only in an authorized test environment.
- Start the app WITHOUT `DATABASE_URL`: pages must render seed data with the config notice, and `/api/health/db` must answer 503 — no crash, no raw DB error.
- Confirm `DATABASE_URL` points to the authorized test database before real-data checks.
- Run migration generation with Drizzle Kit.
- Apply migrations to that authorized test database.
- Start the app and request `/api/health/db` — expect `{ "ok": true }`.
- Verify a real server-side read from a table.
- Verify a real server-side write through a route handler or server action.
- In development, confirm hot reload does not create runaway Postgres connections.
