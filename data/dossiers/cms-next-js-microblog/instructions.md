# When to use

Use this dossier when the site needs CMS-managed blog or microblog content stored in Hygraph and rendered in a Next.js App Router app. It is a good fit for blogs, changelogs, editorial sections, founder notes, and portfolio journals where editors should publish content without code changes.

# How to integrate

## 1. Add environment variables

Create these server-side environment variables:

```bash
HYGRAPH_ENDPOINT="https://<region>.hygraph.com/v2/<project-id>/master"
HYGRAPH_TOKEN="<optional-permanent-auth-token>"
```

Notes:
- `HYGRAPH_ENDPOINT` is required.
- `HYGRAPH_TOKEN` is optional only if the content API is publicly readable.
- Keep the token server-only. Do not expose it with `NEXT_PUBLIC_`.

## 2. Create a reusable Hygraph client

```ts
// components/lib/hygraph.ts
import { GraphQLClient } from 'graphql-request'

const endpoint = process.env.HYGRAPH_ENDPOINT

if (!endpoint) {
  throw new Error('Missing HYGRAPH_ENDPOINT environment variable')
}

export const hygraph = new GraphQLClient(endpoint, {
  headers: process.env.HYGRAPH_TOKEN
    ? { Authorization: `Bearer ${process.env.HYGRAPH_TOKEN}` }
    : {},
})
```

Use this only in server code.

## 3. Query content from Hygraph

Define the minimum queries for listing posts and fetching by slug:

```ts
// components/lib/queries.ts
import { gql } from 'graphql-request'
import { hygraph } from './hygraph'

const POSTS_QUERY = gql`
  query Posts {
    posts(orderBy: publishedAt_DESC) {
      slug
      title
      excerpt
      publishedAt
    }
  }
`

const POST_QUERY = gql`
  query PostBySlug($slug: String!) {
    post(where: { slug: $slug }) {
      slug
      title
      excerpt
      publishedAt
      content {
        html
      }
    }
  }
`

export async function getPosts() {
  const data = await hygraph.request(POSTS_QUERY)
  return data.posts
}

export async function getPost(slug: string) {
  const data = await hygraph.request(POST_QUERY, { slug })
  return data.post
}
```

Adjust field names if your Hygraph schema differs. Common variations are `body`, `richText`, `coverImage`, `author`, and `date`.

## 4. Render posts in App Router server components

Example blog index page:

```tsx
// app/blog/page.tsx
import Link from 'next/link'
import { getPosts } from '@/components/lib/queries'

export const revalidate = 60

export default async function BlogPage() {
  const posts = await getPosts()

  return (
    <main>
      <h1>Blog</h1>
      <ul>
        {posts.map((post) => (
          <li key={post.slug}>
            <Link href={`/blog/${post.slug}`}>{post.title}</Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

Example dynamic post route:

```tsx
// app/blog/[slug]/page.tsx
import { notFound } from 'next/navigation'
import { getPost, getPostSlugs } from '@/components/lib/queries'

export async function generateStaticParams() {
  const slugs = await getPostSlugs()
  return slugs.map((slug) => ({ slug }))
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPost(slug)

  if (!post) notFound()

  return (
    <article>
      <h1>{post.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: post.content.html }} />
    </article>
  )
}
```

## 5. Model the Hygraph schema intentionally

At minimum, create a `Post` model with:
- `slug` (unique)
- `title`
- `excerpt`
- `publishedAt`
- `content` (Rich Text)

Optional but common:
- cover image
- author
- tags or categories
- SEO title / description
- draft/published workflow fields

## 6. Prefer server fetching over client fetching

For public content pages, fetch directly in server components or route handlers. This keeps tokens private and improves SEO.

# UX rules

- Show a clear empty state if no posts exist yet.
- Sort posts by publish date descending unless the product explicitly needs another order.
- Use stable slugs for URLs; titles can change without breaking links.
- Render published dates consistently.
- If rendering Hygraph Rich Text as HTML, apply readable typography styles.
- Return 404 for missing slugs with `notFound()`.
- Keep CMS fetches on the server; avoid browser-side direct requests to Hygraph unless the API is intentionally public.

# Avoid

- Do not keep branded template layout, footer, or color classes from the starter.
- Do not hardcode project-specific endpoint URLs or tokens in source files.
- Do not put `HYGRAPH_TOKEN` in client components or `NEXT_PUBLIC_*` env vars.
- Do not assume every Hygraph project uses the exact same `Post` field names.
- Do not use `dangerouslySetInnerHTML` on arbitrary strings; only use trusted HTML produced from a controlled CMS field.
- Do not make React Query a default requirement for simple server-rendered blog pages; direct server fetching is simpler here.

# Verification

1. Confirm env vars are set:

```bash
echo $HYGRAPH_ENDPOINT
```

2. Start the app and load the blog index.
- The page should render a list of posts from Hygraph.
- No secrets should appear in browser network requests.

3. Open a valid slug route.
- The matching post should render.
- A missing slug should return a 404 page.

4. Publish a new post in Hygraph.
- After the revalidation window, it should appear in the index.
- If using `generateStaticParams`, existing routes should still work and newly published posts should be reachable after rebuild or dynamic fallback strategy updates.

5. Temporarily remove `HYGRAPH_ENDPOINT`.
- The app should fail fast with a clear server error rather than silently rendering empty content.
