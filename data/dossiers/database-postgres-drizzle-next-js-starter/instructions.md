# When to use

Use this dossier when the site needs persistent relational data in PostgreSQL and the app is built with Next.js. Choose it when you want:

- type-safe SQL access with Drizzle ORM
- migrations checked into the repo
- server-side data access in Server Components, Route Handlers, or Server Actions
- a simple, production-ready Postgres setup without a heavy backend framework

This dossier is best for app-shell, dashboard, ecommerce, and SaaS-style builds. It is optional for content-heavy sites that only need a small database-backed feature.

# How to integrate

## 1. Install dependencies

```bash
npm install drizzle-orm pg
npm install -D drizzle-kit
```

## 2. Add environment variables

```env
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DB_NAME
```

Use a standard Postgres connection string. Prefer a pooled connection string from the hosting provider when available.

## 3. Create the schema

Create `lib/db/schema.ts`:

```ts
import { integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

Keep schema definitions in server-only code.

## 4. Create the database client

Create `lib/db/index.ts`:

```ts
import 'server-only';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const globalForDb = globalThis as typeof globalThis & {
  __pgPool?: Pool;
};

const pool =
  globalForDb.__pgPool ??
  new Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__pgPool = pool;
}

export const db = drizzle(pool, { schema });
```

This global pool pattern avoids opening too many connections during local hot reload.

## 5. Add Drizzle config

Create `drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
});
```

If your repo structure differs, update the `schema` path.

## 6. Add migration scripts

In `package.json`:

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

Recommended flow for production apps:

- use `db:generate` to create SQL migration files
- commit migrations to the repo
- run `db:migrate` in CI/CD or during deployment

Use `db:push` mainly for prototypes and early development.

## 7. Query from server code only

Example in a Server Component:

```tsx
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

export default async function UsersPage() {
  const allUsers = await db.select().from(users).orderBy(users.createdAt);

  return (
    <ul>
      {allUsers.map((user) => (
        <li key={user.id}>{user.email}</li>
      ))}
    </ul>
  );
}
```

Example insert in a Server Action or Route Handler:

```ts
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

export async function createUser(email: string, name?: string) {
  await db.insert(users).values({ email, name });
}
```

Example filtered query:

```ts
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

export async function getUserByEmail(email: string) {
  return db.query.users.findFirst({
    where: eq(users.email, email),
  });
}
```

## 8. Add a health check route

Create a route handler that runs `select 1` so deployments can verify connectivity.

```ts
import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  await db.execute(sql`select 1`);
  return NextResponse.json({ ok: true });
}
```

# UX rules

- Never expose `DATABASE_URL` or run raw DB access from client components.
- Use Server Components, Route Handlers, or Server Actions for database operations.
- Show clear empty states for lists loaded from the database.
- Show loading and error states for any mutation-driven UI.
- Validate and sanitize user input before inserts or updates.
- For destructive actions, require explicit confirmation in the UI.
- Prefer pagination or limits for large tables; do not render unbounded result sets.

# Avoid

- Do not import the DB client into client components.
- Do not ship Drizzle schema or migration logic as browser code.
- Do not use `db:push` as the only production migration strategy for a real app.
- Do not create a new `Pool` per request.
- Do not hardcode SSL settings that break local development.
- Do not put business logic directly inside presentation components; keep queries in server modules.
- Do not rely on library internals from `drizzle-orm/src/*` or `drizzle-kit/src/*`.

# Verification

1. Confirm `DATABASE_URL` is set.
2. Run migration generation:

```bash
npm run db:generate
```

3. Apply migrations:

```bash
npm run db:migrate
```

4. Start the app and hit the DB health endpoint:

```bash
curl http://localhost:3000/api/health/db
```

Expected response:

```json
{"ok":true}
```

5. Verify a real read works by rendering a page that selects from a table.
6. Verify a real write works through a Route Handler or Server Action.
7. In development, confirm hot reload does not create runaway connections.
