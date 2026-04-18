# When to use

Use this dossier when the site needs a relational database but you want SQLite semantics with a hosted Turso backend instead of running Postgres or a local SQLite file. It fits content apps, dashboards, internal tools, and MVPs that need typed queries and migrations with Drizzle in a Next.js App Router codebase.

# How to integrate

## 1. Install dependencies

Required packages:

```bash
npm install @libsql/client drizzle-orm
npm install -D drizzle-kit dotenv
```

If the project already has Drizzle, only add the Turso client pieces.

## 2. Add environment variables

```env
TURSO_DATABASE_URL=libsql://your-database-name-your-org.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token
```

Use server-only env access. Do not expose either value to the browser.

## 3. Create the Drizzle config

```ts
import "./envConfig";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./migrations",
  schema: "./db/schema.ts",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  },
});
```

This file is used by `drizzle-kit` for generating and applying migrations.

## 4. Create the database client

```ts
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) throw new Error("Missing TURSO_DATABASE_URL environment variable");
if (!authToken) throw new Error("Missing TURSO_AUTH_TOKEN environment variable");

const client = createClient({ url, authToken });
export const db = drizzle(client);
```

Keep this in a server-only module such as `db/index.ts`.

## 5. Define schema

Example:

```ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
```

Use `sqlite-core` column types, since Turso is SQLite-compatible.

## 6. Generate and run migrations

Typical scripts:

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  }
}
```

Then run:

```bash
npm run db:generate
npm run db:migrate
```

## 7. Query from server components, route handlers, or server actions

Example route handler:

```ts
import { db } from "@/db";
import { users } from "@/db/schema";

export async function GET() {
  const rows = await db.select().from(users);
  return Response.json(rows);
}
```

Example insert:

```ts
import { db } from "@/db";
import { users } from "@/db/schema";

await db.insert(users).values({
  email: "person@example.com",
  name: "Person",
});
```

# UX rules

- Perform database reads and writes on the server, not in client components.
- Show meaningful empty states for first-run databases with no rows.
- For mutations, provide loading and error states in forms or actions.
- If the UI depends on fresh writes, revalidate the affected route or fetch path after mutation.
- Treat Turso as production infrastructure: surface failures gracefully instead of crashing the page.

# Avoid

- Do not import the database client into client components.
- Do not expose `TURSO_DATABASE_URL` or `TURSO_AUTH_TOKEN` through `NEXT_PUBLIC_*` env vars.
- Do not use Postgres-specific Drizzle types or config; Turso uses the `turso` dialect and SQLite schema primitives.
- Do not rely on app template files like layout metadata, fonts, or demo pages as part of the integration.
- Do not skip migrations if the schema is intended to be reproducible across environments.

# Verification

1. Confirm env vars are set locally and in deployment.
2. Run migration generation successfully:

```bash
npm run db:generate
```

3. Apply migrations successfully:

```bash
npm run db:migrate
```

4. Add a simple server-side query and verify it returns rows without client-side secrets.
5. Deploy and confirm the production environment can connect to Turso using the same env var names.
6. If queries fail, verify:
   - the database URL starts with `libsql://`
   - the auth token is valid
   - the Drizzle schema path matches the actual file location
   - the code only accesses the database from server runtime code
