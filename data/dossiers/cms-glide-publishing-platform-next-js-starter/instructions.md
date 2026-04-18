# When to use

Use this dossier when a Next.js App Router site should treat Glide Publishing Platform as the source of truth for page content, SEO metadata, and media assets.

Good fits:
- marketing or editorial sites managed in Glide
- content sites where routes come from the CMS
- sites that need optional pre-rendering of known CMS paths

Do not use it for:
- apps that only need a headless blog feed
- projects that already have a different routing/content model
- client-side-only CMS fetching

# How to integrate

## 1) Install and configure environment variables

Required env vars:

```env
CONNECT_API_URL=https://your-glide-api.example.com
CONNECT_API_KEY=your-api-key
MEDIA_BASE_PATH=https://your-media-origin.example.com
```

Optional env vars:

```env
ENVIRONMENT=prod
PREGENERATE_PATHS=true
NOINDEX_LIST=["^/preview","^/staging"]
```

Notes:
- `CONNECT_API_URL` should be the base URL for Glide content APIs.
- `CONNECT_API_KEY` is sent as a bearer token on every request.
- `MEDIA_BASE_PATH` is used to turn relative media paths into absolute URLs.
- `ENVIRONMENT !== "prod"` causes middleware to add `x-robots-tag: noindex`.
- `PREGENERATE_PATHS=true` enables static path generation from `/paths`.
- `NOINDEX_LIST` is optional JSON containing regex strings for paths that should be noindexed.

## 2) Add the Glide server helper

Create a server-only helper for config, fetching, and media URL resolution:

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
  environment: process.env.ENVIRONMENT || "prod",
  pregeneratePaths: process.env.PREGENERATE_PATHS === "true",
};

export async function glideFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = new URL(path, glideConfig.apiUrl).toString();

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${glideConfig.apiKey}`,
      ...(init?.headers || {}),
    },
    next: init?.cache ? undefined : { revalidate: 60 },
  });

  if (!res.ok) {
    throw new Error(`Glide API request failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export function resolveGlideMediaUrl(path: string) {
  if (!path) return path;
  if (/^https?:\/\//.test(path)) return path;

  const base = glideConfig.mediaBasePath.endsWith("/")
    ? glideConfig.mediaBasePath
    : `${glideConfig.mediaBasePath}/`;

  return new URL(path.replace(/^\//, ""), base).toString();
}
```

Rules:
- Keep this helper on the server only.
- Do not expose `CONNECT_API_KEY` to client components.
- Use absolute media URLs before passing images into `next/image` or metadata.

## 3) Add a root page and catch-all route

Glide-managed sites usually need both `/` and nested CMS routes.

Example root route:

```tsx
import { notFound } from "next/navigation";
import { glideFetch } from "@/components/lib/glide";

type GlidePage = {
  title?: string;
  html?: string;
  seo?: {
    title?: string;
    description?: string;
  };
};

async function getHomePage() {
  return glideFetch<GlidePage | null>(`/pages?path=${encodeURIComponent("/")}`);
}

export async function generateMetadata() {
  const page = await getHomePage();
  if (!page) return {};

  return {
    title: page.seo?.title || page.title,
    description: page.seo?.description,
  };
}

export default async function HomePage() {
  const page = await getHomePage();
  if (!page) notFound();

  return (
    <main>
      {page.title ? <h1>{page.title}</h1> : null}
      {page.html ? <article dangerouslySetInnerHTML={{ __html: page.html }} /> : null}
    </main>
  );
}
```

Example catch-all route:

```tsx
import { notFound } from "next/navigation";
import { glideFetch } from "@/components/lib/glide";

type GlidePage = {
  title?: string;
  html?: string;
  seo?: {
    title?: string;
    description?: string;
  };
};

async function getPage(slug: string[]) {
  const path = `/${slug.join("/")}`;
  return glideFetch<GlidePage | null>(`/pages?path=${encodeURIComponent(path)}`);
}

export async function generateMetadata({ params }: { params: { slug: string[] } }) {
  const page = await getPage(params.slug);
  if (!page) return {};

  return {
    title: page.seo?.title || page.title,
    description: page.seo?.description,
  };
}

export default async function CatchAllPage({ params }: { params: { slug: string[] } }) {
  const page = await getPage(params.slug);

  if (!page) notFound();

  return (
    <main>
      {page.title ? <h1>{page.title}</h1> : null}
      {page.html ? <article dangerouslySetInnerHTML={{ __html: page.html }} /> : null}
    </main>
  );
}
```

## 4) Optionally pregenerate known CMS paths

If Glide exposes a `/paths` endpoint and you want static generation for known routes, add:

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

This should live next to the catch-all route.

## 5) Add middleware for noindex rules

Use middleware to prevent accidental indexing of non-production environments or selected routes:

```ts
import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const response = NextResponse.next();

  if (process.env.ENVIRONMENT !== "prod") {
    response.headers.set("x-robots-tag", "noindex");
    return response;
  }

  if (process.env.NOINDEX_LIST) {
    const patterns: string[] = JSON.parse(process.env.NOINDEX_LIST);
    const addNoIndex = patterns.some((pattern) => new RegExp(pattern).test(pathname));

    if (addNoIndex) {
      response.headers.set("x-robots-tag", "noindex");
    }
  }

  return response;
}
```

Important:
- Match against `req.nextUrl.pathname`, not `basePath`, when evaluating the current request path.
- Keep `NOINDEX_LIST` JSON-valid.
- Use anchored regexes like `^/preview` to avoid overmatching.

## 6) Render media safely

If Glide page JSON includes relative asset paths, resolve them before rendering:

```ts
import { resolveGlideMediaUrl } from "@/components/lib/glide";

const imageUrl = resolveGlideMediaUrl(page.heroImagePath);
```

Use this for:
- image components
- Open Graph image URLs
- canonical asset links

# UX rules

- CMS pages should return `notFound()` when Glide has no matching page.
- Use CMS-provided SEO title/description when available; fall back to page title.
- Keep loading and error states minimal on server-rendered routes; this integration is primarily server-side.
- If rendering raw HTML from Glide, wrap it in a predictable content container so global prose styles can apply.
- Prefer server rendering for CMS content so metadata and page content are available to crawlers.

# Avoid

- Do not expose `CONNECT_API_KEY` through client components, route handlers returning config, or public env vars.
- Do not rely on the catch-all route alone for `/`; add a dedicated `app/page.tsx`.
- Do not use `req.nextUrl.basePath` to decide per-page noindex behavior; use `pathname`.
- Do not assume all media URLs are absolute.
- Do not blindly trust arbitrary HTML unless Glide content is already sanitized by your publishing pipeline.
- Do not make Glide fetches `cache: "no-store"` unless you explicitly need fully dynamic rendering.

# Verification

1. Start the app with valid Glide env vars.
2. Request `/` and confirm the homepage is fetched from Glide.
3. Request a known CMS path like `/about` and confirm content renders.
4. Request an unknown CMS path and confirm Next.js returns 404.
5. Confirm page `<title>` and description use `page.seo` values when present.
6. If `PREGENERATE_PATHS=true`, run a build and confirm `/paths` is queried during static generation.
7. In a non-prod environment, confirm responses include `x-robots-tag: noindex`.
8. If `NOINDEX_LIST` is set, confirm matching paths receive `x-robots-tag: noindex` in prod.
9. Confirm relative media paths become absolute URLs via `resolveGlideMediaUrl`.
10. Verify Glide API failures surface as server errors rather than silently rendering empty pages.
