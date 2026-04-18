# When to use

Use this dossier when you need a **searchable inventory or catalog page** in Next.js App Router backed by **Postgres + Drizzle**, where filters and pagination live in the URL.

Typical fits:
- product/book/course/document catalogs
- internal admin inventory tools
- searchable resource directories
- dashboards with sharable filtered views

This dossier is about the **data/query architecture** and **URL state pattern**, not the original template’s demo layout.

# How to integrate

## 1. Add environment variables

Set a Postgres connection string:

```env
POSTGRES_URL=postgres://user:password@host:5432/dbname
```

This dossier assumes Drizzle uses `POSTGRES_URL`.

## 2. Keep Drizzle config at the repo root or adapt paths

The included config expects:
- schema: `./lib/db/schema.ts`
- migrations: `./lib/db/migrations`

If your project stores dossier files under a `components/` folder before merging, update paths when integrating into the app root.

Example Drizzle config:

```ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.POSTGRES_URL!,
  },
} satisfies Config;
```

## 3. Create the database client and schema

Use a server-only Drizzle client:

```ts
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

const databaseUrl = process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error('Missing POSTGRES_URL');

const sql = neon(databaseUrl);
export const db = drizzle(sql, { schema });
```

Define a table for your inventory items. Example:

```ts
import { integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const books = pgTable('books', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  author: varchar('author', { length: 255 }).notNull(),
  isbn: varchar('isbn', { length: 32 }),
  language: varchar('language', { length: 32 }),
  publishedYear: integer('published_year'),
  pageCount: integer('page_count'),
  averageRating: integer('average_rating'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

## 4. Use URL params as the source of truth for filters

The reusable pattern in this dossier is to parse URL params into a typed object:

```ts
export interface SearchParams {
  search?: string;
  yr?: string;
  rtg?: string;
  lng?: string;
  pgs?: string;
  page?: string;
  isbn?: string;
}
```

Parse from `searchParams` in an App Router page:

```ts
import { parseSearchParams } from '@/lib/url-state';
import { getBooks } from '@/lib/db/queries';

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseSearchParams(await searchParams);
  const result = await getBooks(params);

  return <div>{/* render result.rows */}</div>;
}
```

Stringify back to a query string when building links:

```ts
import { stringifySearchParams } from '@/lib/url-state';

const href = `/inventory?${stringifySearchParams({
  search: 'tolkien',
  lng: 'en',
  page: '2',
})}`;
```

## 5. Build server-side filtered queries with Drizzle

Map parsed URL params to SQL conditions in one place:

```ts
import { and, asc, count, eq, gte, ilike } from 'drizzle-orm';
import { db } from './index';
import { books } from './schema';

export async function getBooks(params: SearchParams) {
  const page = Math.max(1, Number(params.page ?? '1'));
  const pageSize = 20;
  const offset = (page - 1) * pageSize;

  const conditions = [
    params.search ? ilike(books.title, `%${params.search}%`) : undefined,
    params.lng ? eq(books.language, params.lng) : undefined,
    params.isbn ? eq(books.isbn, params.isbn) : undefined,
    params.yr ? eq(books.publishedYear, Number(params.yr)) : undefined,
    params.pgs ? gte(books.pageCount, Number(params.pgs)) : undefined,
    params.rtg ? gte(books.averageRating, Number(params.rtg)) : undefined,
  ].filter(Boolean);

  const whereClause = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(books)
    .where(whereClause)
    .orderBy(asc(books.title))
    .limit(pageSize)
    .offset(offset);

  const total = await db.select({ total: count() }).from(books).where(whereClause);

  return {
    rows,
    page,
    total: total[0]?.total ?? 0,
  };
}
```

Keep filtering logic centralized. Do not duplicate it across route handlers, server actions, and components.

## 6. Use backpressure for responsive search UX

`useBackpressure` is useful when an input updates URL state quickly in App Router. It helps avoid flickery results while typing.

Example client search form:

```tsx
'use client';

import { useSearchParams } from 'next/navigation';
import { useBackpressure } from '@/lib/use-backpressure';

export function InventorySearch() {
  const searchParams = useSearchParams();
  const { triggerUpdate, formRef } = useBackpressure(300);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        const params = new URLSearchParams(searchParams.toString());
        const value = String(formData.get('search') || '');

        if (value) params.set('search', value);
        else params.delete('search');

        params.delete('page');

        await triggerUpdate(`?${params.toString()}`);
      }}
    >
      <input
        name="search"
        defaultValue={searchParams.get('search') ?? ''}
        onChange={(e) => {
          e.currentTarget.form?.requestSubmit();
        }}
      />
    </form>
  );
}
```

Use this pattern for text search or sliders that can emit frequent updates.

## 7. Reset pagination when filters change

Whenever search or filter criteria change, remove `page` from the URL before navigation.

```ts
params.delete('page');
```

Otherwise users can land on empty later pages after narrowing filters.

# UX rules

- Keep filters **URL-addressable** so filtered views are shareable and survive refresh.
- Run filtering and pagination on the **server**, not client-only state, for correctness and scalability.
- Debounce or backpressure fast-changing inputs like text search.
- Show a loading state during route transitions.
- Preserve existing filters when changing just one control.
- Reset page number when any non-page filter changes.
- Prefer explicit filter names in the URL over opaque encoded blobs.
- Keep query param names stable once shipped.

# Avoid

- Do not keep the template’s `app/layout.tsx`; it depends on demo-specific components like `Filter`, `Search`, and `WelcomeToast`.
- Do not make the UI depend on book-specific wording unless the actual product is a book catalog.
- Do not parse numbers unsafely; validate/coerce query params before using them in filters.
- Do not split filter semantics across multiple helpers with different param names.
- Do not run Drizzle/neon code in client components.
- Do not use this dossier as a full CRUD admin system; it is primarily a searchable listing/query pattern.

# Verification

## Basic checks

1. `POSTGRES_URL` is set.
2. Drizzle schema path in `drizzle.config.ts` matches the integrated project structure.
3. Migrations generate successfully.
4. The inventory page loads without query params.
5. Search/filter changes update the URL.
6. Refreshing the page preserves the filtered state.
7. Pagination works and resets to page 1 when filters change.

## Commands

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
pnpm build
```

## Manual test cases

- Open `/inventory` and confirm results render.
- Search for a term and verify the URL gets `?search=...`.
- Apply a language filter and verify both filters coexist in the URL.
- Navigate to page 2, then change search text; verify `page` is removed.
- Type quickly in the search box; verify the UI remains responsive and results do not flicker excessively.
- Reload the page with active query params; verify the same filtered result set returns.
