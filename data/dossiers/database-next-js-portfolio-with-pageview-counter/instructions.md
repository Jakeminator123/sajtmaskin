# When to use

Use this dossier when a Next.js site needs simple per-page pageview counts without a full analytics product. Best fit:

- blogs that show reads per post
- portfolios that show views per project
- content sites with lightweight popularity indicators
- App Router projects already deployed on Vercel or another platform that forwards client IPs

This pattern uses **Upstash Redis** as a hosted counter store and deduplicates by hashed IP for 24 hours per slug.

# How to integrate

## 1) Install and configure

Required env vars:

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Install dependency if not already present:

```bash
npm install @upstash/redis
```

## 2) Add the API route

For **App Router**, create `app/api/pageviews/route.ts`:

```ts
import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

const redis = Redis.fromEnv();

function normalizeSlug(slug: unknown) {
  if (typeof slug !== "string") return null;
  const value = slug.trim();
  return value.length > 0 ? value : null;
}

async function hashIp(ip: string) {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(ip),
  );

  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const slug = normalizeSlug(body?.slug);

  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || "anonymous";
  const hash = await hashIp(ip);

  const dedupeKey = ["pageviews", "dedupe", slug, hash].join(":");
  const countKey = ["pageviews", slug].join(":");

  const isNew = await redis.set(dedupeKey, true, {
    nx: true,
    ex: 60 * 60 * 24,
  });

  if (isNew) {
    await redis.incr(countKey);
  }

  const views = (await redis.get<number>(countKey)) ?? 0;
  return NextResponse.json({ views, deduped: !isNew });
}
```

If the project still uses the Pages Router, the existing `pages/api/incr.ts` pattern can be adapted, but prefer App Router route handlers for new builds.

## 3) Trigger counting on page load

Use a tiny client component in post/project detail pages:

```tsx
"use client";

import { useEffect } from "react";

export function PageviewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    void fetch("/api/pageviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
  }, [slug]);

  return null;
}
```

Render it in the page:

```tsx
import { PageviewTracker } from "@/components/pageview-tracker";

export default function ProjectPage({ params }: { params: { slug: string } }) {
  return (
    <>
      <PageviewTracker slug={params.slug} />
      <article>{/* page content */}</article>
    </>
  );
}
```

## 4) Read counts on the server

Create a shared helper:

```ts
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export async function getPageViews(slug: string) {
  return (await redis.get<number>(`pageviews:${slug}`)) ?? 0;
}
```

Use it in server components:

```tsx
import { getPageViews } from "@/lib/pageviews";

export default async function ProjectMeta({ slug }: { slug: string }) {
  const views = await getPageViews(slug);
  return <p>{views.toLocaleString()} views</p>;
}
```

## 5) Use stable slugs as keys

Good key inputs:

- `post.slug`
- `project.slug`
- canonical pathname-like IDs such as `blog/my-post`

Do **not** use titles, localized labels, or full URLs with domains unless you want separate counters.

# UX rules

- Treat pageviews as **non-critical metadata**; the page must render even if Redis is unavailable.
- Show counts in a subdued way, e.g. near publish date, reading time, or project metadata.
- Prefer formatting such as `1,234 views`.
- If count is unavailable, default to `0` or hide the label instead of blocking rendering.
- Increment once per page load; do not repeatedly poll the increment endpoint.
- Keep dedupe windows coarse, typically 24 hours, to avoid inflated counts from refreshes.

# Avoid

- Do not keep template-specific portfolio layout, branding, custom fonts, or Beam analytics as part of this integration.
- Do not store raw IP addresses in Redis; hash them before using them for dedupe keys.
- Do not trust arbitrary client identifiers for dedupe when server headers are available.
- Do not create counters from unstable values like query strings or page titles.
- Do not fail the whole page if the POST request to increment views fails.
- Do not mix `pages/api` and `app/api` styles in the same new integration unless the scaffold explicitly requires legacy routing.

# Verification

1. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
2. Start the app and open a tracked page.
3. Confirm the browser sends `POST /api/pageviews` with a JSON body like:

```json
{ "slug": "my-project" }
```

4. Verify the response is `200` and includes a numeric `views` field.
5. Refresh the page from the same IP within 24 hours; the count should not increase again.
6. Render the count using `getPageViews(slug)` in a server component and confirm it matches Redis data.
7. Test a page with an invalid or empty slug and confirm the route returns `400`.
8. Temporarily disable Redis credentials and confirm the app still renders non-counter content without crashing.
