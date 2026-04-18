# When to use

Use this dossier for a **portfolio, creator site, or personal content site** built with Next.js App Router when you want:

- a simple **password gate** for selected pages without a full auth provider
- an **RSS feed** for blog posts
- a server-side **metadata fetch endpoint** for link previews or OG card generation workflows
- optional adoption of the **Once UI-based global shell pattern** if the project already uses Once UI

Do **not** use this dossier as a general authentication system for multi-user apps.

# How to integrate

## 1) Install required packages

```bash
npm install cookie @once-ui-system/core classnames
```

If you only want the API routes and not the Once UI shell, `@once-ui-system/core` and `classnames` are optional.

## 2) Add the environment variable for the password gate

```env
PAGE_ACCESS_PASSWORD=choose-a-strong-password
```

This value is required only if you use the `/api/authenticate` route.

## 3) Add the password auth endpoints

### `src/app/api/authenticate/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import * as cookie from "cookie";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { password } = body;
  const correctPassword = process.env.PAGE_ACCESS_PASSWORD;

  if (!correctPassword) {
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }

  if (password === correctPassword) {
    const response = NextResponse.json({ success: true }, { status: 200 });

    response.headers.set(
      "Set-Cookie",
      cookie.serialize("authToken", "authenticated", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60,
        sameSite: "strict",
        path: "/",
      }),
    );

    return response;
  }

  return NextResponse.json({ message: "Incorrect password" }, { status: 401 });
}
```

### `src/app/api/check-auth/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import * as cookie from "cookie";

export async function GET(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = cookie.parse(cookieHeader);

  if (cookies.authToken === "authenticated") {
    return NextResponse.json({ authenticated: true }, { status: 200 });
  }

  return NextResponse.json({ authenticated: false }, { status: 401 });
}
```

## 4) Call the password gate from a client form

```tsx
"use client";

import { useState } from "react";

export function PasswordGate() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/authenticate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message ?? "Authentication failed");
      return;
    }

    window.location.reload();
  }

  return (
    <form onSubmit={onSubmit}>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Enter password"
      />
      <button type="submit" disabled={loading}>
        {loading ? "Checking..." : "Continue"}
      </button>
      {error && <p>{error}</p>}
    </form>
  );
}
```

## 5) Protect pages with a server-side cookie check or client-side guard

A simple server component pattern:

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function ProtectedPage() {
  const cookieStore = await cookies();
  const authToken = cookieStore.get("authToken")?.value;

  if (authToken !== "authenticated") {
    redirect("/unlock");
  }

  return <div>Protected content</div>;
}
```

## 6) Add the RSS route only if your site has posts

The template route assumes:

- a `getPosts(...)` helper
- site metadata like `baseURL`, `blog`, and `person`
- post metadata with `title`, `publishedAt`, `summary`, and optional `image`/`tag`

If your project already has a post loader, adapt the route to your own content source.

