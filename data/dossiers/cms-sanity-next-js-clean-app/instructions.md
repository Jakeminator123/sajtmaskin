# When to use

Use this dossier when the site's pages, posts, marketing content, or reusable sections should be managed in **Sanity** and rendered in a **Next.js App Router** app.

This dossier is best for:
- blogs and editorial sites
- marketing/content sites with non-developer editors
- portfolio or case-study sites
- apps that need preview of unpublished content

It provides the integration-specific pieces for:
- Sanity environment/config wiring
- a reusable `next-sanity` client
- draft mode enable/disable routes for preview and Presentation Tool
- a safe pattern for querying published vs draft content

# How to integrate

## 1) Install the core packages

```bash
npm install next-sanity sanity
```

If you want Visual Editing / Presentation Tool support, also use the draft mode helpers provided by `next-sanity`.

## 2) Add environment variables

```env
NEXT_PUBLIC_SANITY_PROJECT_ID=your_project_id
NEXT_PUBLIC_SANITY_DATASET=production
NEXT_PUBLIC_SANITY_API_VERSION=2025-09-25
NEXT_PUBLIC_SANITY_STUDIO_URL=http://localhost:3333
SANITY_API_READ_TOKEN=your_sanity_read_token
```

Notes:
- `SANITY_API_READ_TOKEN` is required for draft/preview access and private datasets.
- `NEXT_PUBLIC_SANITY_STUDIO_URL` should match the Studio URL used by Presentation Tool.
- Keep `SANITY_API_READ_TOKEN` server-only.

## 3) Keep a small shared config module

```ts
// sanity/lib/api.ts
function assertValue<T>(v: T | undefined, errorMessage: string): T {
  if (v === undefined) throw new Error(errorMessage)
  return v
}

export const dataset = assertValue(
  process.env.NEXT_PUBLIC_SANITY_DATASET,
  'Missing environment variable: NEXT_PUBLIC_SANITY_DATASET',
)

export const projectId = assertValue(
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  'Missing environment variable: NEXT_PUBLIC_SANITY_PROJECT_ID',
)

export const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2025-09-25'
export const studioUrl =
  process.env.NEXT_PUBLIC_SANITY_STUDIO_URL || 'http://localhost:3333'
```

## 4) Create the Sanity client

```ts
// sanity/lib/client.ts
import {createClient} from 'next-sanity'
import {apiVersion, dataset, projectId, studioUrl} from '@/sanity/lib/api'
import {token} from '@/sanity/lib/token'

export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true,
  token,
  stega: {studioUrl},
})
```

And the token module:

```ts
// sanity/lib/token.ts
export const token = process.env.SANITY_API_READ_TOKEN
```

## 5) Add a shared fetch helper

Use a wrapper so pages can choose published or draft perspective consistently.

```ts
// sanity/lib/fetch.ts
import {client} from '@/sanity/lib/client'

type SanityFetchOptions = {
  query: string
  params?: Record<string, unknown>
  perspective?: 'published' | 'drafts'
  stega?: boolean
}

export async function sanityFetch<T>({
  query,
  params = {},
  perspective = 'published',
  stega = false,
}: SanityFetchOptions): Promise<T> {
  return client.fetch<T>(query, params, {
    perspective,
    stega,
    next: {tags: ['sanity']},
  })
}
```

## 6) Add draft mode routes

Enable route:

```ts
// app/api/draft-mode/enable/route.ts
import {defineEnableDraftMode} from 'next-sanity/draft-mode'
import {client} from '@/sanity/lib/client'
import {token} from '@/sanity/lib/token'

export const {GET} = defineEnableDraftMode({
  client: client.withConfig({token}),
})
```

Disable route:

```ts
// app/api/draft-mode/disable/route.ts
import {disableDraftMode} from 'next-sanity/draft-mode'

export const GET = disableDraftMode()
```

In Sanity Presentation Tool, configure the preview URL to use the enable route above.

## 7) Read published content by default, drafts in preview

In App Router pages/layouts, branch on `draftMode()`.

```ts
import {draftMode} from 'next/headers'
import {sanityFetch} from '@/sanity/lib/fetch'

const query = `*[_type == "post" && slug.current == $slug][0]{
  _id,
  title,
  slug,
  body
}`

export default async function PostPage({params}: {params: Promise<{slug: string}>}) {
  const {isEnabled} = await draftMode()
  const {slug} = await params

  const post = await sanityFetch<{
    _id: string
    title: string
    slug?: {current: string}
    body?: unknown
  }>({
    query,
    params: {slug},
    perspective: isEnabled ? 'drafts' : 'published',
    stega: isEnabled,
  })

  if (!post) return null

  return <article><h1>{post.title}</h1></article>
}
```

## 8) Revalidate after content changes

If your app uses tag-based caching, call `revalidateTag('sanity')` from a webhook route when Sanity content is published.

Example:

```ts
// app/api/revalidate/route.ts
import {revalidateTag} from 'next/cache'
import {NextResponse} from 'next/server'

export async function POST() {
  revalidateTag('sanity')
  return NextResponse.json({revalidated: true})
}
```

Use a secret-protected webhook in production.

# UX rules

- Render published content for normal visitors; only render draft content when Next.js draft mode is enabled.
- Never expose `SANITY_API_READ_TOKEN` to client components or browser bundles.
- If preview is enabled, clearly provide a way for editors to exit preview via `/api/draft-mode/disable`.
- Treat missing content gracefully: show empty states or 404s, not crashes from undefined fields.
- Keep CMS integration code separate from site-specific UI so the runtime can map Sanity content into any scaffold.

# Avoid

- Do not keep template demo content like `demo.ts`, branded headers, footers, or landing-page sections as part of the integration.
- Do not make the whole root layout depend on Sanity unless the site's global metadata/navigation truly comes from Sanity.
- Do not use the read token in client components.
- Do not hardcode Studio URLs or dataset/project IDs in source.
- Do not assume Visual Editing is always present; the core integration should still work for plain content fetching.

# Verification

1. Confirm env vars are set.
2. Start the Next.js app and fetch a simple Sanity document through `sanityFetch`.
3. Visit a page that queries Sanity and verify published content renders.
4. Open `/api/draft-mode/enable` through the configured Sanity Presentation Tool flow and verify draft mode turns on.
5. Confirm draft/unpublished edits appear only when draft mode is enabled.
6. Visit `/api/draft-mode/disable` and verify the app returns to published content.
7. If using webhooks, publish content in Sanity and confirm the site revalidates cached content.

Minimal success criteria:
- published content loads without the token in the browser
- preview mode can be entered and exited
- draft content is isolated to draft mode only
- no template/demo UI is required for the integration to function
