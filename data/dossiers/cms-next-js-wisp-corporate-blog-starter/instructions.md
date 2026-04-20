# When to use

Use this dossier when the site needs a blog or article section powered by **Wisp CMS** in a **Next.js App Router** app.

It is a good fit for:
- marketing sites with a blog
- company/content websites
- portfolios or product sites that publish articles, changelogs, or announcements

Do **not** use it if the project needs a fully custom editorial backend, multi-source content federation, or heavy document modeling beyond Wisp's hosted blog workflow.

# How to integrate

## 1) Install and configure

Required env vars:

```env
NEXT_PUBLIC_BLOG_ID=your_wisp_blog_id
NEXT_PUBLIC_BASE_URL=https://your-site.com
NEXT_PUBLIC_BLOG_ORGANIZATION=Your Company
NEXT_PUBLIC_BLOG_TITLE=Your Blog
NEXT_PUBLIC_BLOG_DESCRIPTION=Articles and updates
```

Create a central config file:

```ts
// src/config.ts
export const config = {
  blogId: process.env.NEXT_PUBLIC_BLOG_ID ?? "",
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000",
  blogOrganization: process.env.NEXT_PUBLIC_BLOG_ORGANIZATION ?? "",
  blogTitle: process.env.NEXT_PUBLIC_BLOG_TITLE ?? "",
  blogDescription: process.env.NEXT_PUBLIC_BLOG_DESCRIPTION ?? "",
};

if (!config.blogId) {
  throw new Error("Missing NEXT_PUBLIC_BLOG_ID");
}
```

Initialize the Wisp client once:

```ts
// src/lib/wisp.ts
import { buildWispClient } from "@wisp-cms/client";
import { config } from "@/config";

export const wisp = buildWispClient({
  blogId: config.blogId,
});
```

## 2) Fetch posts in server components

Use the client from server components, route handlers, or metadata functions.

Example blog index page:

```tsx
// src/app/blog/page.tsx
import { wisp } from "@/lib/wisp";
import Link from "next/link";

export default async function BlogPage() {
  const result = await wisp.getPosts({ limit: 20 });
  const posts = result.posts ?? [];

  return (
    <main>
      <h1>Blog</h1>
      <ul>
        {posts.map((post) => (
          <li key={post.id}>
            <Link href={`/blog/${post.slug}`}>{post.title}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

Example dynamic post page:

```tsx
// src/app/blog/[slug]/page.tsx
import { notFound } from "next/navigation";
import { wisp } from "@/lib/wisp";

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await wisp.getPost(slug);

  if (!post) notFound();

  return (
    <article>
      <h1>{post.title}</h1>
      {post.description ? <p>{post.description}</p> : null}
      <div dangerouslySetInnerHTML={{ __html: post.content ?? "" }} />
    </article>
  );
}
```

If your installed Wisp client version uses a different method signature for `getPost`, adapt to that version's API, but keep the same pattern: fetch on the server, 404 when missing, and render CMS-controlled content carefully.

## 3) Add metadata from CMS content

Generate page metadata from Wisp post data so titles, descriptions, and social sharing reflect the article.

```tsx
// src/app/blog/[slug]/page.tsx
import type { Metadata } from "next";
import { wisp } from "@/lib/wisp";
import { config } from "@/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await wisp.getPost(slug);

  if (!post) {
    return {
      title: config.blogTitle,
      description: config.blogDescription,
    };
  }

  const ogImage = `${config.baseUrl}/api/og-image?title=${encodeURIComponent(post.title)}&brand=${encodeURIComponent(config.blogTitle)}`;

  return {
    title: post.title,
    description: post.description ?? config.blogDescription,
    openGraph: {
      title: post.title,
      description: post.description ?? config.blogDescription,
      type: "article",
      images: [{ url: ogImage }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description ?? config.blogDescription,
      images: [ogImage],
    },
  };
}
```

## 4) Keep OG image generation server-side

This dossier includes a server route for dynamic social images:

```tsx
// src/app/api/og-image/route.tsx
import { config } from "@/config";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

const generateOpenGraphImage = async ({
  title,
  brandText,
}: {
  title: string;
  brandText?: string;
}) => {
  const fonts = {
    "ibm-regular": {
      name: "IBMPlexSans",
      data: await fetch(
        new URL("fonts/IBMPlexSans-Regular.ttf", config.baseUrl)
      ).then((res) => res.arrayBuffer()),
      weight: 400 as const,
      style: "normal" as const,
    },
    "ibm-semibold": {
      name: "IBMPlexSans",
      data: await fetch(
        new URL("fonts/IBMPlexSans-SemiBold.ttf", config.baseUrl)
      ).then((res) => res.arrayBuffer()),
      weight: 600 as const,
      style: "normal" as const,
    },
  };

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#ffffff",
          justifyContent: "space-between",
          fontWeight: "400",
          fontFamily: "IBMPlexSans",
          color: "#212121",
          padding: "40px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              marginTop: "40px",
              fontSize: "96px",
              fontWeight: "600",
              lineHeight: "6rem",
              padding: "0 0 100px 0",
              letterSpacing: "-0.025em",
              color: "#212121",
              fontFamily: "IBMPlexSans",
            }}
          >
            {title}
          </div>
        </div>
        {brandText ? (
          <div
            style={{
              fontSize: "32px",
              fontWeight: "900",
              color: "#212121",
              display: "flex",
              textAlign: "right",
              width: "100%",
              justifyContent: "flex-end",
            }}
          >
            {brandText}
          </div>
        ) : null}
      </div>
    ),
    {
      width: 1200,
      height: 600,
      fonts: [fonts["ibm-regular"], fonts["ibm-semibold"]],
    }
  );
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const title = searchParams.get("title");

  if (!title) {
    return new Response("Missing title", { status: 400 });
  }

  const brandText = searchParams.get("brand") || undefined;

  return generateOpenGraphImage({
    title,
    brandText,
  });
}
```

Important: this route assumes font files are publicly accessible at `/fonts/...` from `NEXT_PUBLIC_BASE_URL`. If those font files are not present, either add them under `public/fonts` or simplify the route to use default fonts.

# UX rules

- Treat Wisp content as the source of truth for post title, description, slug, publish date, and body.
- Fetch CMS data in **server components** by default.
- Show a proper empty state when no posts exist.
- Return `notFound()` for missing slugs instead of rendering partial content.
- Use CMS-driven metadata for SEO and sharing.
- Keep blog navigation and layout native to the site; only the content source should be Wisp-specific.
- If rendering HTML from the CMS, sanitize or strictly trust only Wisp-managed content you control.

# Avoid

- Do not keep template-specific shell code like branded footers, custom providers, or demo marketing sections unless the project explicitly needs them.
- Do not hardcode placeholder metadata like `Create Next App`.
- Do not make Wisp fetching client-side unless there is a clear interactive requirement.
- Do not assume font assets exist for the OG image route; verify them.
- Do not couple the integration to one exact page structure; keep Wisp isolated to config, data fetching, and content rendering.

# Verification

- `NEXT_PUBLIC_BLOG_ID` is set and the app starts without config errors.
- A server component can call `wisp.getPosts(...)` and render at least one post title.
- A dynamic route can fetch a post by slug and returns 404 for an invalid slug.
- `/api/og-image?title=Hello` returns an image response.
- Generated metadata for a post includes title, description, and a valid social image URL.
- Production `NEXT_PUBLIC_BASE_URL` matches the deployed site origin.
