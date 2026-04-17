# When to use

Use this dossier when the site needs a local-file blog or article system powered by **Next.js App Router + Contentlayer + MDX**.

Good fits:
- blogs and journals
- marketing sites with a news/resources section
- portfolio sites with writing/case-study content
- lightweight docs/content sites where content lives in the repo

Do **not** use this as the primary content system if the project needs a headless CMS, editorial workflows, remote content sync, or user-generated posts.

# How to integrate

## 1) Install and configure Contentlayer

Add the required packages if they are not already present:

```bash
npm install contentlayer next-contentlayer remark-gfm rehype-slug
```

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

Wrap Next config with Contentlayer:

```ts
import { withContentlayer } from 'next-contentlayer'

const nextConfig = {
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
}

export default withContentlayer(nextConfig)
```

## 2) Keep MDX rendering isolated in a reusable component

Use the provided renderer component pattern:

```tsx
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

This component is the integration core. Extend `components` with design-system primitives like `Callout`, `CodeBlock`, `Tweet`, etc.

## 3) Author content in `content/posts/*.mdx`

Example:

```mdx
---
title: Hello World
description: First post rendered from Contentlayer and MDX.
date: 2026-01-01
published: true
tags:
  - welcome
---

# Hello World

This is a Contentlayer post.
```

Frontmatter should match the schema in `contentlayer.config.ts`.

## 4) Render a blog index page

```tsx
import Link from 'next/link'
import { allPosts } from 'contentlayer/generated'

export default function BlogIndexPage() {
  const posts = allPosts
    .filter((post) => post.published !== false)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <ul>
      {posts.map((post) => (
        <li key={post._id}>
          <Link href={post.url}>{post.title}</Link>
        </li>
      ))}
    </ul>
  )
}
```

## 5) Render individual posts with static params

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
  const post = allPosts.find((entry) => entry.slug === params.slug && entry.published !== false)

  if (!post) notFound()

  return <Mdx code={post.body.code} />
}
```

## 6) Restart dev server after config/schema changes

Contentlayer generates types and content artifacts during dev/build. If schema changes are not reflected, restart the Next.js dev server.

# UX rules

- Show post title, publish date, and optional description on article pages.
- Sort blog lists newest-first unless the site has a different explicit information architecture.
- Hide drafts by filtering `published !== false`.
- Keep MDX content readable with a prose typographic container or equivalent content styling.
- Ensure links to posts are stable and derived from slug/url computed fields.
- If using custom MDX components, preserve semantic HTML for headings, lists, quotes, and code blocks.

# Avoid

- Do not keep template demo routes like `/api/hello`.
- Do not hardwire analytics, dark-mode toggles, top navs, or branded layout chrome into the dossier.
- Do not import from `contentlayer/generated` in client components.
- Do not query unpublished posts in public indexes or static params.
- Do not make the MDX component map depend on template-specific UI libraries unless those are already part of the target app.
- Do not assume this is a CMS; content changes require redeploy/rebuild in typical production setups.

# Verification

Check these before shipping:

1. `npm run dev` starts without Contentlayer config errors.
2. Generated imports resolve:

```ts
import { allPosts } from 'contentlayer/generated'
```

3. At least one MDX file exists under `content/posts/` with valid frontmatter.
4. `/blog` renders a list of published posts.
5. `/blog/[slug]` renders MDX body content for a real post.
6. Draft posts with `published: false` do not appear in the index or generated params.
7. Schema edits trigger regenerated types/content after a dev server restart.
