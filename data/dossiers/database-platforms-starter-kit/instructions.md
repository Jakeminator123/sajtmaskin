# When to use

Use this dossier when the app should serve different tenant experiences from subdomains such as `acme.example.com` and `globex.example.com`, while keeping a shared root domain such as `example.com` for marketing, admin, or signup flows.

This pattern is a good fit for:
- multi-tenant SaaS
- white-label/customer workspaces
- simple tenant lookup backed by Upstash Redis
- App Router projects that need request-time hostname rewriting

Do **not** use it if tenants are identified only by URL path segments like `/org/acme`, or if the app needs relational tenant queries better served by Postgres.

# How to integrate

## 1. Required environment variables

Set these environment variables:

```env
KV_REST_API_URL=
KV_REST_API_TOKEN=
NEXT_PUBLIC_ROOT_DOMAIN=example.com
```

Notes:
- In local development, `NEXT_PUBLIC_ROOT_DOMAIN` is typically `localhost:3000`.
- In production, set it to the apex domain only, for example `example.com`.
- The Redis client expects Upstash REST credentials.

## 2. Add the Redis client

Create a shared Redis client:

```ts
import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN
});
```

Use one shared client module rather than creating a new client per request.

## 3. Add root-domain utilities

Keep the root domain in one place so middleware and URL builders use the same value:

```ts
export const protocol =
  process.env.NODE_ENV === 'production' ? 'https' : 'http';

export const rootDomain =
  process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000';
```

If the app needs to generate tenant URLs, use these helpers instead of hardcoding domains.

## 4. Add middleware for subdomain routing

The middleware is the core of this integration. It should:
- detect the subdomain from the request host
- ignore root-domain traffic
- optionally block root-only routes on tenant subdomains
- rewrite tenant root traffic to an internal route

Use this pattern:

```ts
import { type NextRequest, NextResponse } from 'next/server';
import { rootDomain } from '@/lib/utils';

function extractSubdomain(request: NextRequest): string | null {
  const url = request.url;
  const host = request.headers.get('host') || '';
  const hostname = host.split(':')[0];

  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    const fullUrlMatch = url.match(/http:\/\/([^.]+)\.localhost/);
    if (fullUrlMatch?.[1]) return fullUrlMatch[1];

    if (hostname.includes('.localhost')) {
      return hostname.split('.')[0];
    }

    return null;
  }

  const rootDomainFormatted = rootDomain.split(':')[0];

  if (hostname.includes('---') && hostname.endsWith('.vercel.app')) {
    const parts = hostname.split('---');
    return parts[0] ?? null;
  }

  const isSubdomain =
    hostname !== rootDomainFormatted &&
    hostname !== `www.${rootDomainFormatted}` &&
    hostname.endsWith(`.${rootDomainFormatted}`);

  return isSubdomain ? hostname.replace(`.${rootDomainFormatted}`, '') : null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const subdomain = extractSubdomain(request);

  if (subdomain) {
    if (pathname.startsWith('/admin')) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    if (pathname === '/') {
      return NextResponse.rewrite(new URL(`/s/${subdomain}`, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next|[\\w-]+\\.\\w+).*)']
};
```

Important:
- Rewrite to an internal route such as `/s/[subdomain]`; do not redirect unless the URL should visibly change.
- Keep middleware focused on routing and access rules. Fetch tenant content in route handlers/server components.
- Exclude static assets and Next internals in `matcher`.

## 5. Store tenant records in Redis

This dossier assumes tenant metadata is stored under keys like:

```txt
subdomain:acme
subdomain:globex
```

Example value shape:

```json
{
  "emoji": "🚀",
  "createdAt": 1710000000000
}
```

Example helpers:

```ts
import { redis } from '@/lib/redis';

type SubdomainData = {
  emoji: string;
  createdAt: number;
};

export async function getSubdomainData(subdomain: string) {
  const sanitizedSubdomain = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return redis.get<SubdomainData>(`subdomain:${sanitizedSubdomain}`);
}

export async function getAllSubdomains() {
  const keys = await redis.keys('subdomain:*');
  if (!keys.length) return [];

  const values = await redis.mget<SubdomainData[]>(...keys);

  return keys.map((key, index) => ({
    subdomain: key.replace('subdomain:', ''),
    emoji: values[index]?.emoji || '❓',
    createdAt: values[index]?.createdAt || Date.now()
  }));
}
```

If the app allows creating tenants, always sanitize user-provided subdomains before writing Redis keys.

## 6. Render tenant pages from the rewritten route

The middleware rewrites `tenant.example.com/` to an internal route like `/s/tenant`. The app should therefore implement a route such as:
- `app/s/[subdomain]/page.tsx`

That route should:
- read `params.subdomain`
- load the tenant record with `getSubdomainData`
- return `notFound()` when the tenant does not exist
- render tenant-specific content

Minimal pattern:

```tsx
import { notFound } from 'next/navigation';
import { getSubdomainData } from '@/lib/subdomains';

export default async function TenantPage({
  params
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const tenant = await getSubdomainData(subdomain);

  if (!tenant) notFound();

  return <main>{subdomain}</main>;
}
```

If the app uses the current Next.js params typing style without `Promise`, follow the project’s established convention.

# UX rules

- Root domain and tenant subdomains should feel intentionally different. Reserve root domain routes for marketing, onboarding, and admin.
- Unknown tenants must render a proper 404 or equivalent empty state, not generic app content.
- Tenant switching UI should generate full subdomain URLs consistently from `protocol` and `rootDomain`.
- If creating subdomains from user input, validate allowed characters and normalize to lowercase.
- Avoid exposing root-only admin screens on tenant hosts.

# Avoid

- Do not keep template-specific layout metadata, branding, analytics widgets, or demo landing-page UI as part of the integration.
- Do not hardcode `vercel.app`, `localhost`, or a production domain in components outside the shared utility layer.
- Do not use Redis `KEYS` for large production datasets without understanding the scaling tradeoff; for large tenant counts, maintain an index set instead.
- Do not trust raw hostnames or unsanitized subdomain input when building Redis keys.
- Do not rewrite every path unless the product explicitly wants the entire tenant site under subdomains; many apps should only rewrite selected tenant-facing routes.

# Verification

## Local development

1. Set:

```env
NEXT_PUBLIC_ROOT_DOMAIN=localhost:3000
```

2. Start the app.
3. Visit:
- `http://localhost:3000/` for root-domain behavior
- `http://acme.localhost:3000/` for tenant behavior

Expected result:
- root domain is served normally
- tenant subdomain `/` is internally rewritten to `/s/acme`
- `/admin` on `acme.localhost:3000` is redirected away

## Data verification

Seed a tenant record in Redis:

```ts
await redis.set('subdomain:acme', {
  emoji: '🚀',
  createdAt: Date.now()
});
```

Then confirm `getSubdomainData('acme')` returns the record.

## Production verification

- Deploy with wildcard subdomain support configured for the domain.
- Set `NEXT_PUBLIC_ROOT_DOMAIN` to the production apex domain.
- Verify requests to `tenant.example.com` resolve to the same deployment.
- Verify preview deployment hostnames still extract the tenant slug when using Vercel preview URL patterns.

## Failure cases to test

- unknown subdomain
- uppercase or invalid characters in tenant input
- root-domain admin route
- tenant-domain admin route
- asset paths and `/_next/*` paths bypassing middleware rewrites
