# When to use

Use this dossier when the site needs a documentation section backed by MDX files, especially if content should come from either local files or a GitHub repository. It fits content-heavy sites that need custom MDX components, syntax highlighting, table-of-contents extraction, and previous/next navigation.

# How to integrate

## 1. Keep the docs core utilities

This dossier's main building blocks are:

- `components/lib/markdown.ts` — loads and compiles MDX, extracts headings, computes previous/next links
- `components/lib/components.ts` — maps custom React components into MDX
- `components/lib/pageroutes.ts` — flattens nested docs navigation
- `components/lib/utils.ts` — class merging, search helpers, highlighting, formatting

## 2. Define your document tree

`pageroutes.ts` expects a nested documents config. Provide one from your own app, for example:

```ts
export const Documents = [
  { title: 'Introduction', href: '/docs/introduction' },
  {
    title: 'Guides',
    href: '/docs/guides',
    noLink: true,
    items: [
      { title: 'Getting Started', href: '/getting-started' },
      { title: 'Deployment', href: '/deployment' },
    ],
  },
]
```

Important: child `href` values are concatenated onto the parent `href` in `getAllLinks`, so keep that convention consistent.

## 3. Store docs as `index.mdx` files

`getDocument(slug)` resolves content at:

- local: `contents/docs/${slug}/index.mdx`
- remote GitHub raw URL when `Settings.gitload` is enabled

Example structure:

```txt
contents/
  docs/
    introduction/
      index.mdx
    guides/
      getting-started/
        index.mdx
```

Example MDX frontmatter:

```mdx
---
title: Getting Started
description: Learn how to set up the project.
keywords: setup, installation, docs
---

## Install

Run the following command.
```

## 4. Render docs in an app-router page

Use `getDocument()` in a server route and render the compiled MDX content.

```tsx
import { notFound } from 'next/navigation'
import { getDocument, getPreviousNext } from '@/lib/markdown'

export default async function DocsPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await params
  const path = slug?.join('/') ?? 'index'
  const doc = await getDocument(path)

  if (!doc) notFound()

  const { prev, next } = getPreviousNext(path)

  return (
    <article className="prose max-w-none">
      <h1>{doc.frontmatter.title}</h1>
      <p>{doc.frontmatter.description}</p>
      {doc.content}

      <aside>
        <ul>
          {doc.tocs.map((item) => (
            <li key={item.href}>
              <a href={item.href}>{item.text}</a>
            </li>
          ))}
        </ul>
      </aside>

      <nav>
        {prev ? <a href={prev.href}>← {prev.title}</a> : null}
        {next ? <a href={next.href}>{next.title} →</a> : null}
      </nav>
    </article>
  )
}
```

## 5. Keep MDX component mapping generic

`components.ts` should only register components that the app actually provides. The current file assumes custom components such as cards, tabs, notes, file trees, mermaid, and custom `pre` rendering.

If some of those do not exist in the target app, simplify the map instead of importing missing UI:

```ts
export const components = {
  a: (props: React.ComponentProps<'a'>) => <a {...props} />,
  pre: (props: React.ComponentProps<'pre'>) => <pre {...props} />,
}
```

## 6. Understand the markdown pipeline

`markdown.ts` uses:

- `remark-gfm`
- `rehype-code-titles`
- `rehype-katex`
- `rehype-prism-plus`
- `rehype-slug`
- `rehype-autolink-headings`

It also injects the raw code string onto `<pre>` nodes so custom code blocks can support copy-to-clipboard.

If you replace the custom `Pre` component, preserve the `raw` prop behavior:

```tsx
type PreProps = React.ComponentProps<'pre'> & { raw?: string }

export default function Pre({ raw, ...props }: PreProps) {
  return (
    <div>
      <button type="button" onClick={() => raw && navigator.clipboard.writeText(raw)}>
        Copy
      </button>
      <pre {...props} />
    </div>
  )
}
```

## 7. Use search helpers only if you also provide search data

`utils.ts` imports `@/public/search-data/documents.json`. That file must exist if `advanceSearch()` is used.

Expected shape:

```json
[
  {
    "slug": "/docs/getting-started",
    "title": "Getting Started",
    "content": "...",
    "description": "...",
    "_searchMeta": {
      "cleanContent": "plain text content",
      "headings": ["Install", "Usage"],
      "keywords": ["setup", "installation"]
    }
  }
]
```

If the target app does not implement docs search, do not call `advanceSearch()`.

# UX rules

- Docs pages should render a clear page title, description, and readable MDX body.
- Include a table of contents when pages have multiple `##` to `####` headings.
- Include previous/next pagination for linear doc flows.
- Code blocks should support copying when a custom `pre` renderer is used.
- Preserve heading IDs and anchor links so deep-linking works.
- If using GitHub-backed content, handle fetch failures with `notFound()` or a graceful empty state.

# Avoid

- Do not keep the provided `app/layout.tsx` as-is unless the app already has matching `Navbar`, `Footer`, `Providers`, `Settings`, and GTM setup.
- Do not import template-only components referenced by `components.ts` unless you also port those components.
- Do not use `advanceSearch()` without creating the `public/search-data/documents.json` index.
- Do not change the route concatenation behavior in `pageroutes.ts` without also changing your `Documents` config format.
- Do not assume remote GitHub loading is cache-safe; add revalidation or caching strategy deliberately if used at scale.

# Verification

1. Create one local MDX document at `contents/docs/introduction/index.mdx`.
2. Add a matching route entry in your documents config.
3. Open the docs page and confirm:
   - the frontmatter title renders
   - `##` headings appear in the TOC
   - code blocks render with syntax highlighting
   - previous/next links resolve correctly
4. If using custom `pre`, verify the copy button copies the raw code text.
5. If using search, confirm `advanceSearch('install')` returns ranked results from `documents.json`.
6. If using GitHub content loading, verify a bad slug returns `null` from `getDocument()` and the route handles it with `notFound()`.
