# When to use

Use this dossier when the site needs a CMS-backed blog in **Next.js 14 App Router** and content should come from **Wisp CMS**. It fits blogs, editorial sections, changelogs, founder journals, case-study hubs, and content-heavy marketing sites.

Use it when you need:
- server-rendered blog index and post pages
- CMS-managed titles, descriptions, publish dates, and HTML content
- SEO metadata driven from CMS entries
- an RSS feed
- dynamic Open Graph images for posts

Do **not** use this dossier for a purely local Markdown blog or when the project does not need an external CMS.

# How to integrate

## 1) Install dependencies

Required core packages:

```bash
npm install @wisp-cms/client date-fns rss
```

If the project already includes them, do not duplicate.

## 2) Add environment variables

```env
NEXT_PUBLIC_BLOG_ID=your_wisp_blog_id
NEXT_PUBLIC_BASE_URL=https://example.com
NEXT_PUBLIC_BLOG_ORGANIZATION=Your Company
NEXT_PUBLIC_BLOG_TITLE=Your Blog Title
NEXT_PUBLIC_BLOG_DESCRIPTION=Your blog description
```

Notes:
- `NEXT_PUBLIC_BLOG_ID` comes from Wisp setup.
- `NEXT_PUBLIC_BASE_URL` must be the production site origin with protocol.
- Blog title/description/org values should match the site brand and SEO copy.

## 3) Create a shared site config

```ts
// src/lib/site-config.ts
export const siteConfig = {
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000",
  blogId: process.env.NEXT_PUBLIC_BLOG_ID || "",
  organization: process.env.NEXT_PUBLIC_BLOG_ORGANIZATION || "",
  title: process.env.NEXT_PUBLIC_BLOG_TITLE || "",
  description: process.env.NEXT_PUBLIC_BLOG_DESCRIPTION || "",
};
```

Prefer a small config module over scattering `process.env` reads across pages.

## 4) Initialize the Wisp client

```ts
// src/lib/wisp.ts
import { buildWispClient } from "@wisp-cms/client";
import { siteConfig } from "@/lib/site-config";

export const wisp = buildWispClient({
  blogId: siteConfig.blogId,
});
```

Keep this module server-safe and reusable.

## 5) Build the blog index as a Server Component

```tsx
// src/app/blog/page.tsx
import { wisp } from "@/lib/wisp";

export default async function BlogPage() {
  const posts = await wisp.getPosts({ limit: 20 });

  return (
    <main>
      {posts.posts.map((post) => (
        <article key={post.id}>
          <a href={`/blog/${post.slug}`}>{post.title}</a>
          <p>{post.description}</p>
        </article>
      ))}
    </main>
  );
}
```

Guidance:
- Fetch in the server component directly.
- Keep pagination/simple filtering server-side.
- Use `post.slug` as the route segment.

## 6) Build the post detail route

```tsx
// src/app/blog/[slug]/page.tsx
import { wisp } from "@/lib/wisp";
import { notFound } from "next/navigation";

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const post = await wisp.getPost(slug);
    return <div dangerouslySetInnerHTML={{ __html: post.content }} />;
  } catch {
    notFound();
  }
}
```

Important:
- Handle fetch failures with `notFound()` for unknown slugs.
- Render post metadata near the title: date, author if available, reading time if available.
- Treat CMS HTML as trusted only if it comes from your controlled Wisp instance.

## 7) Generate metadata per post

```tsx
import type { Metadata } from "next";
import { wisp } from "@/lib/wisp";
import { siteConfig } from "@/lib/site-config";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await wisp.getPost(slug);

  return {
    title: post.title,
    description: post.description || siteConfig.description,
    openGraph: {
      title: post.title,
      description: post.description || siteConfig.description,
      type: "article",
      url: `${siteConfig.baseUrl}/blog/${post.slug}`,
    },
  };
}
```

Always prefer post-specific title/description over site defaults.

## 8) Add a dynamic OG image route

A dedicated image route is useful for post cards in social previews.

```tsx
// src/app/api/og-image/route.tsx
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const title = request.nextUrl.searchParams.get("title");
  if (!title) return new Response("Missing title", { status: 400 });

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          padding: "48px",
          fontSize: 64,
          background: "white",
          color: "black",
        }}
      >
        {title}
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
```

If using local/custom fonts, make sure the font files are actually available at runtime. Do not keep font-fetch logic that references missing assets.

## 9) Add RSS

```ts
// src/app/rss.xml/route.ts
import { wisp } from "@/lib/wisp";
import RSS from "rss";
import { siteConfig } from "@/lib/site-config";

export async function GET() {
  const posts = await wisp.getPosts({ limit: 100 });

  const feed = new RSS({
    title: siteConfig.title,
    description: siteConfig.description,
    site_url: siteConfig.baseUrl,
    feed_url: `${siteConfig.baseUrl}/rss.xml`,
  });

  posts.posts.forEach((post) => {
    feed.item({
      title: post.title,
      description: post.description || "",
      url: `${siteConfig.baseUrl}/blog/${post.slug}`,
      guid: post.id,
    });
  });

  return new Response(feed.xml({ indent: true }), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
```

## 10) Date formatting helper

```ts
import { format } from "date-fns";

export const formatFullDate = (date: Date) => format(date, "dd MMM yyyy");
```

Use a shared formatter so list pages and article pages stay consistent.

# UX rules

- Blog index must clearly show title, publish date, and short description/excerpt.
- Post pages must prioritize readability: constrained width, strong heading hierarchy, generous spacing.
- Links to posts should use descriptive titles, not generic “Read more” only.
- Metadata should reflect the current post, not the site default, whenever post data is available.
- If the site has a main navigation, include a visible blog entry point.
- RSS should be discoverable from footer, head metadata, or a visible blog utility area.
- OG images should be deterministic and branded, but simple beats fragile custom rendering.

# Avoid

- Do not keep template-specific app shell code like branded footers, theme providers, or unrelated UI wrappers as part of the CMS integration.
- Do not hardcode `Create Next App` metadata.
- Do not reference `@/config` unless you also create that module; use a real shared config file.
- Do not assume local font assets exist in the OG route.
- Do not move Wisp fetching into unnecessary client components.
- Do not ship a blog page without 404 handling for missing slugs.
- Do not expose placeholder organization/title/description values in production.
- Do not use this dossier as a general-purpose Tailwind utility pack; keep only CMS-specific pieces.

# Verification

Check all of the following before considering the integration complete:

1. Environment variables are set and non-empty.
2. `wisp.getPosts()` returns published posts in the blog index.
3. `/blog/[slug]` renders a real post from Wisp.
4. Missing or invalid slugs produce a 404 state.
5. Page source or metadata inspection shows post-specific title and description.
6. `/api/og-image?title=Test&brand=Your%20Company` returns an image response.
7. `/rss.xml` returns valid XML with post items.
8. All internal links use the site’s real base path and domain assumptions.
9. No integration code depends on missing template-only components such as `Footer`, `Providers`, or undeclared `config` modules.
10. Production deploy uses the correct `NEXT_PUBLIC_BASE_URL` so canonical/OG/RSS URLs are absolute and correct.
