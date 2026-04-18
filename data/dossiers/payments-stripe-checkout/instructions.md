# When to use

Use this dossier when the user wants:
- Stripe payments via a hosted checkout page
- one-time purchases (`mode: "payment"`)
- recurring subscriptions (`mode: "subscription"`)
- upgrade flows, paywalls, plan purchases, or simple ecommerce checkout

Use it when you want the fastest reliable payment flow and do **not** need a custom on-site card form.

Do **not** use this dossier for:
- Stripe Elements / embedded card forms
- invoices-first billing flows
- marketplace / Connect payouts
- production-grade subscription lifecycle handling without adding webhooks

# How to integrate

## 1) Install dependencies

```bash
npm install stripe @stripe/stripe-js
```

## 2) Add environment variables

```env
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Rules:
- `STRIPE_SECRET_KEY` is server-only
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is safe for the browser
- `NEXT_PUBLIC_SITE_URL` must be the public app origin used for redirects

## 3) Add the server Stripe client

Create `components/lib/stripe.ts`:

```ts
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-01-27.acacia",
});
```

Use this shared instance from server routes instead of creating new clients in multiple files.

## 4) Add the Checkout Session API route

Create an API route at `app/api/checkout-session/route.ts` or adapt the dossier file to your app router structure:

```ts
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/components/lib/stripe";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL!;

export async function POST(request: NextRequest) {
  try {
    const { priceId, mode } = (await request.json()) as {
      priceId: string;
      mode: "payment" | "subscription";
    };

    if (!priceId) {
      return NextResponse.json({ error: "Missing priceId" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${SITE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/cancel`,
    });

    return NextResponse.json({ sessionId: session.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

Important:
- The route should accept a **Stripe Price ID**, not a raw amount
- Validate allowed `priceId` values in production instead of trusting arbitrary client input
- Keep this route server-only

## 5) Add the client checkout button

Create `components/checkout-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export interface CheckoutButtonProps {
  priceId: string;
  label?: string;
  mode?: "payment" | "subscription";
  className?: string;
}

export function CheckoutButton({
  priceId,
  label = "Buy now",
  mode = "payment",
  className,
}: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, mode }),
      });

      if (!response.ok) {
        throw new Error(`Checkout session failed (${response.status})`);
      }

      const { sessionId } = (await response.json()) as { sessionId: string };
      const stripe = await stripePromise;

      if (!stripe) throw new Error("Stripe failed to initialize");

      const result = await stripe.redirectToCheckout({ sessionId });
      if (result.error) throw new Error(result.error.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <button type="button" onClick={handleClick} disabled={loading}>
        {loading ? "Loading..." : label}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
```

## 6) Use the button in pricing or product UI

```tsx
import { CheckoutButton } from "@/components/checkout-button";

export function PricingCard() {
  return (
    <CheckoutButton
      priceId="price_1234567890"
      mode="subscription"
      label="Start subscription"
    />
  );
}
```

For one-time payment:

```tsx
<CheckoutButton
  priceId="price_1234567890"
  mode="payment"
  label="Buy now"
/>
```

## 7) Add your own success and cancel routes

This dossier intentionally does not keep template success/cancel pages. Create app-specific routes such as:
- `app/success/page.tsx`
- `app/cancel/page.tsx`

Keep them simple unless the product needs post-checkout fulfillment or entitlement messaging.

## 8) Recommended production hardening

For real apps, also add:
- server-side mapping of plan keys to Stripe Price IDs
- webhook handling for completed checkout and subscription updates
- persistence of `customer`, `subscription`, or purchase records in your database
- authenticated user linkage via `customer_email`, `client_reference_id`, or `metadata`

Example pattern for safe server-side plan mapping:

```ts
const PRICE_IDS = {
  starter: process.env.STRIPE_PRICE_STARTER!,
  pro: process.env.STRIPE_PRICE_PRO!,
} as const;
```

Then accept `plan: "starter" | "pro"` from the client instead of arbitrary `priceId`.

# UX rules

- Always show the exact billing interval and amount before sending users to Stripe
- Label recurring plans clearly as monthly/yearly subscriptions
- Disable the button while the session is being created
- Show an inline error if checkout setup fails
- Use app-specific success and cancel pages that match the purchase context
- If selling access to features, explain what unlocks after payment
- For subscription products, mention renewal behavior and cancellation terms near the CTA

# Avoid

- Do not expose `STRIPE_SECRET_KEY` in client code
- Do not trust arbitrary client-submitted price IDs in production
- Do not build fulfillment logic off the success page alone; users can land there without guaranteeing webhook-verified completion
- Do not create duplicate Stripe client instances across many files unnecessarily
- Do not assume a successful redirect means entitlement should already be granted
- Do not keep generic demo success/cancel pages if the app needs account-specific next steps

# Verification

1. Add valid Stripe test keys
2. Use a real Stripe test `price_...` ID
3. Start the app and click the checkout button
4. Confirm the API route returns a Checkout Session ID
5. Confirm redirect to `checkout.stripe.com`
6. Complete payment with a Stripe test card, such as:

```text
4242 4242 4242 4242
```

7. Confirm Stripe redirects back to `/success`
8. Confirm canceling redirects to `/cancel`
9. For subscriptions, verify the Checkout Session is created with `mode: "subscription"`
10. In production builds, verify all redirect URLs use the deployed site origin

If the checkout page fails to load:
- verify the publishable key is present in the browser build
- verify the secret key is valid on the server
- verify the `priceId` exists in the same Stripe account and mode
- verify `NEXT_PUBLIC_SITE_URL` matches the running app origin
