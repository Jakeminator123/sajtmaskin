# When to use

Use this dossier when building a Next.js App Router storefront backed by Shopify Storefront API.

It is a good fit for:
- product listing and product detail pages
- collection/category pages
- cart state backed by Shopify
- webhook-driven cache revalidation after product or collection changes

It is not a full checkout implementation. Checkout normally redirects to Shopify checkout unless you add a separate payments layer.

# How to integrate

## 1) Configure environment variables

Required:

```env
SHOPIFY_STORE_DOMAIN="your-store.myshopify.com"
SHOPIFY_STOREFRONT_ACCESS_TOKEN="..."
SHOPIFY_REVALIDATION_SECRET="long-random-secret"
SITE_NAME="Your Store"
COMPANY_NAME="Your Company"
```

Rules:
- `SHOPIFY_STORE_DOMAIN` should be the full Shopify domain without square brackets.
- The Storefront access token must come from Shopify Storefront API settings.
- Use a long random string for `SHOPIFY_REVALIDATION_SECRET` and send it on revalidation requests.

You can validate env at module load or app startup:

```ts
import { validateEnvironmentVariables } from "@/components/lib/utils";

validateEnvironmentVariables();
```

## 2) Add a Shopify fetch helper

Use `components/lib/shopify.ts` as the single place that talks to Shopify. It should:
- build the Storefront GraphQL endpoint from `SHOPIFY_STORE_DOMAIN`
- send `X-Shopify-Storefront-Access-Token`
- attach Next.js cache tags for products / collections / cart data
- expose a `revalidate(req)` helper for the route handler

Basic usage:

```ts
import { shopifyFetch } from "@/components/lib/shopify";
import { TAGS } from "@/components/lib/constants";

const query = `
  query Products($query: String) {
    products(first: 12, query: $query) {
      edges {
        node {
          id
          handle
          title
        }
      }
    }
  }
`;

const data = await shopifyFetch<{
  products: {
    edges: Array<{ node: { id: string; handle: string; title: string } }>;
  };
}>({
  query,
  variables: { query: "tag:featured" },
  tags: [TAGS.products],
});
```

## 3) Keep cache tags consistent

Use the constants from `components/lib/constants.ts`:

```ts
export const TAGS = {
  collections: "collections",
  products: "products",
  cart: "cart",
};
```

Tag fetches by resource type:
- product lists and product details: `TAGS.products`
- collections and category navigation: `TAGS.collections`
- cart queries/mutations: `TAGS.cart`

Example:

```ts
const product = await shopifyFetch({
  query: PRODUCT_QUERY,
  variables: { handle },
  tags: [TAGS.products],
});
```

## 4) Expose the revalidation endpoint

Keep this route:

```ts
import { revalidate } from "@/components/lib/shopify";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest): Promise<NextResponse> {
  return revalidate(req);
}
```

Recommended endpoint:
- `app/api/revalidate/route.ts`

The request should include the secret in the query string:

```txt
POST /api/revalidate?secret=YOUR_SECRET
```

The helper can also inspect `x-shopify-topic` to decide whether cart tags should be invalidated.

## 5) Wire Shopify webhooks to revalidation

In Shopify, create webhooks for events that change storefront data, for example:
- products/create
- products/update
- products/delete
- collections/create
- collections/update
- collections/delete

Point them to your deployed route:

```txt
https://yourdomain.com/api/revalidate?secret=YOUR_SECRET
```

If you use Shopify carts in a server-backed way, also invalidate cart data when relevant.

## 6) Use the shared helpers

`components/lib/utils.ts` includes integration-safe helpers:

```ts
import { baseUrl, createUrl, ensureStartsWith } from "@/components/lib/utils";
```

Typical uses:
- build canonical metadata with `baseUrl`
- preserve filters/sort/search with `createUrl`
- normalize the Shopify domain with `ensureStartsWith`

## 7) Use Shopify sort constants for collection/search UIs

`components/lib/constants.ts` includes predefined sort options aligned to Shopify GraphQL sort keys.

Example:

```ts
import { defaultSort, sorting } from "@/components/lib/constants";

const selected = sorting.find((item) => item.slug === searchParams.sort) ?? defaultSort;
```

Map the selected option into GraphQL variables:

```ts
const variables = {
  sortKey: selected.sortKey,
  reverse: selected.reverse,
};
```

# UX rules

- Always show product prices, availability, and variant selection from Shopify data, not hardcoded content.
- Preserve selected filters and sorting in the URL so collection/search pages are shareable.
- If data is stale-sensitive, prefer tagged fetches plus webhook revalidation instead of disabling caching globally.
- Hide products tagged with the hidden product tag if you implement merchandising rules:

```ts
import { HIDDEN_PRODUCT_TAG } from "@/components/lib/constants";
```

- Treat `Default Title` as a Shopify placeholder option name and avoid showing it as a meaningful variant label.

# Avoid

- Do not keep template-specific layout code such as demo navbars, welcome toasts, branded shells, or sample cart providers unless the user explicitly wants that UI.
- Do not hardcode the Shopify domain or token in source files.
- Do not call Storefront API directly from arbitrary client components; keep tokens on the server.
- Do not use untagged `fetch` for product/collection data if you expect webhook-driven freshness.
- Do not trust webhook calls without checking `SHOPIFY_REVALIDATION_SECRET`.
- Do not leave square brackets in `SHOPIFY_STORE_DOMAIN` copied from placeholder docs.

# Verification

## Environment sanity check

Confirm app startup does not throw env validation errors.

## API connectivity

Run a minimal Storefront query through `shopifyFetch` and confirm you receive product or collection data.

## Revalidation route

Send a test request:

```bash
curl -X POST "http://localhost:3000/api/revalidate?secret=$SHOPIFY_REVALIDATION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"tags":["products","collections"]}'
```

Expected response:

```json
{ "ok": true, "revalidated": ["collections", "products"] }
```

## Webhook flow

After updating a product in Shopify:
- webhook should hit `/api/revalidate`
- product pages and collection pages should reflect changes after revalidation

## URL/sort behavior

Verify that changing sort/filter updates the URL and that the same URL restores the same listing state on reload.
