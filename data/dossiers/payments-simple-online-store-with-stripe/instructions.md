# When to use

Use this dossier when building a Next.js App Router site that needs Stripe Checkout for a small store, single-product purchase flow, or simple fixed-price product catalog.

This dossier is best when:
- you want Stripe-hosted payment handling instead of building your own PCI-sensitive payment form
- products and prices can be defined in code or mapped from your own catalog
- you want an embedded checkout experience inside your app

Use a different Stripe pattern if:
- you need subscriptions instead of one-time payments
- you need a cart with complex shipping/tax/inventory logic
- you need webhook-driven fulfillment as the primary source of truth

# How to integrate

## 1. Install required packages

```bash
npm install stripe @stripe/react-stripe-js @stripe/stripe-js server-only
```

## 2. Add environment variables

```env
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Rules:
- `STRIPE_SECRET_KEY` must only be used on the server
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is safe for the browser
- `NEXT_PUBLIC_SITE_URL` must match your deployed app origin for `return_url`

## 3. Create the server Stripe client

```ts
// lib/stripe.ts
import "server-only";
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
```

Keep this file server-only. Never import it into a client component.

## 4. Define your product catalog

For simple stores, keep a small typed catalog in code:

```ts
// lib/products.ts
export interface Product {
  id: string;
  name: string;
  description: string;
  priceInCents: number;
  images?: string[];
  features?: string[];
}

export const PRODUCTS: Product[] = [
  {
    id: "premium-headphones",
    name: "Premium Wireless Headphones",
    description: "High-quality wireless headphones with noise cancellation.",
    priceInCents: 19999,
    images: ["/premium-wireless-headphones.png"],
  },
];
```

If your app already has products in a database/CMS, replace this with your own source of truth and only pass trusted server-side product data into Stripe.

## 5. Create a server action that starts Checkout

```ts
// app/actions/stripe.ts
"use server";

import { stripe } from "../../lib/stripe";
import { PRODUCTS } from "../../lib/products";

export async function startCheckoutSession(productId: string): Promise<string> {
  const product = PRODUCTS.find((item) => item.id === productId);

  if (!product) {
    throw new Error("Product not found");
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_SITE_URL is required");
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ui_mode: "embedded",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: product.name,
            description: product.description,
            images: product.images,
          },
          unit_amount: product.priceInCents,
        },
        quantity: 1,
      },
    ],
    return_url: `${baseUrl}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    metadata: {
      productId: product.id,
    },
  });

  if (!session.client_secret) {
    throw new Error("Failed to create checkout session");
  }

  return session.client_secret;
}
```

Important pattern:
- accept a stable internal product id
- resolve product details on the server
- never trust client-submitted price, currency, or line item totals

## 6. Mount Embedded Checkout in a client component

```tsx
// components/checkout.tsx
"use client";

import { useCallback } from "react";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { startCheckoutSession } from "../app/actions/stripe";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

export default function Checkout({ productId }: { productId: string }) {
  const fetchClientSecret = useCallback(() => {
    return startCheckoutSession(productId);
  }, [productId]);

  return (
    <EmbeddedCheckoutProvider
      stripe={stripePromise}
      options={{ fetchClientSecret }}
    >
      <EmbeddedCheckout />
    </EmbeddedCheckoutProvider>
  );
}
```

Use this component on a product or checkout page:

```tsx
import Checkout from "@/components/checkout";

export default function ProductPage() {
  return <Checkout productId="premium-headphones" />;
}
```

## 7. Add a return page

Embedded Checkout requires a return destination.

```tsx
// app/checkout/return/page.tsx
import { stripe } from "../../../lib/stripe";

export default async function CheckoutReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;

  if (!sessionId) {
    return <p>Missing checkout session.</p>;
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.status !== "complete") {
    return <p>Your payment has not been completed.</p>;
  }

  return (
    <main>
      <h1>Payment successful</h1>
      <p>Thank you for your order.</p>
    </main>
  );
}
```

For real stores, replace this with your branded confirmation page and fulfillment logic.

# UX rules

- Show the product name, price, and what the user is buying before rendering checkout.
- Do not let the client choose arbitrary prices or quantities unless the server validates them.
- Provide a clear post-payment success state and a way back to the site.
- Keep checkout embedded on a clean page with minimal distractions.
- Handle missing env vars and invalid product ids with user-friendly fallback UI in production.
- If selling physical goods, clearly communicate shipping, taxes, and refund terms before payment.

# Avoid

- Do not import the Stripe secret client into client components.
- Do not create line items directly from untrusted client payloads.
- Do not rely on the return page alone for mission-critical fulfillment in larger systems; use webhooks for durable confirmation.
- Do not keep template-specific analytics, demo layout code, or unrelated UI helpers as part of this integration dossier.
- Do not hardcode production URLs into `return_url`; use an env-driven base URL.

# Verification

1. Add valid Stripe test keys.
2. Start the app and open the page that renders the checkout component.
3. Confirm the embedded Stripe Checkout UI loads without console errors.
4. Complete a payment with a Stripe test card such as:

```text
4242 4242 4242 4242
Any future expiry
Any CVC
Any ZIP/postal code
```

5. Confirm Stripe redirects back to `/checkout/return?session_id=...`.
6. Confirm the return page successfully retrieves the session and shows a success state.
7. Confirm no secret key appears in browser bundles, client logs, or network responses.
8. If adapting this for real order fulfillment, add and test webhooks before going live.
