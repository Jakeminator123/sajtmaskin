# When to use

Use this dossier when the site's blog or article content is authored in Notion and rendered in Next.js.

Best fit:
- content sites with an editorial workflow in Notion
- company blogs where non-developers publish posts
- portfolios or marketing sites that need a lightweight CMS without adding a separate admin app

This dossier is not a full Notion renderer by itself. It provides the integration patterns around:
- blog slugs
- published/draft filtering
- preview mode
- Notion asset proxying
- shared helpers for URLs and dates

# How to integrate

## 1. Add required environment variables

At minimum, configure:

```env
NOTION_TOKEN=your-preview-or-integration-secret
NOTION_ROOT_PAGE_ID=your_notion_root_page_id
```

Use `NOTION_TOKEN` as the secret for preview routes. Do not expose it to the client.

## 2. Keep blog helpers as the canonical slug/date utilities

Use the shared helpers to generate blog links and normalize slugs consistently:

```ts
export const getBlogLink = (slug: string) => `/blog/${slug}`

export const normalizeSlug = (slug: string) => {
  if (typeof slug !== 'string') return slug
  let startingSlash = slug.startsWith('/')
  let endingSlash = slug.endsWith('/')

  if (startingSlash) slug = slug.substr(1)
  if (endingSlash) slug = slug.substr(0, slug.length - 1)

  return startingSlash || endingSlash ? normalizeSlug(slug) : slug
}
```

Use normalized slugs when:
- indexing Notion pages by slug
- generating static paths
- matching preview URLs

## 3. Filter posts by publish state

The current integration assumes a Notion property like `Published` with value `Yes`:

```ts
export const postIsPublished = (post: any) => {
  return post.Published === 'Yes'
}
```

When building the blog index, only expose published posts unless preview mode is enabled.

Typical pattern:

```ts
const visiblePosts = isPreview
  ? allPosts
  : allPosts.filter((post) => postIsPublished(post))
```

## 4. Add preview mode routes

For Pages Router, keep these routes:
- `/api/preview`
- `/api/preview-post`
- `/api/clear-preview`

Important behavior:
- require a secret token
- resolve the slug against your Notion index
- call `res.setPreviewData({})`
- redirect to `/blog` or `/blog/[slug]`

Core pattern:

```ts
if (typeof req.query.token !== 'string') {
  return res.status(401).json({ message: 'invalid token' })
}
if (req.query.token !== process.env.NOTION_TOKEN) {
  return res.status(404).json({ message: 'not authorized' })
}

res.setPreviewData({})
res.writeHead(307, { Location: `/blog` })
res.end()
```

For App Router, use route handlers instead:

```ts
import { draftMode } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  const slug = searchParams.get('slug') || '/blog'

  if (!token || token !== process.env.NOTION_TOKEN) {
    return NextResponse.json({ message: 'not authorized' }, { status: 401 })
  }

  const draft = await draftMode()
  draft.enable()

  return NextResponse.redirect(new URL(slug, req.url), 307)
}
```

## 5. Proxy Notion-hosted assets through a server route

Notion file URLs are often signed and time-limited. Do not hardcode them into static HTML and expect them to stay valid.

Keep a server route that:
- accepts the original asset URL and block ID
- fetches fresh signed URLs from Notion
- redirects the browser to the latest signed URL

Pattern:

```ts
const { assetUrl, blockId } = req.query as { [k: string]: string }

if (!assetUrl || !blockId) {
  return handleData(res, {
    status: 'error',
    message: 'asset url or blockId missing',
  })
}

const { signedUrls = [] } = await getNotionAssetUrls(res, assetUrl, blockId)

if (signedUrls.length === 0) {
  return handleData(res, {
    status: 'error',
    message: 'Failed to get asset URL',
  })
}

res.status(307)
res.setHeader('Location', signedUrls.pop())
res.end()
```

When rendering Notion images/files, rewrite them to this proxy route instead of linking directly to stale signed URLs.

## 6. Integrate with your blog pages

Typical integration points:
- `/blog` page: fetch and list visible posts
- `/blog/[slug]` page: fetch one post by normalized slug
- static generation: build paths from the published Notion index
- preview mode: include drafts or unpublished content when enabled

Typical fetch flow:

```ts
const postsTable = await getBlogIndex()
const post = postsTable[normalizeSlug(slug)]
```

## 7. Prefer server-only Notion access

All Notion API/index fetching should stay on the server:
- route handlers
- `getStaticProps` / `getServerSideProps` in Pages Router
- server components or server utilities in App Router

Do not expose raw Notion credentials in client bundles.

# UX rules

- Blog URLs should be stable and human-readable: `/blog/my-post-slug`.
- Draft content must never appear in normal production browsing unless preview mode is enabled.
- Preview links should redirect editors straight to the relevant page when possible.
- Published dates should be formatted consistently across blog index and post pages.
- Missing or invalid preview tokens should fail quietly with a generic unauthorized response; do not leak internal details.
- Notion-hosted images/files should load through the asset proxy if the renderer depends on signed URLs.

# Avoid

- Do not expose `NOTION_TOKEN` in public env vars or client-side code.
- Do not assume raw Notion asset URLs are permanent.
- Do not trust unnormalized slugs; normalize before lookups and route generation.
- Do not show unpublished posts in sitemap, feeds, or blog listings outside preview mode.
- Do not make preview mode dependent on client-only state; enable it server-side.
- Do not keep template-specific branded blog UI from the original example unless the user explicitly asks for it.

# Verification

Check these before shipping:

1. **Published filtering works**
   - A post marked unpublished in Notion does not appear on `/blog` publicly.

2. **Preview mode works**
   - Visiting `/api/preview?token=YOUR_TOKEN` redirects to `/blog` and shows draft content.
   - Visiting `/api/preview-post?token=YOUR_TOKEN&slug=my-post` redirects to `/blog/my-post`.
   - Visiting `/api/clear-preview?slug=my-post` exits preview mode and redirects back.

3. **Slug handling is stable**
   - `my-post`, `/my-post`, and `/my-post/` resolve to the same normalized slug in server logic.

4. **Asset proxy works**
   - A Notion-hosted image/file request to the asset route returns a 307 redirect to a valid signed URL.

5. **No secret leakage**
   - `NOTION_TOKEN` is only used server-side.

6. **Static pages build correctly**
   - The blog index and each published post can be generated without requiring client-side Notion credentials.
