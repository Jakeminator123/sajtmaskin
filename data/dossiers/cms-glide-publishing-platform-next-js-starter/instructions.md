# When to use

Use GlideCMS when the site's pages, article content, media, and SEO fields are managed in Glide Publishing Platform and need to be rendered by Next.js. This is a good fit for content-heavy sites such as blogs, editorial sites, marketing sites with CMS-managed pages, and portfolios.

# How to integrate

## 1) Add required environment variables

```env
CONNECT_API_URL=https://your-glide-api.example.com
CONNECT_API_KEY=your-api-key
MEDIA_BASE_PATH=https://your-media-origin.example.com/
ENVIRONMENT=prod
PREGENERATE_PATHS=false
```

Required:
- `CONNECT_API_URL`: base URL for Glide content API requests
- `CONNECT_API_KEY`: API key/token used when fetching content
- `MEDIA_BASE_PATH`: base URL for media assets returned by Glide

Optional:
- `ENVIRONMENT`: set to `prod` in production; non-prod values trigger `x-robots-tag: noindex` in middleware
- `PREGENERATE_PATHS`: set to `true` only if you want to prebuild known CMS routes at build time

## 2) Keep the middleware

The middleware adds `x-robots-tag: noindex` for non-production environments and can optionally noindex selected paths via `NOINDEX_LIST`.

```ts
import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const basePath = req.nextUrl.basePath;
  const response = NextResponse.next();

  if (process.env.ENVIRONMENT !== "prod") {
    response.headers.set("x-robots-tag", "noindex");
  } else if (process.env.NOINDEX_LIST) {
    const noIndexArray = JSON.parse(process.env.NOINDEX_LIST);
    const addNoIndex = noIndexArray.some((t: string) => new RegExp(t).test(basePath));
    if (addNoIndex) {
      response.headers.set("x-robots-tag", "noindex");
    }
  }

  return response;
}
```

If you use `NOINDEX_LIST`, store it as a JSON array string, for example:

```env
NOINDEX_LIST=["^/preview","^/staging-only"]
```

## 3) Centralize Glide API access

Create a small server-only helper for content and media resolution.

```ts
const CONNECT_API_URL = process.env.CONNECT_API_URL;
const CONNECT_API_KEY = process.env.CONNECT_API_KEY;
const MEDIA_BASE_PATH = process.env.MEDIA_BASE_PATH;

function requireEnv(name: string, value: string | undefined) {
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const glideConfig = {
  apiUrl: requireEnv("CONNECT_API_URL", CONNECT_API_URL),
  apiKey: requireEnv("CONNECT_API_KEY", CONNECT_API_KEY),
  mediaBasePath: requireEnv("MEDIA_BASE_PATH", MEDIA_BASE_PATH),
};

export async function glideFetch<T>(path: string): Promise<T> {
  const res = await fetch(new URL(path, glideConfig.apiUrl), {
    headers: {
      Authorization: `Bearer ${glideConfig.apiKey}`,
      "Content-Type": "application/json",
    },
    next: { revalidate: 60 },
  });

  if (!res.ok) throw new Error(`Glide API request failed: ${res.status}`);
  return res.json();
}
```

Do not expose `CONNECT_API_KEY` to client components. Fetch Glide content on the server.

## 4) Map CMS routes to a catch-all page

Use an App Router catch-all route to resolve page content by path.

```tsx
import { notFound } from "next/navigation";
import { glideFetch } from "@/components/lib/glide";

async function getPage(slug: string[]) {
  const path = `/${slug.join("/")}`;
  return glideFetch(`/pages?path=${encodeURIComponent(path)}`);
}

export default async function Page({ params }: { params: { slug: string[] } }) {
  const page = await getPage(params.slug);
  if (!page) notFound();

  return (
    <main>
      <h1>{page.title}</h1>
      <article dangerouslySetInnerHTML={{ __html: page.html }} />
    </main>
  );
}
```

Also map SEO fields into `generateMetadata`:

```tsx
export async function generateMetadata({ params }: { params: { slug: string[] } }) {
  const page = await getPage(params.slug);

  return {
    title: page?.seo?.title || page?.title,
    description: page?.seo?.description,
  };
}
```

## 5) Optionally pre-generate known CMS paths

If Glide exposes a route list and `PREGENERATE_PATHS=true`, use `generateStaticParams`.

```ts
import { glideConfig, glideFetch } from "@/components/lib/glide";

export async function generateStaticParams() {
  if (!glideConfig.pregeneratePaths) return [];

  const paths = await glideFetch<string[]>("/paths");
  return paths
    .filter((path) => path && path !== "/")
    .map((path) => ({ slug: path.replace(/^\//, "").split("/") }));
}
```

If your Glide API does not expose `/pages` or `/paths` with exactly these shapes, adapt the helper and route mapping to the real response format. The important pattern is: resolve by pathname on the server, map CMS SEO fields to Next metadata, and keep all secrets server-side.

## 6) Resolve media URLs from Glide data

Use `MEDIA_BASE_PATH` to normalize relative asset paths.

```ts
export function resolveGlideMediaUrl(path: string) {
  if (!path) return path;
  if (/^https?:\/\//.test(path)) return path;
  return new URL(path.replace(/^\//, ""), process.env.MEDIA_BASE_PATH).toString();
}
```

# UX rules

- Preserve editor-managed page paths; do not invent alternative frontend URLs unless there is a strong product requirement.
- Render CMS SEO title/description when present.
- Show a real 404 for missing CMS pages.
- Prefer server rendering or ISR for published content; avoid client-only fetching for primary page content.
- For rich HTML content, sanitize upstream or trust only CMS-authored HTML from known sources.
- Use stable loading and empty states if fetching related content blocks or listings.

# Avoid

- Do not expose `CONNECT_API_KEY` in the browser.
- Do not hardcode media origins; always derive them from `MEDIA_BASE_PATH`.
- Do not index staging, preview, or non-production environments.
- Do not keep Bootstrap/demo template UI just because it came from the starter; only keep CMS integration logic.
- Do not assume the middleware's `basePath` check matches pathname-based noindex rules in every app; verify the patterns against your actual routing.

# Verification

1. Start the app with valid Glide env vars.
2. Request a known CMS-managed URL and confirm the page renders server-side.
3. Confirm `generateMetadata` outputs the expected title and description from CMS fields.
4. In non-prod (`ENVIRONMENT!=prod`), verify the response includes:

```http
x-robots-tag: noindex
```

5. If using `NOINDEX_LIST`, verify matching paths receive `x-robots-tag: noindex` in production.
6. Confirm media assets with relative paths resolve correctly against `MEDIA_BASE_PATH`.
7. If `PREGENERATE_PATHS=true`, run a production build and verify known CMS routes are pre-generated without build errors.
8. Confirm missing CMS paths return a 404, not a blank page or 200 response.
