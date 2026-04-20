# When to use

Use this dossier when a Next.js App Router site should fetch content from Sanity and support draft previews / Presentation Tool with `next-sanity`.

Best fit:
- blogs, editorial sites, portfolios, marketing sites with structured content
- sites that need draft preview before publish
- projects using Sanity Studio separately or mounted elsewhere

Do not use this dossier by itself if you need a full Studio embed, schemas, or content models; this dossier only covers the frontend integration layer.

# How to integrate

## 1) Install dependencies

```bash
npm install next-sanity sanity
```

If you want Presentation Tool / Visual Editing, keep `next-sanity` at a version that supports App Router draft mode.

## 2) Add environment variables

```env
NEXT_PUBLIC_SANITY_PROJECT_ID=your_project_id
NEXT_PUBLIC_SANITY_DATASET=production
NEXT_PUBLIC_SANITY_API_VERSION=2025-09-25
NEXT_PUBLIC_SANITY_STUDIO_URL=http://localhost:3333
SANITY_API_READ_TOKEN=your_read_token
```

Notes:
- `NEXT_PUBLIC_SANITY_PROJECT_ID` and `NEXT_PUBLIC_SANITY_DATASET` are required.
- `NEXT_PUBLIC_SANITY_API_VERSION` should be pinned to a fixed date.
- `NEXT_PUBLIC_SANITY_STUDIO_URL` is used by stega / edit-intent links and should point to your Studio.
- `SANITY_API_READ_TOKEN` is server-only. It is needed for draft access and private datasets.

## 3) Keep the shared Sanity config

`sanity/lib/api.ts`

```ts
function assertValue<T>(v: T | undefined, errorMessage: string): T {
  if (v === undefined) {
    throw new Error(errorMessage)
  }

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

export const studioUrl = process.env.NEXT_PUBLIC_SANITY_STUDIO_URL || 'http://localhost:3333'
```

`sanity/lib/token.ts`

```ts
export const token = process.env.SANITY_API_READ_TOKEN
```

## 4) Create the Sanity client

`sanity/lib/client.ts`

```ts
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

Guidance:
- `useCdn: true` is good for published content reads.
- For preview/draft flows, use the token-enabled client on the server.
- Do not import the token into client components.

## 5) Add the draft-mode enable route

`app/api/draft-mode/enable/route.ts`

```ts
import {defineEnableDraftMode} from 'next-sanity/draft-mode'

import {client} from '@/sanity/lib/client'
import {token} from '@/sanity/lib/token'

export const {GET} = defineEnableDraftMode({
  client: client.withConfig({token}),
})
```

Use this route as the `previewMode.enable` URL in your Sanity Presentation Tool configuration.

## 6) Render Visual Editing only in draft mode

In the root App Router layout:

```tsx
import type {ReactNode} from 'react'
import {draftMode} from 'next/headers'
import {VisualEditing} from 'next-sanity/visual-editing'

export default async function RootLayout({children}: {children: ReactNode}) {
  const {isEnabled} = await draftMode()

  return (
    <html lang="en">
      <body>
        {children}
        {isEnabled ? <VisualEditing /> : null}
      </body>
    </html>
  )
}
```

This is the minimum wiring needed for click-to-edit overlays and Presentation Tool integration.

## 7) Query content on the server

Example server component:

```tsx
import {groq} from 'next-sanity'
import {client} from '@/sanity/lib/client'

const pageQuery = groq`*[_type == "page" && slug.current == $slug][0]{
  _id,
  title,
  body
}`

export default async function Page({params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params
  const page = await client.fetch(pageQuery, {slug})

  if (!page) return <div>Not found</div>

  return <main><h1>{page.title}</h1></main>
}
```

If you build a richer integration later, centralize fetch helpers so draft-mode handling, tags, and revalidation are consistent.

# UX rules

- Show published content by default; draft-only content should appear only in preview flows.
- Keep preview behavior invisible to normal visitors.
- Do not expose edit controls unless draft mode is enabled.
- If the site uses Visual Editing, the Studio URL must be correct in every environment.
- Metadata, sitemap content, and public SEO surfaces should prefer published content and avoid draft-only leakage.

# Avoid

- Do not keep template demo data like `demo.ts` in production integrations.
- Do not put `SANITY_API_READ_TOKEN` in `NEXT_PUBLIC_*` env vars.
- Do not import server-only token helpers into client components.
- Do not make the entire site layout depend on template-specific header/footer/font code from the source template.
- Do not use floating API versions like `new Date()`; pin a fixed Sanity API date.
- Do not assume the frontend and Studio are hosted together; treat `NEXT_PUBLIC_SANITY_STUDIO_URL` as explicit config.

# Verification

1. Start the app with valid Sanity env vars.
2. Confirm server-side content fetches work with `client.fetch(...)`.
3. Open the draft-mode route from Sanity Presentation Tool or directly through the configured preview flow.
4. Verify `VisualEditing` appears only when draft mode is enabled.
5. Confirm published visitors cannot see draft overlays.
6. If using a private dataset or drafts, verify the server can read them with `SANITY_API_READ_TOKEN`.
7. Check production env configuration for:
   - correct project ID
   - correct dataset
   - pinned API version
   - correct Studio URL
   - server-only read token
