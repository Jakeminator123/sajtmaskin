# When to use

Use Builder.io when editors should manage page content visually and when you want Builder to choose different variants for different audiences on the same route.

Typical fit:
- marketing sites and landing pages
- content sites with editor-managed layouts
- personalized homepage or campaign pages
- experiments based on audience attributes like device, segment, or URL path

Do not use this dossier for Shopify storefront logic, carts, or product indexing. This dossier is only for Builder.io page content and personalization.

# How to integrate

## 1) Install Builder packages

```bash
npm install @builder.io/sdk @builder.io/react
```

## 2) Add environment variables

```env
NEXT_PUBLIC_BUILDER_API_KEY=your_builder_public_api_key
```

If you use custom targeting attributes from the server, also make sure the app can determine them from cookies, headers, session data, or query params.

## 3) Initialize the SDK once

Create `lib/builder.ts`:

```ts
import { builder } from '@builder.io/sdk';

const apiKey = process.env.NEXT_PUBLIC_BUILDER_API_KEY;

if (!apiKey) {
  throw new Error('Missing NEXT_PUBLIC_BUILDER_API_KEY');
}

builder.init(apiKey);

export { builder };
```

## 4) Add a catch-all App Router page

Use a route such as `app/[[...slug]]/page.tsx` to map incoming URLs to Builder page entries.

```tsx
import { notFound } from 'next/navigation';
import { builder } from '@/lib/builder';
import { RenderBuilderContent } from './render-builder-content';

function toPath(slug?: string[]) {
  if (!slug || slug.length === 0) return '/';
  return `/${slug.join('/')}`;
}

export default async function BuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const urlPath = toPath(slug);

  const content = await builder
    .get('page', {
      userAttributes: {
        urlPath,
        device: typeof query.device === 'string' ? query.device : undefined,
        segment: typeof query.segment === 'string' ? query.segment : undefined,
      },
      prerender: false,
    })
    .toPromise();

  if (!content) notFound();

  return <RenderBuilderContent model="page" content={content} />;
}
```

## 5) Render Builder content in a client component

```tsx
'use client';

import { BuilderComponent } from '@builder.io/react';

export function RenderBuilderContent({ model, content }: { model: string; content: any }) {
  return <BuilderComponent model={model} content={content} />;
}
```

## 6) Pass personalization attributes deliberately

Builder personalization depends on the values you send in `userAttributes`. Keep these stable and explicit.

Server-side example:

```ts
const content = await builder
  .get('page', {
    userAttributes: {
      urlPath,
      device,
      segment,
      country,
      loggedIn: !!session?.user,
    },
    prerender: false,
  })
  .toPromise();
```

Good sources for targeting values:
- pathname from route params
- device hint derived from user agent or client hints
- country/locale from middleware or headers
- customer segment from auth/session
- campaign from query params, if intentionally supported

## 7) Metadata

If Builder content owns SEO fields, read them in `generateMetadata`.

```tsx
export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const urlPath = !slug?.length ? '/' : `/${slug.join('/')}`;

  const content = await builder
    .get('page', {
      userAttributes: { urlPath },
      fields: 'data.title,data.description',
      prerender: false,
    })
    .toPromise();

  return {
    title: content?.data?.title,
    description: content?.data?.description,
  };
}
```

## 8) Preview / draft mode

If the site needs live preview for editors, wire Next.js Draft Mode and allow preview requests to fetch Builder draft content. The exact setup can vary, but the rule is: preview requests should bypass static assumptions and fetch the latest Builder content.

# UX rules

- Personalization must not produce layout shifts between variants; keep shared structure and dimensions stable.
- Always define a default experience in Builder for users who match no audience rule.
- Keep important navigation, legal text, and core trust elements outside of fragile experiment-only blocks.
- Personalization inputs should be explainable: URL, locale, device, auth state, campaign, or known segment.
- If using query params for demos or QA, treat them as non-secure hints, not authorization.
- Use server-rendered targeting where possible so the correct variant is chosen on first paint.

# Avoid

- Do not keep Shopify env vars, cart providers, or commerce utilities from the source template; they are unrelated.
- Do not fetch Builder content without a `urlPath` when routing pages by pathname.
- Do not rely only on client-side targeting for above-the-fold personalized content; it can flash the wrong variant.
- Do not omit a fallback experience; missing personalization rules should still render a valid page.
- Do not hardcode template branding, demo copy, or vendor-specific UI from the original starter.

# Verification

1. Set `NEXT_PUBLIC_BUILDER_API_KEY`.
2. In Builder, create a `page` entry targeting `/`.
3. Load `/` locally and confirm the Builder page renders.
4. Add a second variant in Builder using an audience rule, for example `segment = vip`.
5. Load `/?segment=vip` and confirm the personalized variant renders.
6. Load the same page without `segment=vip` and confirm the default variant renders.
7. Visit an unmapped path and confirm the app returns `notFound()`.
8. If metadata fields are configured in Builder, verify page title/description update accordingly.
