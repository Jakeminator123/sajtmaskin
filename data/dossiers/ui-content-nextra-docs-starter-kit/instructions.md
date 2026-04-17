# When to use

Use this dossier when the site should primarily be a documentation or knowledge-base experience powered by Markdown/MDX in Next.js. It fits product docs, developer docs, internal guides, API references, onboarding manuals, and content-heavy help centers.

# How to integrate

1. Install the required packages:

```bash
npm install nextra nextra-theme-docs
```

2. Add a Nextra-enabled Next.js config:

```js
// next.config.mjs
import nextra from 'nextra'

const withNextra = nextra({
  theme: 'nextra-theme-docs',
  themeConfig: './theme.config.tsx'
})

export default withNextra({
  reactStrictMode: true
})
```

3. Add a theme config:

```tsx
// theme.config.tsx
import type { DocsThemeConfig } from 'nextra-theme-docs'

const config: DocsThemeConfig = {
  logo: <span>Documentation</span>,
  project: {
    link: 'https://github.com/your-org/your-repo'
  },
  docsRepositoryBase: 'https://github.com/your-org/your-repo/tree/main',
  footer: {
    text: 'Documentation'
  }
}

export default config
```

4. Create MDX content files for docs pages:

```mdx
---
title: Introduction
---

# Introduction

Welcome to your docs.
```

5. Add navigation metadata so pages appear in the intended order:

```json
{
  "index": "Introduction",
  "getting-started": "Getting Started",
  "api": "API"
}
```

6. Put docs content in a dedicated content area such as `content/` or the app root content structure used by the project. Keep the docs tree shallow and predictable.

7. Ensure the runtime scaffold does not conflict with Nextra routing or MDX handling. If the site already has a custom content pipeline, prefer one docs system only.

# UX rules

- Use docs-first information architecture: concise sidebar labels, clear section nesting, and predictable page titles.
- Every page should have one clear purpose and a visible H1.
- Prefer short paragraphs, code examples, and step-by-step sections over long marketing copy.
- Keep repository/edit links accurate if exposed in the theme config.
- Make the docs homepage useful: overview, quickstart, and common paths.
- Use frontmatter titles consistently so SEO titles and sidebar labels stay coherent.

# Avoid

- Do not keep template demo components or tutorial widgets unless the user explicitly asked for them.
- Do not mix Nextra with another MDX/docs framework in the same docs area.
- Do not hardcode template branding, demo repo URLs, or placeholder product names in final output.
- Do not create complex custom page chrome unless the user asked for a highly customized docs experience; start from the theme defaults.
- Do not omit navigation metadata if page ordering matters.

# Verification

- `next.config.mjs` wraps the app with `nextra(...)` and references `nextra-theme-docs`.
- `theme.config.tsx` exists and exports a valid docs theme config.
- At least one `.mdx` page exists and renders successfully.
- Navigation metadata exists for sections where ordering/labels matter.
- Running the app shows docs pages with the Nextra docs layout, sidebar behavior, and MDX rendering.
- No leftover demo-only components remain from the source template.
