# When to use

Use this dossier when your app runs on **Next.js + Vercel** and needs to query an **Amazon Aurora PostgreSQL** database from server code.

This pattern is especially useful when:
- you want **server-only database access** via Route Handlers or Server Actions
- you want to use **IAM database authentication** instead of storing a long-lived DB password
- your app needs a standard PostgreSQL interface using the `pg` driver
- you need straightforward read/write APIs backed by Aurora

Do **not** use this dossier for browser-direct database access. Aurora credentials and signed auth tokens must stay on the server.

# How to integrate

## 1) Install dependencies

```bash
npm install pg @aws-sdk/rds-signer @aws-sdk/client-sts
```

`@aws-sdk/client-sts` may be needed by your AWS credential chain depending on how Vercel/AWS auth is configured.

## 2) Configure environment variables

Set these server-side environment variables in Vercel:

```env
AURORA_DB_HOST=your-cluster.cluster-xxxx.us-east-1.rds.amazonaws.com
AURORA_DB_PORT=5432
AURORA_DB_NAME=app
AURORA_DB_USER=db_iam_user
AWS_REGION=us-east-1
```

The database user must be configured for **IAM authentication** in Aurora/RDS.

## 3) Add a server-only database module

Create `lib/db.ts` with IAM token signing and pooled PostgreSQL access:

```ts
import { Signer } from '@aws-sdk/rds-signer';
import { Pool } from 'pg';

let pool: Pool | undefined;
let tokenExpiresAt = 0;

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

async function createPool() {
  const signer = new Signer({
    hostname: env('AURORA_DB_HOST'),
    port: Number(env('AURORA_DB_PORT')),
    username: env('AURORA_DB_USER'),
    region: env('AWS_REGION'),
  });

  const password = await signer.getAuthToken();
  tokenExpiresAt = Date.now() + 14 * 60 * 1000;

  return new Pool({
    host: env('AURORA_DB_HOST'),
    port: Number(env('AURORA_DB_PORT')),
    database: env('AURORA_DB_NAME'),
    user: env('AURORA_DB_USER'),
    password,
    ssl: { rejectUnauthorized: false },
  });
}

export async function query(text: string, params: unknown[] = []) {
  if (!pool || Date.now() >= tokenExpiresAt) {
    await pool?.end().catch(() => undefined);
    pool = await createPool();
  }

  return pool.query(text, params);
}
```

## 4) Use Route Handlers or Server Actions for DB access

Example Route Handler:

```ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  const result = await query(
    'select id, title, released_year from movies order by id desc limit 20'
  );

  return NextResponse.json({ movies: result.rows });
}
```

Example write endpoint:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(request: NextRequest) {
  const { title, releasedYear } = await request.json();

  const result = await query(
    `insert into movies (title, released_year)
     values ($1, $2)
     returning id, title, released_year`,
    [title, releasedYear]
  );

  return NextResponse.json({ movie: result.rows[0] }, { status: 201 });
}
```

## 5) Keep all DB imports server-only

Allowed places:
- `app/api/**/route.ts`
- Server Actions
- server components that do not leak secrets to the client
- background jobs / cron handlers

Do not import `lib/db.ts` into client components.

## 6) Aurora schema example

Use ordinary PostgreSQL DDL. Example:

```sql
create table if not exists movies (
  id bigserial primary key,
  title text not null,
  released_year integer,
  score integer default 0,
  created_at timestamptz not null default now()
);
```

# UX rules

- Reads should show clear loading/empty/error states; Aurora latency may vary by region.
- Mutations should return updated rows so the UI can reconcile optimistic updates safely.
- Prefer small, task-specific endpoints over exposing a generic SQL executor.
- If a user action updates counters or votes, use optimistic UI only when the server response can correct drift.
- Surface retry affordances for transient network or credential errors.

# Avoid

- Do not connect to Aurora directly from the browser.
- Do not hardcode a static DB password if your deployment is intended to use IAM auth.
- Do not create a new `pg` client on every request without pooling.
- Do not cache IAM auth tokens longer than their valid lifetime.
- Do not put database queries in Edge runtime handlers; use the Node.js runtime.
- Do not keep template-specific demo routes like `/api/k6/*` unless you are intentionally load testing.

# Verification

## Basic connectivity

Create a temporary health endpoint:

```ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  const result = await query('select now() as now');
  return NextResponse.json(result.rows[0]);
}
```

Expected result: JSON containing a timestamp from Aurora.

## Read test

```bash
curl http://localhost:3000/api/movies
```

Expected result: `200` with a `movies` array.

## Write test

```bash
curl -X POST http://localhost:3000/api/movies/vote \
  -H 'Content-Type: application/json' \
  -d '{"movieId":1,"increment":1}'
```

Expected result: `200` with the updated movie row.

## Failure-mode checks

- Remove `AURORA_DB_HOST` locally and confirm startup/request failure is explicit.
- Confirm no database code is imported by any `use client` component.
- Verify your Aurora user can authenticate via IAM and has the expected table permissions.
- Deploy to Vercel and confirm queries still work with production env vars and AWS credentials.
