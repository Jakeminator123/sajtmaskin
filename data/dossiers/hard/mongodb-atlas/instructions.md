# When to use

- Use when the app explicitly needs MongoDB Atlas as a server-side database.
- Best for Next.js App Router route handlers, Server Actions, server utilities, dashboards, internal tools, and ecommerce backends.
- Use only for server-side database access; credentials must never reach browser code.

# How to integrate

- Set `MONGODB_URI` locally and in the deployment environment using a MongoDB Atlas driver connection string.
- Access the database ONLY through `getMongoDb()` from `@/lib/mongodb` — never construct a `MongoClient` yourself, and never at module level.
- SEED FALLBACK CONTRACT (required — this is the dossier's `mock: seed` mode): every page/section that shows database content must branch on `isDbConfigured()` from `@/lib/mongodb`. Configured → query via `getMongoDb()`. Not configured (missing OR a `preview`/`placeholder` stub URI) → render `seedData` from `@/lib/seed-data` and mount a discreet `<DbConfigNotice />` (from `@/components/db-config-notice`) near that section. The site must render fully without `MONGODB_URI`, so the DB view looks alive in an F2/preview without a real database.
- API routes that need the database must return a 503 JSON response with a short configuration message when `isDbConfigured()` is false (same pattern as `/api/health/db`) — never let a missing env var throw.
- Query MongoDB from `app/api/**/route.ts`, Server Actions, server-only data modules, or jobs.
- Use the health route at `/api/health/db` during setup to verify Atlas connectivity.
- Convert `ObjectId` values to strings before returning documents to client components or JSON consumers.

# UX rules

- Show friendly empty states when collections contain no matching documents.
- When seed data is shown, the config notice must be subtle (small muted banner) — the design preview should still look like the finished site.
- Show generic database failure messages to users and log details only on the server.
- Provide loading, retry, and clear success/failure states around database-backed UI.
- For mutations, validate input before writing and return explicit write results.

# Avoid

- Do not import the MongoDB helper into client components.
- Do not create a new `MongoClient` inside every request handler — always go through `getMongoClientPromise()`/`getMongoDb()`.
- Do not skip the `isDbConfigured()` branch: an unconfigured database must show seed data, not a crash or a raw error.
- Do not expose `MONGODB_URI` or derived credentials to the client.
- Do not return raw documents with unconverted `ObjectId` values when JSON serialization matters.
- Do not use this dossier unless MongoDB Atlas is specifically requested.

# Verification

- Start the app WITHOUT `MONGODB_URI`: pages must render seed data with the config notice, and `/api/health/db` must answer 503 — no crash, no raw DB error.
- Confirm `MONGODB_URI` is set to a valid Atlas connection string for real data.
- Start the app and request `/api/health/db`.
- Expect `{ "ok": true }` from the health route.
- If it fails, check Atlas network access, database user permissions, the exact URI value, and selected default database.
- Add a temporary server-only read against one collection and confirm documents can be returned safely.
- In development, confirm hot reload reuses the cached client connection instead of opening new ones.
