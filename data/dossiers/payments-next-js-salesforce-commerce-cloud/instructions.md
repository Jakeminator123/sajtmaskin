# When to use

Use this dossier when the site is a Next.js storefront or commerce experience backed by Salesforce Commerce Cloud (SFCC), and you need server-rendered catalog data, caching, and revalidation patterns.

Use it for:
- product listing and product detail pages
- category navigation and search
- cart and checkout handoff
- admin-triggered cache invalidation after catalog updates

Do **not** use it as a drop-in payment-only integration. SFCC is the commerce backend, not just a checkout button.

# How to integrate

## 1) Add environment variables

Use SFCC variables instead of the Shopify variables found in the draft template.

```env
SFCC_SHORT_CODE="your-short-code"
SFCC_ORGANIZATION_ID="your-org-id"
SFCC_SITE_ID="your-site-id"
SFCC_CLIENT_ID="your-client-id"
SFCC_CLIENT_SECRET="your-client-secret"
SFCC_SLAS_PRIVATE_CLIENT_ID="your-slas-private-client-id"
SFCC_SLAS_PRIVATE_CLIENT_SECRET="your-slas-private-client-secret"
NEXT_PUBLIC_SITE_URL="https://example.com"
REVALIDATION_SECRET="long-random-secret"
```

Minimum required vars for basic server reads:
- `SFCC_SHORT_CODE`
- `SFCC_ORGANIZATION_ID`
- `SFCC_SITE_ID`
- `SFCC_CLIENT_ID`

Add secret-bearing vars only when implementing authenticated Shopper flows, carts, customers, or SLAS token exchange.

## 2) Centralize SFCC config

Use a dedicated config module and fail fast when required vars are missing.

```ts
// lib/sfcc/config.ts
export const sfccConfig = {
  shortCode: process.env.SFCC_SHORT_CODE ?? "",
  organizationId: process.env.SFCC_ORGANIZATION_ID ?? "",
  siteId: process.env.SFCC_SITE_ID ?? "",
  clientId: process.env.SFCC_CLIENT_ID ?? "",
};

export function validateSfccEnv() {
  const required = [
    "SFCC_SHORT_CODE",
    "SFCC_ORGANIZATION_ID",
    "SFCC_SITE_ID",
    "SFCC_CLIENT_ID",
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing SFCC env vars:\n${missing.join("\n")}`);
  }
}
```

## 3) Create a reusable SFCC fetcher

Wrap all API traffic so auth, error handling, cache tags, and URL construction stay consistent.

```ts
// lib/sfcc/client.ts
export async function sfccFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const url = `https://${process.env.SFCC_SHORT_CODE}.api.commercecloud.salesforce.com${path}`;

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: options.cache,
    next: options.next,
  });

  if (!response.ok) {
    throw new Error(`SFCC request failed: ${response.status}`);
  }

  return response.json();
}
```

## 4) Fetch catalog data on the server

Use Next.js server components or server utilities to fetch product/category/search data. Tag requests so you can revalidate them later.

```ts
import { sfccFetch } from "@/components/lib/sfcc/client";

export async function getCategory(categoryId: string) {
  return sfccFetch(
    `/shopper/products/v1/organizations/${process.env.SFCC_ORGANIZATION_ID}/categories/${categoryId}?siteId=${process.env.SFCC_SITE_ID}`,
    {
      next: { tags: ["categories"] },
    },
  );
}

export async function searchProducts(query: string) {
  const params = new URLSearchParams({
    siteId: process.env.SFCC_SITE_ID!,
    q: query,
  });

  return sfccFetch(
    `/shopper/search/v1/organizations/${process.env.SFCC_ORGANIZATION_ID}/product-search?${params.toString()}`,
    {
      next: { tags: ["products", "search"] },
    },
  );
}
```

## 5) Add authenticated revalidation

Catalog data changes outside the Next.js app. Add a protected route that revalidates cache tags.

```ts
// app/api/revalidate/route.ts
import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const secret = process.env.REVALIDATION_SECRET;
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.replace("Bearer ", "");

  if (!secret || bearer !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const tags = body.tags ?? ["products", "categories"];

  for (const tag of tags) revalidateTag(tag);

  return NextResponse.json({ ok: true, tags });
}
```

Trigger it from your CMS, middleware, admin integration, or deployment hook:

```bash
curl -X POST https://your-site.com/api/revalidate \
  -H "Authorization: Bearer $REVALIDATION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"tags":["products","categories"]}'
```

## 6) Keep cart/auth logic separate from catalog reads

For carts, customer auth, and checkout-related operations, use dedicated server actions or route handlers. Do not mix anonymous catalog reads with customer session mutation code.

Suggested split:
- `lib/sfcc/catalog.ts` for products/categories/search
- `lib/sfcc/cart.ts` for cart CRUD
- `lib/sfcc/auth.ts` for SLAS token exchange
- `app/api/revalidate/route.ts` for cache invalidation only

# UX rules

- Prefer server-rendered product and category pages for SEO and fast first load.
- Use loading states for search, cart mutations, and availability checks.
- Show clear out-of-stock and unavailable-variant states.
- Preserve selected variant, quantity, and filters in URL or client state.
- Never expose client secrets, SLAS private credentials, or admin tokens in client components.
- If checkout happens on SFCC-hosted pages, make the transition explicit with a button label like `Checkout securely`.
- Revalidate product/category pages after catalog updates; do not rely on long stale caches for price or inventory-sensitive UI.

# Avoid

- Do not keep Shopify env vars, naming, endpoints, or error helpers in an SFCC dossier.
- Do not import template-only UI like demo navbars, welcome toasts, cart contexts, or branded themes unless those files are actually part of the integration.
- Do not hardcode API versions or endpoint paths copied from another provider.
- Do not call SFCC directly from the browser for privileged operations.
- Do not implement revalidation without authentication.
- Do not treat SFCC as “payments only”; model it as the source of commerce data and checkout flows.

# Verification

- Confirm the app boots with `validateSfccEnv()` enabled and no missing env errors.
- Confirm a server-side SFCC catalog request returns data successfully.
- Confirm product/category requests are tagged and cached via Next.js `next.tags`.
- Confirm `POST /api/revalidate` rejects missing or invalid bearer tokens with `401`.
- Confirm `POST /api/revalidate` with a valid token returns `{ ok: true }` and revalidates expected tags.
- Confirm no remaining `SHOPIFY_*` strings, Shopify endpoints, or Shopify-specific helpers exist in the integrated codebase.
- Confirm no secret SFCC credentials are imported into client components or exposed via `NEXT_PUBLIC_*` unless intentionally public.
