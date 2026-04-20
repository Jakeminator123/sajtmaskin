# When to use

Use this dossier when the app needs a MySQL-compatible relational database on **TiDB Cloud** with **Prisma** in a Next.js project.

Use it for:
- dashboards and app shells that need relational data
- ecommerce or content apps that need SQL queries and transactions
- server-rendered routes, API routes, and server actions that should read/write through Prisma

Do not use this dossier for purely static sites or for client-only browser storage.

# How to integrate

## 1) Add environment variables

Prefer a single `DATABASE_URL`. If you do not have one, the included Prisma client can build it from TiDB parts.

```env
DATABASE_URL="mysql://USER:PASSWORD@HOST:4000/DB_NAME"
TIDB_USER="USER"
TIDB_PASSWORD="PASSWORD"
TIDB_HOST="HOST"
TIDB_PORT="4000"
TIDB_DB_NAME="app"
```

TiDB Cloud serverless commonly requires TLS flags. The included client appends:

```ts
const SSL_FLAGS = 'pool_timeout=60&sslaccept=accept_invalid_certs';
```

If the app already has a working TiDB connection string with SSL parameters, prefer using `DATABASE_URL` directly and avoid rebuilding it in multiple places.

## 2) Keep a singleton Prisma client

Use a shared Prisma client so hot reload in development does not exhaust DB connections.

```ts
import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

const prisma =
  global.prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;
```

If using the included `components/lib/prisma.ts`, keep all server-side DB access importing from that single module.

## 3) Add a Prisma schema

Minimum example:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model ExampleItem {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Then run:

```bash
npx prisma generate
npx prisma db push
```

Use migrations if the project requires audited schema history:

```bash
npx prisma migrate dev --name init
```

## 4) Query TiDB only from the server

Example API route:

```ts
import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const items = await prisma.exampleItem.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  res.status(200).json(items);
}
```

Example server action / server component pattern:

```ts
import prisma from '@/lib/prisma';

export async function getExampleItems() {
  return prisma.exampleItem.findMany({
    orderBy: { createdAt: 'desc' },
  });
}
```

## 5) Add a DB health check

The included root health route only checks that the app is running. Add a DB-specific route too:

```ts
import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ up: true, database: true });
  } catch {
    res.status(500).json({ up: false, database: false });
  }
}
```

# UX rules

- Never expose TiDB credentials to the client.
- Keep Prisma usage in API routes, server actions, route handlers, or server components only.
- Show friendly empty states and loading states for DB-backed UI.
- On failed writes, surface actionable error messages and log the raw error on the server.
- For dashboards and ecommerce flows, paginate large queries instead of loading everything at once.

# Avoid

- Do not keep demo-specific bookstore HTTP wrappers or ecommerce helpers from the source template.
- Do not instantiate `new PrismaClient()` in many files.
- Do not call Prisma directly from client components.
- Do not assume TiDB works without TLS-related parameters on serverless tiers.
- Do not use the generic `/api` health route as proof that the database is reachable; use a DB query health route.

# Verification

1. Confirm environment variables are present.
2. Generate the Prisma client:

```bash
npx prisma generate
```

3. Push or migrate schema:

```bash
npx prisma db push
```

4. Start the app and verify the app health route:

```bash
curl http://localhost:3000/api
```

Expected:

```json
{"up":true}
```

5. Verify DB connectivity:

```bash
curl http://localhost:3000/api/health/db
```

Expected:

```json
{"up":true,"database":true}
```

6. Exercise one real Prisma read/write path in the app before considering the integration complete.
