# When to use

Use this dossier when a Next.js site needs Sanity as its CMS for pages, posts, projects, or other editorial content, especially when editors need draft previews, embedded Studio access, and on-demand revalidation.

Best fit:
- personal websites and portfolios
- blogs and content sites
- marketing sites with an editorial backend

Less ideal if:
- all content is static and rarely changes
- the project does not need an editor-facing CMS
- the app needs heavy relational commerce workflows better served by a commerce backend

# How to integrate

## 1) Install core packages

```bash
npm install next-sanity sanity @sanity/preview-url-secret groq
```

If hosting Studio inside the app, keep `sanity` and `next-sanity` together at compatible versions.

## 2) Add environment variables

```env
NEXT_PUBLIC_SANITY_PROJECT_ID=your_project_id
NEXT_PUBLIC_SANITY_DATASET=production
NEXT_PUBLIC_SANITY_API_VERSION=2024-01-01
SANITY_API_READ_TOKEN=your_read_token_for_preview
SANITY_REVALIDATE_SECRET=your_webhook_secret
```

Rules:
- `NEXT_PUBLIC_*` values are safe for browser-exposed project config.
- `SANITY_API_READ_TOKEN` must stay server-only.
- Use a dedicated webhook secret for revalidation.

## 3) Create Sanity clients and a fetch helper

Use a published client by default and a draft client when Next.js draft mode is enabled.

```ts
import {createClient} from 'next-sanity'

export const sanityClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
  apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2024-01-01',
  useCdn: true,
  perspective: 'published',
})
```

```ts
import {draftMode} from 'next/headers'

export async function sanityFetch<T>({query, params = {}, tags = []}: {
  query: string
  params?: Record<string, unknown>
  tags?: string[]
}): Promise<T> {
  const {isEnabled} = await draftMode()
  const client = isEnabled ? previewClient : sanityClient

  return client.fetch<T>(query, params, {
    next: {tags: ['sanity', ...tags]},
  })
}
```

Important pattern:
- Always tag fetches with `sanity` plus content-specific tags like `page`, `project`, or a slug.
- Use `useCdn: false` for preview/draft fetching.

## 4) Centralize GROQ queries

```ts
export const pageBySlugQuery = `*[_type == "page" && slug.current == $slug][0]`
export const allProjectsQuery = `*[_type == "project"] | order(publishedAt desc)`
```

Keep GROQ out of UI components when possible.

## 5) Fetch content in App Router pages

```tsx
import {sanityFetch} from '@/lib/sanity/fetch'
import {pageBySlugQuery} from '@/lib/sanity/queries'
import {notFound} from 'next/navigation'

export default async function Page({params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params
  const page = await sanityFetch<{title: string; body?: unknown}>({
    query: pageBySlugQuery,
    params: {slug},
    tags: ['sanity', 'page', slug],
  })

  if (!page) notFound()

  return <main><h1>{page.title}</h1></main>
}
```

## 6) Add preview entry and exit routes

Enable draft mode from Studio preview links:

```ts
import {draftMode} from 'next/headers'
import {redirect} from 'next/navigation'
import {validatePreviewUrl} from '@sanity/preview-url-secret'

export async function GET(request: Request) {
  const {isValid, redirectTo = '/'} = await validatePreviewUrl(
    sanityClient.withConfig({useCdn: false}),
    request.url,
  )

  if (!isValid) {
    return new Response('Invalid preview URL', {status: 401})
  }

  const draft = await draftMode()
  draft.enable()
  redirect(redirectTo)
}
```

Disable it with a simple route:

```ts
import {draftMode} from 'next/headers'
import {redirect} from 'next/navigation'

export async function GET() {
  const draft = await draftMode()
  draft.disable()
  redirect('/')
}
```

## 7) Add webhook revalidation

Create a route that validates the Sanity webhook signature and revalidates tagged content.

```ts
import {parseBody} from 'next-sanity/webhook'
import {revalidateTag} from 'next/cache'

export async function POST(req: Request) {
  const {isValidSignature, body} = await parseBody<{_type?: string; slug?: string}>(
    req,
    process.env.SANITY_REVALIDATE_SECRET!,
  )

  if (!isValidSignature) {
    return new Response('Invalid signature', {status: 401})
  }

  revalidateTag('sanity')
  if (body?._type) revalidateTag(body._type)
  if (body?.slug) revalidateTag(body.slug)

  return Response.json({ok: true})
}
```

In Sanity, configure a webhook pointing to `/api/revalidate` and include fields such as `_type` and `slug` in the payload or projection.

## 8) Embed Sanity Studio if the app should manage content internally

```tsx
import {NextStudio} from 'next-sanity/studio'
import config from '../../../sanity.config'

export default function StudioPage() {
  return <NextStudio config={config} />
}
```

Basic config:

```ts
import {defineConfig} from 'sanity'
import {deskTool} from 'sanity/desk'

export default defineConfig({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || '',
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
  title: 'Sanity Studio',
  basePath: '/studio',
  plugins: [deskTool()],
  schema: {types: []},
})
```

Then add schema types appropriate for the site: `settings`, `page`, `post`, `project`, `author`, etc.

## 9) Rendering content

Use Sanity data as the source of truth for:
- homepage sections
- about page content
- project/case study entries
- blog posts
- SEO fields
- navigation/footer settings

For rich text, use Portable Text rendering rather than assuming HTML strings.

# UX rules

- Preview and published states must be visually distinct for editors; expose an obvious “Exit preview” action when draft mode is on.
- Never block the public site on Studio access. Studio should live under `/studio` and not interfere with normal routes.
- Handle missing slugs and unpublished content gracefully with `notFound()` or equivalent empty states.
- Use stable content models: global settings, singleton pages, and repeatable documents like posts/projects.
- Keep editor workflows simple: titles, slugs, publish dates, cover images, and portable rich text should be first-class fields.
- Revalidation should be fast and targeted; avoid full-site rebuild assumptions.

# Avoid

- Do not expose `SANITY_API_READ_TOKEN` to the client.
- Do not use the preview client for all requests; use the published CDN-backed client by default.
- Do not hardcode schema assumptions from a template unless the user asked for that exact model.
- Do not mix unrelated middleware or auth systems into this dossier.
- Do not fetch Sanity data in many disconnected helpers without shared tagging and cache strategy.
- Do not rely on deprecated preview APIs when App Router draft mode is available.

# Verification

Check these before considering the integration complete:

1. Public content loads from Sanity with no token required for published pages.
2. Draft mode route enables previews only for valid preview URLs.
3. Draft mode shows unpublished edits when enabled.
4. `/api/draft-mode/disable` returns the site to published content.
5. Sanity webhook requests with a valid secret trigger `revalidateTag` successfully.
6. Updating a document in Sanity causes the relevant page to refresh after webhook delivery.
7. `/studio` loads correctly and uses the expected project ID and dataset.
8. Missing env vars fail loudly during setup rather than causing silent empty content.
9. Rich text fields are rendered with a Portable Text renderer if used.
10. Slug-based routes return `404` for missing documents.