```ts
import { NextResponse } from "next/server";

type Post = {
  slug: string;
  title: string;
  summary: string;
  publishedAt: string;
};

const baseURL = "https://example.com";

async function getPosts(): Promise<Post[]> {
  return [];
}

export async function GET() {
  const posts = await getPosts();

  const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>My Blog</title>
    <link>${baseURL}/blog</link>
    <description>Latest posts</description>
    ${posts
      .map(
        (post) => `
    <item>
      <title>${post.title}</title>
      <link>${baseURL}/blog/${post.slug}</link>
      <guid>${baseURL}/blog/${post.slug}</guid>
      <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>
      <description><![CDATA[${post.summary}]]></description>
    </item>`,
      )
      .join("")}
  </channel>
</rss>`;

  return new NextResponse(rssXml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
```

## 7) Add the OG metadata fetch route for link previews

Use this route when the browser cannot fetch external metadata directly due to CORS, or when you want a server-controlled fetch.

```ts
import { NextResponse } from "next/server";

export const runtime = "edge";

function decodeHTMLEntities(text: string) {
  return text.replace(/&(#?[a-zA-Z0-9]+);/g, (match, entity) => {
    const entities: Record<string, string> = {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      apos: "'",
      "#x27": "'",
      "#39": "'",
      "#x26": "&",
      "#38": "&",
    };

    if (entity.startsWith("#")) {
      const code = entity.startsWith("#x")
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      return String.fromCharCode(code);
    }

    return entities[entity] || match;
  });
}

async function fetchWithTimeout(url: string, timeout = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "bot" },
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function extractMetadata(html: string) {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const descMatch =
    html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"[^>]*>/i) ||
    html.match(/<meta[^>]*content="([^"]+)"[^>]*name="description"[^>]*>/i) ||
    html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"[^>]*>/i);
  const imageMatch =
    html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"[^>]*>/i) ||
    html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"[^>]*>/i);

  return {
    title: decodeHTMLEntities(titleMatch?.[1]?.trim() || ""),
    description: decodeHTMLEntities(descMatch?.[1]?.trim() || ""),
    image: imageMatch?.[1]?.trim() || "",
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  const response = await fetchWithTimeout(url);
  const html = await response.text();
  const metadata = await extractMetadata(html);

  return NextResponse.json({ ...metadata, url });
}
```

Client usage:

```ts
const res = await fetch(`/api/og/fetch?url=${encodeURIComponent("https://example.com")}`);
const data = await res.json();
```

## 8) Treat the provided layout file as reference only

The included `layout.tsx` is not portable on its own. It depends on template-specific imports such as:

- `@/components`
- `@/resources`
- Once UI design tokens and effect configuration

Only reuse that pattern if your project already adopts the Once UI system and you are prepared to recreate those resources.

# UX rules

- Use the password gate only for **lightweight private access**, not for user accounts or role-based permissions.
- Always show a clear error message for invalid passwords.
- If content is protected, provide a dedicated unlock page instead of a blank redirect loop.
- Expose `/api/rss` only when the site actually has ongoing published content.
- For metadata previews, show graceful fallbacks when title, description, or image is missing.
- Keep portfolio pages fast: avoid blocking page render on OG metadata fetches.

# Avoid

- Do not treat the `authToken=authenticated` cookie as secure application auth for sensitive data.
- Do not ship the password gate without setting `PAGE_ACCESS_PASSWORD` in production.
- Do not reuse the template layout without also recreating its required `resources`, `Providers`, `Header`, `Footer`, and `RouteGuard` modules.
- Do not assume the RSS route works unchanged unless your content model matches the template.
- Do not allow arbitrary external fetches from the OG endpoint without considering rate limiting and SSRF risk.

# Verification

## Password gate

```bash
curl -i -X POST http://localhost:3000/api/authenticate \
  -H 'Content-Type: application/json' \
  -d '{"password":"your-password"}'
```

Expected:

- `200 OK` for the correct password
- `Set-Cookie: authToken=authenticated; ...`

Then:

```bash
curl -i http://localhost:3000/api/check-auth \
  -H 'Cookie: authToken=authenticated'
```

Expected:

- `200 OK`
- body contains `{"authenticated":true}`

## RSS

Open:

```txt
http://localhost:3000/api/rss
```

Expected:

- `Content-Type: application/xml`
- valid RSS XML with one `<item>` per post

## OG metadata fetch

Open:

```txt
http://localhost:3000/api/og/fetch?url=https%3A%2F%2Fexample.com
```

Expected JSON:

```json
{
  "title": "Example Domain",
  "description": "...",
  "image": "",
  "url": "https://example.com"
}
```

## Layout adoption

If you choose to port the Once UI layout pattern, verify:

- global CSS imports resolve
- `generateMetadata()` returns correct site metadata
- header/footer render without missing module errors
- theme initialization does not cause hydration mismatch warnings beyond the intentional suppression on the root element
