# When to use

Use this dossier when the site is a real ecommerce storefront and Medusa is the commerce backend.

Use it for:
- product listing and product detail pages backed by Medusa
- cart creation and persistence
- adding/removing line items
- region-aware pricing and checkout handoff
- connecting a Next.js App Router frontend to an existing Medusa server

Do not use it for:
- simple brochure sites
- one-off Stripe payment buttons without a catalog/cart system
- auth-only integrations

# How to integrate

## 1) Required environment variables

Add these environment variables:

```env
MEDUSA_BACKEND_URL=http://localhost:9000
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_dev_...
```

Notes:
- `MEDUSA_BACKEND_URL` should point to the Medusa server.
- `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` is the Medusa Store API publishable key, safe for storefront usage.
- If the Medusa server is on a different origin, configure CORS correctly in Medusa for your frontend domain.

## 2) Create a reusable server fetch wrapper

Use a single helper so all Store API requests consistently send the publishable key:

```ts
const MEDUSA_BACKEND_URL = process.env.MEDUSA_BACKEND_URL;
const MEDUSA_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY;

export async function medusaFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(new URL(path, MEDUSA_BACKEND_URL).toString(), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-publishable-api-key": MEDUSA_PUBLISHABLE_KEY!,
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Medusa request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}
```

## 3) Fetch products on the server

In App Router, fetch products in server components or route handlers:

```ts
import { medusaFetch } from "@/components/lib/medusa";

export default async function ProductsPage() {
  const data = await medusaFetch<{ products: Array<{ id: string; title: string; handle: string }> }>(
    "/store/products"
  );

  return (
    <ul>
      {data.products.map((product) => (
        <li key={product.id}>{product.title}</li>
      ))}
    </ul>
  );
}
```

For product detail pages, query by handle if your route is `/products/[handle]`.

## 4) Create and persist a cart server-side

Medusa storefronts typically persist the active cart id in an HTTP-only cookie.

Example route:

```ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { medusaFetch } from "@/components/lib/medusa";

const CART_COOKIE = "medusa_cart_id";

export async function POST() {
  const cookieStore = await cookies();
  const existing = cookieStore.get(CART_COOKIE)?.value;

  if (existing) {
    return NextResponse.json({ cartId: existing });
  }

  const data = await medusaFetch<{ cart: { id: string } }>("/store/carts", {
    method: "POST",
    body: JSON.stringify({}),
  });

  cookieStore.set(CART_COOKIE, data.cart.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  return NextResponse.json({ cartId: data.cart.id });
}
```

## 5) Add items to the cart via a server route

Do not call Medusa cart mutation endpoints directly from random client components. Centralize them in route handlers.

```ts
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { medusaFetch } from "@/components/lib/medusa";

export async function POST(request: NextRequest) {
  const cartId = (await cookies()).get("medusa_cart_id")?.value;
  if (!cartId) {
    return NextResponse.json({ error: "Missing cart" }, { status: 400 });
  }

  const { variant_id, quantity } = await request.json();

  const data = await medusaFetch(`/store/carts/${cartId}/line-items`, {
    method: "POST",
    body: JSON.stringify({ variant_id, quantity }),
  });

  return NextResponse.json(data);
}
```

Client usage:

```ts
await fetch("/api/cart/items", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ variant_id, quantity: 1 }),
});
```

## 6) Handle regions before checkout

Medusa pricing and checkout are region-aware. Ensure the cart has the correct region and shipping context before showing final totals.

Typical pattern:
- resolve region from locale, market, or country
- create/update cart with that region
- then fetch totals and available shipping options

If the store supports multiple regions, do not hardcode a single currency in UI.

## 7) Checkout handoff

The exact final payment flow depends on Medusa modules configured on the backend, often including Stripe.

Frontend responsibilities:
- keep an up-to-date cart id
- collect shipping/billing details through your own forms or Medusa-driven flow
- call your server routes to update cart/customer/shipping/payment session state
- redirect or render the payment step based on your Medusa backend setup

Treat Medusa as the source of truth for totals, taxes, shipping methods, and payment-session state.

# UX rules

- Always show price, currency, and totals from Medusa responses; do not compute catalog totals purely in the client.
- Require variant selection before enabling “Add to cart” when a product has multiple variants.
- Persist cart state across refreshes using an HTTP-only cookie, not localStorage alone.
- On add-to-cart success, give immediate feedback and update mini-cart/cart count.
- If a selected variant becomes unavailable, disable purchase actions and show a clear stock message.
- For multi-region stores, make region/currency explicit in the UI.
- Keep checkout mutations on the server whenever possible.

# Avoid

- Do not use the extracted middleware files in this dossier; they are unrelated examples from other templates.
- Do not treat Medusa as only a payment provider; it is the commerce backend managing products, variants, carts, regions, and order state.
- Do not hardcode prices, currencies, shipping costs, or tax calculations in frontend components.
- Do not store sensitive cart mutation logic in client-only code if a route handler can own it.
- Do not assume Stripe-specific fields unless the Medusa backend is explicitly configured for Stripe.
- Do not fetch Store API data without sending the publishable API key.

# Verification

Verify the integration with this checklist:

1. Environment
- `MEDUSA_BACKEND_URL` resolves from the Next.js app runtime.
- `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` is present.
- Medusa CORS allows requests from the frontend origin.

2. Product data
- `/store/products` returns products from the configured backend.
- Product detail pages resolve the expected product by handle/id.

3. Cart lifecycle
- `POST /api/cart` creates a cart once and sets `medusa_cart_id`.
- Repeating the request reuses the existing cart cookie.
- `POST /api/cart/items` successfully adds a variant to the cart.

4. UI behavior
- Cart count/totals update after add-to-cart.
- Variant-required products cannot be added without a valid variant.
- Prices render in the currency returned by Medusa.

5. Checkout readiness
- Region is set correctly before checkout.
- Shipping/payment steps use backend-derived cart state.
- Final totals shown in UI match Medusa totals.
