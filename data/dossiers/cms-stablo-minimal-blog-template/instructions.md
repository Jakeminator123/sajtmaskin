# When to use

Use this dossier when the site's content should be managed in **Sanity** and rendered in a **Next.js App Router** frontend.

Best fit:
- blogs and editorial sites
- marketing/content sites with reusable CMS sections
- portfolios or case-study sites where non-developers need to edit content

This dossier is about the **Sanity integration**, not the Stablo template UI. Keep your own design system and page structure.

# How to integrate

## 1) Install and configure environment variables

Required env vars:

```bash
NEXT_PUBLIC_SANITY_PROJECT_ID=your_project_id
NEXT_PUBLIC_SANITY_DATASET=production
NEXT_PUBLIC_SANITY_API_VERSION=2024-01-01
SANITY_REVALIDATE_SECRET=choose-a-long-random-secret
```

Notes:
- `NEXT_PUBLIC_SANITY_PROJECT_ID` and `NEXT_PUBLIC_SANITY_DATASET` are needed by the frontend client.
- `SANITY_REVALIDATE_SECRET` protects the revalidation endpoint.
- Prefer a fixed API version string instead of `new Date()`.

## 2) Add a shared Sanity config

Create `lib/sanity/config.ts`:

```ts
export const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "";
export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
export const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2024-01-01";
export const useCdn = process.env.NODE_ENV === "production";
```

## 3) Create a Sanity client

Use `next-sanity` and keep the client reusable.

```ts
import { createClient } from "next-sanity";
import { apiVersion, dataset, projectId, useCdn } from "@/lib/sanity/config";

export const sanityClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn,
});
```

If you want helper functions for content types, keep them small and query-specific:

```ts
import { sanityClient } from "@/lib/sanity/client";
import { groq } from "next-sanity";

const postsQuery = groq`*[_type == "post" && defined(slug.current)] | order(publishedAt desc){
  _id,
  title,
  "slug": slug.current,
  publishedAt,
  excerpt
}`;

export async function getAllPosts() {
  return sanityClient.fetch(postsQuery);
}
```

## 4) Keep GROQ queries separate from rendering

Do not embed long GROQ strings directly inside page components. Prefer:
- `lib/sanity/queries.ts` for GROQ
- `lib/sanity/client.ts` for fetch helpers
- route/page files for rendering only

Example:

```ts
import { groq } from "next-sanity";

export const postBySlugQuery = groq`*[_type == "post" && slug.current == $slug][0]{
  _id,
  title,
  mainImage,
  publishedAt,
  body,
  "slug": slug.current
}`;
```

## 5) Fetch content in App Router pages

Server component example:

```tsx
import { sanityClient } from "@/lib/sanity/client";
import { postBySlugQuery } from "@/lib/sanity/queries";
import { notFound } from "next/navigation";

export default async function PostPage({ params }: { params: { slug: string } }) {
  const post = await sanityClient.fetch(postBySlugQuery, { slug: params.slug });

  if (!post) notFound();

  return (
    <article>
      <h1>{post.title}</h1>
    </article>
  );
}
```

## 6) Add on-demand revalidation

Create `app/api/revalidate/route.ts`:

```ts
import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");

  if (!process.env.SANITY_REVALIDATE_SECRET || secret !== process.env.SANITY_REVALIDATE_SECRET) {
    return NextResponse.json({ message: "Invalid secret" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const path = typeof body.path === "string" ? body.path : "/";
  const tags = Array.isArray(body.tags) ? body.tags : [];

  revalidatePath(path);
  for (const tag of tags) revalidateTag(tag);

  return NextResponse.json({ revalidated: true, path, tags });
}
```

Then configure a Sanity webhook to `POST` to:

```txt
/api/revalidate?secret=YOUR_SECRET
```

Example webhook payload:

```json
{
  "path": "/blog/my-post-slug",
  "tags": ["posts", "post:my-post-slug"]
}
```

## 7) Render rich text with Portable Text if needed

For Sanity block content, use `@portabletext/react`:

```tsx
import { PortableText } from "@portabletext/react";

export function PostBody({ value }: { value: unknown }) {
  return <PortableText value={value} />;
}
```

## 8) Image handling

If the schema uses Sanity image fields, add a URL builder helper.

```ts
import imageUrlBuilder from "@sanity/image-url";
import { sanityClient } from "@/lib/sanity/client";

const builder = imageUrlBuilder(sanityClient);

export function urlFor(source: unknown) {
  return builder.image(source);
}
```

Use it in UI:

```tsx
import Image from "next/image";
import { urlFor } from "@/lib/sanity/image";

<Image
  src={urlFor(post.mainImage).width(1200).height(630).url()}
  alt={post.title}
  width={1200}
  height={630}
/>
```

# UX rules

- Treat Sanity as the source of truth for content, but keep layout and navigation in the app codebase.
- Show graceful empty states when content is missing.
- For blog pages, always handle missing slugs with `notFound()`.
- Keep loading states minimal; most CMS reads should happen in server components.
- Preserve stable URLs when content editors change titles; route from `slug.current`, not title.
- If using revalidation tags, use predictable names like `posts`, `post:<slug>`, `author:<slug>`.

# Avoid

- Do not keep template-specific layout code, demo pages, branded fonts, or unrelated providers as part of the CMS integration.
- Do not expose write tokens in client-side code.
- Do not use an unfixed API version.
- Do not assume the dataset is public unless you intentionally configured it that way.
- Do not couple GROQ query structure directly to presentational components.
- Do not leave a demo route like `/api/hello` in production.

# Verification

1. Confirm env vars are set.
2. Load a page that fetches Sanity content and verify published documents render.
3. Test a missing slug and verify the page returns 404.
4. Send a manual revalidation request:

```bash
curl -X POST "http://localhost:3000/api/revalidate?secret=YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"path":"/","tags":["posts"]}'
```

Expected response:

```json
{
  "revalidated": true,
  "path": "/",
  "tags": ["posts"]
}
```

5. Publish or update a document in Sanity, trigger the webhook, and verify the frontend reflects the change after revalidation.
6. If images are used, verify generated Sanity image URLs load correctly in Next.js.
