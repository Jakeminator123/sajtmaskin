# When to use

Use this dossier when the app needs a managed Postgres database and you want a simple server-side integration that works well with Next.js on Vercel.

This dossier is appropriate for:
- dashboards and app-shell products that store relational data
- ecommerce apps with products, orders, and customers
- SaaS apps that need SQL queries, joins, and migrations
- any Next.js app that should read/write Postgres from server routes or server components

Do **not** use this dossier for client-side direct database access, browser-side secrets, or the MCP/OAuth flows from the source template.

# How to integrate

## 1) Install the Neon serverless driver

```bash
npm install @neondatabase/serverless
```

## 2) Add environment variables

Set `DATABASE_URL` to your Neon connection string.

```env
DATABASE_URL=postgres://USER:PASSWORD@HOST/DB?sslmode=require
```

Use the pooled/serverless connection string from Neon unless you have a reason to use a different one.

## 3) Create a shared server-only database module

```ts
// lib/db.ts
import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

export const sql = neon(databaseUrl);
```

Use this only from:
- Route Handlers
- Server Actions
- Server Components
- backend utilities

Do not import it into client components.

## 4) Query Neon from a route handler

```ts
// app/api/users/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET() {
  const users = await sql`
    select id, email, name
    from users
    order by created_at desc
    limit 50
  `;

  return NextResponse.json({ users });
}
```

## 5) Insert/update data with parameterized SQL

```ts
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(request: NextRequest) {
  const { email, name } = await request.json();

  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const rows = await sql`
    insert into users (email, name)
    values (${email}, ${name ?? null})
    returning id, email, name, created_at
  `;

  return NextResponse.json({ user: rows[0] }, { status: 201 });
}
```

The tagged-template form is important because it parameterizes values safely.

## 6) Add a DB connectivity check

```ts
// app/api/health/db/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET() {
  try {
    const result = await sql`select 1 as ok`;

    return NextResponse.json({
      status: 'ok',
      database: 'reachable',
      result: result[0] ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        database: 'unreachable',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
```

## 7) Use migrations/schema tooling separately

This dossier covers runtime DB access, not schema management. In a production app, pair Neon with one of:
- Drizzle ORM + drizzle-kit
- Prisma
- node-postgres migration tooling
- SQL migration files executed in CI/CD

If the app needs a full typed ORM workflow, prefer a separate ORM dossier on top of Neon rather than embedding ORM-specific assumptions here.

# UX rules

- Keep all database reads/writes on the server.
- Show user-friendly errors in UI; do not expose raw SQL errors to end users.
- For dashboards and CRUD apps, return structured JSON from route handlers and let UI components render loading/error/empty states.
- Add a simple operational health endpoint for deploy verification.
- Validate request input before executing queries.
- Use pagination/limits for list endpoints; never fetch unbounded rows for admin tables.

# Avoid

- Do not put `DATABASE_URL` in `NEXT_PUBLIC_*` env vars.
- Do not import `lib/db.ts` into a `use client` component.
- Do not build SQL strings via concatenation.

Bad:

```ts
const query = `select * from users where email = '${email}'`;
```

Good:

```ts
const rows = await sql`select * from users where email = ${email}`;
```

- Do not keep the MCP-specific `/api/authorize`, `/api/register`, or `/api/list-tools` routes from the source template unless you are explicitly building an MCP server.
- Do not rely on a generic app health check alone when validating DB connectivity; add a DB query health check.

# Verification

## Local checks

1. Confirm env is set:

```bash
echo $DATABASE_URL
```

2. Start the app:

```bash
npm run dev
```

3. Verify basic app health:

```bash
curl http://localhost:3000/api/health
```

4. Verify database connectivity:

```bash
curl http://localhost:3000/api/health/db
```

Expected success shape:

```json
{
  "status": "ok",
  "database": "reachable"
}
```

## Query verification

Create a temporary route or server action that runs:

```ts
const result = await sql`select now() as now`;
console.log(result[0]);
```

If this succeeds in local and production, the Neon integration is correctly wired.

## Deployment verification on Vercel

- Add `DATABASE_URL` in the Vercel project settings.
- Redeploy.
- Hit `/api/health/db` on the deployed domain.
- Confirm logs show no connection-string or TLS errors.
