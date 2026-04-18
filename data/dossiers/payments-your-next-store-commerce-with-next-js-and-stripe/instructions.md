# When to use

Use this dossier when the site is a real ecommerce storefront and product, cart, and checkout state should come from **Your Next Store**. This is appropriate for Next.js apps that need:

- server-side product/catalog reads
- persistent cart state across page loads
- store metadata from the commerce backend
- Stripe-backed checkout handled by Your Next Store

Do **not** use it for a marketing-only landing page with no catalog or cart.

# How to integrate

## 1. Install and configure env vars

Required environment variables:

```bash
YNS_API_KEY=your_api_token_here
NEXT_PUBLIC_YNS_API_TENANT=https://your-tenant.example.com
```

Notes:

- `YNS_API_KEY` is required for all server-side API calls.
- `NEXT_PUBLIC_YNS_API_TENANT` is optional in practice if you can derive public store info from the API, but keep it when the storefront needs a stable tenant/public URL without an extra request.

## 2. Create a shared commerce client

Use a single provider-specific utility for backend access.

```ts
import { Commerce } from "commerce-kit";

export const commerce = Commerce({
  token: process.env.YNS_API_KEY,
});

export const meGetCached = async (token?: string) => {
  "use cache: remote";

  const commerce = Commerce({ token });
  return commerce.meGet();
};
```

Keep this module server-safe. Do not expose the API key to client components.

## 3. Read store metadata from the API

Use `meGetCached()` for store-level branding and metadata such as store name, description, favicon, or public URL.

```ts
export function getStoreFaviconUrl(
  settings: Awaited<ReturnType<typeof commerce.meGet>>["store"]["settings"],
) {
  return (
    settings?.favicon?.imageUrl ??
    (typeof settings?.logo === "string" ? settings.logo : settings?.logo?.imageUrl) ??
    null
  );
}
```

Typical uses:

- page metadata
- SEO / JSON-LD
- header/footer branding
- canonical/public storefront links

## 4. Persist cart state in an HTTP-only cookie

Your Next Store cart IDs should be stored in a secure server cookie, not localStorage.

```ts
import { cookies } from "next/headers";

export const CART_COOKIE = "yns_cart";
export type CartCookieJson = { id: string };

export async function setCartCookie(cartCookieJson: CartCookieJson) {
  (await cookies()).set(CART_COOKIE, JSON.stringify(cartCookieJson), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
}

export async function getCartCookieJson(): Promise<null | CartCookieJson> {
  const raw = (await cookies()).get(CART_COOKIE)?.value;
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || typeof parsed.id !== "string") {
      return null;
    }
    return parsed as CartCookieJson;
  } catch {
    return null;
  }
}
```

Why this matters:

- cart IDs are sensitive session state
- server cookies work cleanly with Server Components and Route Handlers
- invalid cookie data can be ignored safely

## 5. Hydrate the current cart on the server

Before rendering cart UI, load the cart from the cookie and fetch the current cart object from Your Next Store.

```ts
import { commerce } from "@/components/lib/commerce";
import { getCartCookieJson } from "@/components/lib/cookies";

export async function getInitialCart() {
  const cartCookie = await getCartCookieJson();

  if (!cartCookie?.id) {
    return { cart: null, cartId: null };
  }

  try {
    const cart = await commerce.cartGet({ cartId: cartCookie.id });
    return { cart: cart ?? null, cartId: cartCookie.id };
  } catch {
    return { cart: null, cartId: cartCookie.id };
  }
}
```

Use this in:

- root layout wrappers for cart providers
- cart pages
- checkout entry points
- server actions that need to reconcile an existing cart

## 6. Keep all mutating commerce operations on the server

Create server actions or route handlers for cart mutations. Example pattern:

```ts
"use server";

import { commerce } from "@/components/lib/commerce";
import { getCartCookieJson, setCartCookie } from "@/components/lib/cookies";

export async function addToCart(variantId: string, quantity = 1) {
  const existing = await getCartCookieJson();

  const cart = existing?.id
    ? await commerce.cartLinesAdd({
        cartId: existing.id,
        lines: [{ merchandiseId: variantId, quantity }],
      })
    : await commerce.cartCreate({
        lines: [{ merchandiseId: variantId, quantity }],
      });

  if (cart?.id) {
    await setCartCookie({ id: cart.id });
  }

  return cart;
}
```

Exact method names may vary by installed `commerce-kit` version; preserve the pattern:

- read existing cart ID from cookie
- create or update cart on the server
- write back the authoritative cart ID
- return fresh cart data to the UI

## 7. Use tenant/public URL resolution only when needed

If the app needs the public storefront host, derive it from `NEXT_PUBLIC_YNS_API_TENANT` when possible and fall back to the API.

```ts
export const getSubdomainPublicUrl = async () => {
  const tenant = process.env.NEXT_PUBLIC_YNS_API_TENANT;
  if (tenant) {
    const tenantHost = new URL(tenant).host;
    const [subdomain, ...base] = tenantHost.split(".");
    const apiHost = base.join(".");

    if (subdomain && apiHost) {
      return {
        subdomain,
        publicUrl: `https://${apiHost}`,
      };
    }
  }

  const {
    store: { subdomain },
    publicUrl,
  } = await meGetCached(process.env.YNS_API_KEY);

  return { subdomain, publicUrl };
};
```

Use this sparingly for canonical links, metadata, or external store references.

# UX rules

- Treat product, price, inventory, and checkout state as backend-owned data from Your Next Store.
- Cart UI should recover gracefully if the cart cookie exists but the cart no longer does.
- Always render empty-cart fallback states; do not assume a cart exists.
- Do not expose secret API credentials in client bundles.
- Prefer server rendering for catalog/cart data to keep pricing and availability fresh.
- If checkout redirects to Stripe through Your Next Store, make the transition explicit with a clear CTA like **Checkout securely**.
- Show authoritative currency/price values from the commerce response; do not hardcode currency unless the whole store is truly single-currency.

# Avoid

- Do not keep provider-specific logic inside a branded app layout; extract it into reusable libs and server actions.
- Do not store cart IDs in `localStorage` when server cookies are available.
- Do not hardcode `USD`/`en-US` as integration defaults unless the project explicitly requires that market.
- Do not fetch commerce data directly in arbitrary client components with secret tokens.
- Do not assume `NEXT_PUBLIC_YNS_API_TENANT` is always valid; guard URL parsing.
- Do not swallow all API failures in product or checkout flows without showing a user-facing recovery path.

# Verification

Verify the integration with these checks:

## Environment

- `YNS_API_KEY` is present on the server.
- `NEXT_PUBLIC_YNS_API_TENANT` is valid if used.

## API connectivity

- `meGetCached()` returns store data successfully.
- Store name / description / favicon can be read from the response.

## Cart persistence

- Adding an item creates or updates a cart.
- The `yns_cart` cookie is written as HTTP-only.
- Refreshing the page preserves cart state.
- Deleting/invalidating the cart on the backend does not crash the app; the UI falls back to an empty cart.

## Checkout flow

- Cart totals in the UI match the backend response.
- Checkout starts from the authoritative backend cart, not client-computed totals.
- Redirect to Stripe-backed checkout succeeds.

## Production safety

- No secret token appears in browser-executed code.
- All cart/product mutations happen via server actions or route handlers.
- Metadata and branding still render when optional store assets like favicon/logo are missing.
