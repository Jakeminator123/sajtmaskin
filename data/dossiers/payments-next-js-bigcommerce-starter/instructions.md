# When to use

Use this dossier for a **headless ecommerce storefront in Next.js App Router backed by BigCommerce**.

Choose it when you need:
- BigCommerce as the catalog/cart/checkout backend
- Next.js routes that resolve human-friendly product URLs
- webhook or admin-triggered cache invalidation
- consistent BigCommerce sort and cache tag constants across server components and API routes

Do **not** use this dossier for a simple marketing site, Stripe-only checkout, or a hosted BigCommerce theme.

# How to integrate

## 1) Add required environment variables

Use these BigCommerce values:

```env
BIGCOMMERCE_CANONICAL_STORE_DOMAIN="store.example.com"
BIGCOMMERCE_API_URL="https://api.bigcommerce.com"
BIGCOMMERCE_CDN_HOSTNAME="cdn11.bigcommerce.com"
BIGCOMMERCE_STORE_HASH="xxxxx"
BIGCOMMERCE_CHANNEL_ID="1"
BIGCOMMERCE_ACCESS_TOKEN="..."
BIGCOMMERCE_CUSTOMER_IMPERSONATION_TOKEN="..."
```

Optional but recommended for secure on-demand revalidation:

```env
BIGCOMMERCE_REVALIDATION_SECRET="replace-with-long-random-string"
```

Also set your storefront metadata separately if your app needs it:

```env
SITE_NAME="My Store"
COMPANY_NAME="My Company"
TWITTER_CREATOR="@mybrand"
TWITTER_SITE="https://example.com"
```

## 2) Keep the middleware for product-path rewrites

This middleware lets your storefront accept CMS- or catalog-style paths and rewrite them to internal routes.

```ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getProductIdBySlug } from 'lib/bigcommerce';

export async function middleware(request: NextRequest) {
  const pageNode = await getProductIdBySlug(request.nextUrl.pathname);

  if (pageNode?.__typename === 'Product') {
    return NextResponse.rewrite(new URL(`/product/${pageNode.entityId}`, request.url));
  }
}
```

Your app should implement a matching route such as:

```tsx
// app/product/[id]/page.tsx
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // fetch product by BigCommerce entityId and render PDP
  return <div>Product {id}</div>;
}
```

If you also support category or brand path resolution, extend `getProductIdBySlug()` and rewrite accordingly.

## 3) Wire a real BigCommerce client

The dossier includes a generic `lib/bigcommerce.ts` placeholder. Replace the slug lookup and API calls with your actual BigCommerce Storefront GraphQL or REST logic.

Typical server helper shape:

```ts
export async function getProductIdBySlug(pathname: string) {
  const normalized = pathname.replace(/^\//, '').replace(/\/$/, '');
  if (!normalized) return null;

  // Query BigCommerce route/node resolution here.
  // Return `{ __typename: 'Product', entityId: number }` when matched.
  return null;
}
```

For authenticated admin-side calls, use the store hash and access token:

```ts
const response = await fetch(
  `${process.env.BIGCOMMERCE_API_URL}/stores/${process.env.BIGCOMMERCE_STORE_HASH}/v3/catalog/products`,
  {
    headers: {
      'X-Auth-Token': process.env.BIGCOMMERCE_ACCESS_TOKEN!,
      Accept: 'application/json'
    },
    cache: 'no-store'
  }
);
```

## 4) Use the revalidation route for catalog freshness

Keep this endpoint:

```ts
import { revalidate } from 'lib/bigcommerce';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: NextRequest): Promise<NextResponse> {
  return revalidate(req);
}
```

At minimum, validate a shared secret before revalidating. If your app uses Next cache tags, trigger tag invalidation for product, collection, and cart data.

Example shape inside `revalidate()`:

```ts
import { revalidateTag } from 'next/cache';

revalidateTag('products');
revalidateTag('collections');
```

If BigCommerce sends webhooks, point them at `/api/revalidate` and include your secret.

## 5) Use the shared constants for sorting and caching

`components/lib/constants.ts` is worth keeping because it normalizes storefront sorting options.

Example usage in a product-grid loader:

```ts
import { sorting, vercelToBigCommerceSortKeys } from 'lib/constants';

function mapSort(sortKey: keyof typeof vercelToBigCommerceSortKeys, reverse: boolean) {
  if (sortKey === 'PRICE' && reverse) return vercelToBigCommerceSortKeys.PRICE_ON_REVERSE;
  return vercelToBigCommerceSortKeys[sortKey];
}
```

Use the cache tag constants consistently:

```ts
import { TAGS } from 'lib/constants';

await fetch(url, {
  next: { tags: [TAGS.products] }
});
```

## 6) Customer auth and checkout

This dossier does **not** include complete customer session handling. If you add account pages or saved carts:
- use `BIGCOMMERCE_CUSTOMER_IMPERSONATION_TOKEN` only in secure server flows
- never expose admin/store tokens to the browser
- send users to BigCommerce checkout or your configured channel checkout URL for payment completion

# UX rules

- Treat BigCommerce as the source of truth for prices, availability, variants, and checkout state.
- Product URLs should be stable and human-readable; internal numeric routes can exist behind rewrites.
- Show clear loading and out-of-stock states on PDP and collection pages.
- If revalidation is delayed, prefer slightly stale catalog pages over broken pages.
- On checkout actions, redirect cleanly to the BigCommerce checkout URL rather than simulating payment locally.

# Avoid

- Do not keep template-specific navbar, theme, or branded layout code as part of the integration dossier.
- Do not expose `BIGCOMMERCE_ACCESS_TOKEN` or customer impersonation tokens in client components.
- Do not assume all storefront routes resolve to products; categories and CMS pages may need separate handling.
- Do not leave `/api/revalidate` unsecured in production.
- Do not hardcode `channel_id=1` unless the store is intentionally using the default storefront channel.

# Verification

1. Start the app with valid BigCommerce env vars.
2. Confirm config validation passes at boot.
3. Request a known product slug and verify middleware rewrites to `/product/[entityId]`.
4. Open a collection page and verify sorting options map correctly to BigCommerce sort semantics.
5. POST to `/api/revalidate` with the correct secret and verify a 200 response.
6. POST without the secret and verify a 401 response.
7. Confirm no server-only BigCommerce secrets appear in the browser bundle or client-exposed env vars.
8. Complete an add-to-cart and handoff to checkout using the configured BigCommerce channel/site checkout flow.
