# When to use

Use this dossier when the app needs fast, typo-tolerant search over structured content stored in Xata.

Typical fits:
- product or catalog search
- docs or knowledge-base search
- blog/content search
- media libraries
- admin dashboards with search across records

Prefer this over a purely client-side filter when:
- the dataset is too large to ship to the browser
- search should tolerate misspellings
- ranking should come from the database
- content changes frequently

# How to integrate

## 1) Install and configure Xata

Required environment variables:

```bash
XATA_API_KEY=...
XATA_DATABASE_URL=https://<workspace>-<region>.xata.sh/db/<database>:<branch>
```

Create a server-only client:

```ts
// lib/xata.ts
import 'server-only'
import { XataClient } from '@xata.io/client'

export const xata = new XataClient({
  apiKey: process.env.XATA_API_KEY!,
  databaseURL: process.env.XATA_DATABASE_URL!,
})
```

Do not import the Xata client into browser components.

## 2) Define a result schema for the records you return

Validate the shape you expose to the app instead of passing raw records everywhere.

```ts
// lib/schemas.ts
import { z } from 'zod'

export const searchRecord = z.object({
  id: z.string(),
  title: z.string().nullish(),
  description: z.string().nullish(),
  slug: z.string().nullish(),
})

export const searchRecordList = z.array(searchRecord)
```

Adjust fields to match the Xata table.

## 3) Add a reusable search helper

Use Xata search on the server with explicit target columns and bounded result size.

```ts
// lib/search.ts
import 'server-only'
import { xata } from './xata'

export async function searchContent(query: string) {
  const term = query.trim()
  if (!term) return []

  const response = await xata.db.content.search(term, {
    fuzziness: 1,
    prefix: 'phrase',
    target: ['title', 'description'],
    page: { size: 20 },
  })

  return response.records
}
```

Notes:
- `fuzziness: 1` gives typo tolerance without being too loose for most apps.
- `target` should only include meaningful searchable text fields.
- Keep `page.size` small for responsive UI.

## 4) Expose search through a route handler or server action

Route handler example:

```ts
// app/api/search/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { searchContent } from '@/lib/search'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''

  if (!q) {
    return NextResponse.json({ records: [], totalCount: 0 })
  }

  const records = await searchContent(q)
  return NextResponse.json({ records, totalCount: records.length })
}
```

Use a server action instead when the search UI is form-based and does not need a public API.

## 5) Connect the UI

Minimal client component pattern:

```tsx
'use client'

import { useEffect, useState } from 'react'

type Record = {
  id: string
  title?: string | null
  description?: string | null
}

export function SearchBox() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Record[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const term = q.trim()
    if (!term) {
      setResults([])
      return
    }

    const timer = setTimeout(async () => {
      setLoading(true)
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`)
      const data = await res.json()
      setResults(data.records ?? [])
      setLoading(false)
    }, 250)

    return () => clearTimeout(timer)
  }, [q])

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search..."
        aria-label="Search"
      />

      {loading && <p>Searching…</p>}

      <ul>
        {results.map((item) => (
          <li key={item.id}>
            <strong>{item.title}</strong>
            {item.description ? <p>{item.description}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

## 6) Adapt table names and fields

The generated helper uses a generic table name like `content`. Replace it with the real Xata table and fields, for example:

```ts
await xata.db.articles.search(term, {
  target: ['title', 'excerpt', 'body'],
  fuzziness: 1,
  page: { size: 10 },
})
```

or

```ts
await xata.db.products.search(term, {
  target: ['name', 'description', 'brand'],
  fuzziness: 1,
  page: { size: 24 },
})
```

# UX rules

- Debounce input before querying; 200–300ms is a good default.
- Never query on every keystroke without debounce.
- Show empty state only after the user has entered a non-empty query.
- Keep result lists short; offer a “view all results” page if needed.
- Highlight the matched title or key field when possible.
- Preserve keyboard accessibility for input and result navigation.
- Return consistent shapes for empty, loading, success, and error states.
- For large catalogs, prefer server-rendered initial results for query pages like `/search?q=...`.

# Avoid

- Do not expose `XATA_API_KEY` in client-side code.
- Do not import `@xata.io/client` directly into client components.
- Do not search every text field blindly; choose specific columns with `target`.
- Do not return full record payloads if the UI only needs title, slug, and summary.
- Do not use unbounded page sizes.
- Do not rely on template-specific movie schemas or branding; rename schemas and fields to match the app domain.
- Do not treat demo-specific actions like ratings, OG images, or hero sections as part of the integration.

# Verification

Check all of the following:

1. Environment variables are set:

```bash
echo $XATA_API_KEY
echo $XATA_DATABASE_URL
```

2. The server can instantiate the client without throwing.
3. A request like `/api/search?q=test` returns JSON with `records`.
4. Empty queries return an empty result set rather than an error.
5. Misspelled queries still return relevant results when expected.
6. Search only hits the intended columns.
7. Network responses stay small and fast under realistic query volume.
8. No client bundle contains the Xata API key.

Useful manual test cases:

```txt
Exact title
Partial phrase
One-character typo
No-match query
Very common query
Empty query
```

If relevance is poor, tune in this order:
- target columns
- page size
- fuzziness
- UI ranking/presentation after retrieval
