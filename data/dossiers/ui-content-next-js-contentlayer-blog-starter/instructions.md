# When to use

Use this dossier when a site should publish content from local Markdown/MDX files inside the repo rather than from a CMS.

Best fit:
- blogs
- journals
- docs-lite sites
- founder notes / changelog sections
- portfolio sites with article content

Use an alternative if:
- editors need a hosted admin UI
- content must be updated by non-developers without git
- the project should avoid unmaintained tooling

Note: Contentlayer is widely used but currently not actively maintained. Prefer a newer stack like Velite or plain `@next/mdx` for greenfield projects when long-term maintenance matters.

# How to integrate

## 1. Install required packages

```bash
npm install contentlayer next-contentlayer remark-gfm rehype-slug
```

If the app does not already have MDX/content styling, also ensure your typography/UI stack supports article rendering.

## 2. Add the Contentlayer config

Create `contentlayer.config.ts`:

```ts
import { defineDocumentType, makeSource } from 'contentlayer/source-files'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'

export const Post = defineDocumentType(() => ({
  name: 'Post',
  filePathPattern: 'posts/**/*.mdx',
  contentType: 'mdx',
  fields: {
    title: { type: 'string', required: true },
    description: { type: 'string', required: false },
    date: { type: 'date', required: true },
    published: { type: 'boolean', required: false, default: true },
    tags: { type: 'list', of: { type: 'string' }, required: false },
  },
  computedFields: {
    slug: {
      type: 'string',
      resolve: (doc) => doc._raw.flattenedPath.replace(/^posts\//, ''),
    },
    url: {
      type: 'string',
      resolve: (doc) => `/blog/${doc._raw.flattenedPath.replace(/^posts\//, '')}`,
    },
  },
}))

export default makeSource({
  contentDirPath: 'content',
  documentTypes: [Post],
  mdx: {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [rehypeSlug],
  },
})
```

## 3. Wrap Next config with Contentlayer

Create or update `next.config.mjs`:

```js
import { withContentlayer } from 'next-contentlayer'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
}

export default withContentlayer(nextConfig)
```

## 4. Add a minimal MDX renderer

Create `components/mdx-components.tsx` or equivalent:

```tsx
'use client'

import Image from 'next/image'
import { useMDXComponent } from 'next-contentlayer/hooks'

const components = {
  Image,
}

export function Mdx({ code }: { code: string }) {
  const Component = useMDXComponent(code)
  return <Component components={components} />
}
```

Important: because `useMDXComponent` is a hook from `next-contentlayer/hooks`, this file should be treated as a client component.

## 5. Author content in `/content/posts`

Example `content/posts/hello-world.mdx`:

```mdx
---
title: Hello World
description: First post rendered from Contentlayer and MDX.
date: 2026-01-01
published: true
tags:
  - welcome
  - mdx
---

# Hello World

This post is loaded from the local `content/posts` directory and compiled by Contentlayer.
```

## 6. Build a blog index route

Example `app/blog/page.tsx`:

```tsx
import Link from 'next/link'
import { allPosts } from 'contentlayer/generated'

export default function BlogIndexPage() {
  const posts = allPosts
    .filter((post) => post.published !== false)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <main>
      <h1>Blog</h1>
      <ul>
        {posts.map((post) => (
          <li key={post._id}>
            <Link href={post.url}>{post.title}</Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

## 7. Build a dynamic post route

Example `app/blog/[slug]/page.tsx`:

```tsx
import { allPosts } from 'contentlayer/generated'
import { notFound } from 'next/navigation'
import { Mdx } from '@/components/mdx-components'

export async function generateStaticParams() {
  return allPosts
    .filter((post) => post.published !== false)
    .map((post) => ({ slug: post.slug }))
}

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = allPosts.find(
    (entry) => entry.slug === params.slug && entry.published !== false
  )

  if (!post) notFound()

  return (
    <article>
      <header>
        <h1>{post.title}</h1>
        {post.description ? <p>{post.description}</p> : null}
        <time dateTime={post.date}>{new Date(post.date).toLocaleDateString()}</time>
      </header>
      <Mdx code={post.body.code} />
    </article>
  )
}
```

## 8. Use the generated types and data only after Contentlayer is configured

Imports like this should work after setup:

```ts
import { allPosts } from 'contentlayer/generated'
```

If they fail, the config or build integration is incomplete.

# UX rules

- Treat `published: false` as a draft flag and exclude drafts from public routes.
- Always sort posts by date descending unless the product explicitly wants another order.
- Render article pages inside readable typography styles; MDX without prose/article styling usually looks broken.
- Show title, publish date, and optional description at minimum.
- Preserve stable canonical URLs based on slug; do not derive URLs from mutable titles at runtime.
- If using custom MDX components, keep the mapping small and predictable.
- If using `next/image` inside MDX, ensure authors know the required props and allowed usage patterns.

# Avoid

- Do not keep template-branded blog chrome, demo hero sections, or unrelated landing-page UI in this dossier.
- Do not import from `contentlayer/generated` before wiring `withContentlayer` in Next config.
- Do not expose draft posts publicly unless the product explicitly needs preview behavior.
- Do not rely on Contentlayer for user-generated or runtime-authored content.
- Do not overfit the schema to a single blog template; keep frontmatter generic.
- Do not assume Contentlayer is the best long-term choice for new projects; mention alternatives when relevant.

# Verification

Use this checklist after integration:

1. Run the app and confirm Contentlayer generation succeeds.
2. Verify `contentlayer/generated` imports resolve without type/build errors.
3. Add a new file under `content/posts/test-post.mdx` and confirm it appears in `/blog`.
4. Open `/blog/test-post` and confirm the article renders.
5. Set `published: false` and confirm the post disappears from the index and direct route.
6. Confirm markdown features from `remark-gfm` work as expected.
7. Confirm heading IDs are generated from `rehype-slug`.
8. Run a production build to ensure static generation works.

Example verification commands:

```bash
npm run dev
npm run build
```

If build fails with missing generated modules, re-check:
- `contentlayer.config.ts` exists at project root
- `next.config.mjs` uses `withContentlayer`
- content files are inside the configured `contentDirPath`
- imports point to `contentlayer/generated`
```
