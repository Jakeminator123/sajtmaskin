# When to use

Use this dossier for a Next.js site whose primary job is serving documentation, guides, API references, or a knowledge base written in MDX. Choose it when content authors should add pages by creating `.mdx` files rather than building custom React routes by hand.

This is a good fit for:
- product documentation
- internal docs portals
- developer guides
- changelog/help-center style content sites

Do not use it for a marketing homepage, app dashboard, or blog-first site unless docs are the main information architecture.

# How to integrate

## 1) Install dependencies

```bash
npm install nextra nextra-theme-docs
```

## 2) Configure Next.js to use Nextra

Create or replace `next.config.mjs`:

```js
import nextra from 'nextra'

const withNextra = nextra({
  theme: 'nextra-theme-docs',
  themeConfig: './theme.config.tsx'
})

export default withNextra({
  reactStrictMode: true
})
```

This is the core integration point. Without it, `.mdx` docs pages will not be processed by Nextra.

## 3) Add theme config

Create `theme.config.tsx` at the project root:

```tsx
import React from 'react'
import type { DocsThemeConfig } from 'nextra-theme-docs'

const config: DocsThemeConfig = {
  logo: <span>Documentation</span>,
  project: {
    link: 'https://github.com/your-org/your-repo'
  },
  docsRepositoryBase: 'https://github.com/your-org/your-repo/tree/main',
  footer: {
    text: 'Documentation'
  },
  useNextSeoProps() {
    return {
      titleTemplate: '%s – Documentation'
    }
  }
}

export default config
```

Update these values:
- `logo` → site or product name
- `project.link` → canonical repo URL
- `docsRepositoryBase` → base URL for editing/viewing docs source
- `footer.text` → concise product/docs label

## 4) Add MDX content

Create docs pages as `.mdx` files. A minimal starter page:

```mdx
---
title: Introduction
---

# Introduction

Welcome to your documentation site.

## Getting started

Create additional `.mdx` files to add new pages.

## Example

```ts
export function hello(name: string) {
  return `Hello, ${name}`
}
```
```

Place content where the target app expects docs routes. If using this dossier as a reusable building block, preserve the pattern of MDX-authored pages and let the consuming scaffold decide the exact route segment.

## 5) Keep routing and content layout simple

Nextra works best when docs pages are content-driven. Prefer:
- one file per page
- stable URL slugs
- short, descriptive titles
- shallow hierarchy unless the docs set is truly large

## 6) Typical app-level usage

The runtime LLM should integrate this into a Next.js app by:
- enabling Nextra in `next.config.mjs`
- placing `theme.config.tsx` at project root
- creating MDX pages for docs content
- wiring site navigation so `/docs` or the docs root is reachable from the main UI

# UX rules

- Treat docs as content, not as a custom-designed marketing surface.
- Keep the logo, footer text, and repo links accurate and production-real.
- Use clear page titles and first-paragraph summaries so sidebar/search results are meaningful.
- Prefer predictable URLs like `getting-started`, `installation`, `configuration`, `api`.
- Ensure docs pages render well in both light and dark themes if the host app supports theme switching.
- If the host product already has branding, align the Nextra theme config with it instead of leaving generic placeholders.
- Include at least one real top-level introduction page before adding deep nested sections.

# Avoid

- Do not keep template-specific demo branding such as fake org names or placeholder repository URLs in production.
- Do not depend on legacy `_meta.json` structure unless the target codebase is explicitly built around that version/pattern.
- Do not mix docs content with unrelated landing-page components inside MDX pages.
- Do not create a docs site with zero repository/edit links if the project is open source or docs contributions are expected.
- Do not over-customize the theme until the basic docs information architecture is working.

# Verification

After integration, verify all of the following:

## Build-time checks

- `nextra` and `nextra-theme-docs` are installed.
- `next.config.mjs` wraps the app with `nextra(...)`.
- `theme.config.tsx` exists at the path referenced by `themeConfig`.
- At least one `.mdx` docs page exists.

## Runtime checks

Run the app locally and confirm:

- the docs route loads without MDX compilation errors
- the page uses the docs theme layout
- the logo renders
- repo/edit links point to real URLs
- code blocks render correctly
- page title template is applied

## Minimal smoke test

1. Start the app.
2. Open the docs homepage.
3. Confirm the introduction page renders.
4. Add a second MDX page and verify it appears in navigation if the host routing/content structure supports it.
5. Build for production:

```bash
npm run build
```

The integration is correct when MDX pages compile cleanly and the site behaves like a documentation-first Next.js app using Nextra.
