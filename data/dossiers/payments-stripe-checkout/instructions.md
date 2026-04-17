# When to use

Use this dossier when the site needs **hosted payments with Stripe Checkout**:

- one-time purchases using a Stripe `Price`
- recurring subscriptions using a Stripe `Price`
- a fast integration without collecting card details directly in your UI

Do **not** use this dossier for embedded Elements, saved payment methods, invoicing flows, or marketplace payouts.

# How to integrate

## 1) Install and configure

Required packages:

```bash
npm install stripe @stripe/stripe-js
```

Required env vars:

```env
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Rules:

- `STRIPE_SECRET_KEY` is server-only.
- `NEXT_PUBLIC_SITE_URL` must be the full origin, no trailing slash.
- Use Stripe **Price IDs** (`price_...`) in the UI, not Product IDs.

## 2) Create a shared Stripe server client

```ts
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-01-27.acacia",
});
```

Use this from server routes only.

## 3) Add the Checkout Session API route

Create a POST route that receives `priceId` and `mode`, validates them, then creates a Checkout Session.

```ts
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/components/lib/stripe";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL!;

export async function POST(request: NextRequest) {
  try {
    const { priceId, mode } = (await request.json()) as {
      priceId?: string;
      mode?: "payment" | "subscription";
    };

    if (!priceId) {
      return NextResponse.json({ error: "Missing priceId" }, { status: 400 });
    }

    if (mode !== "payment" && mode !== "subscription") {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
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

Implementation notes:

- Keep Checkout Session creation on the server.
- Never expose `STRIPE_SECRET_KEY` to client components.
- `mode` must match the Stripe Price type you configured.

## 4) Add the checkout button client component

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

## 5) Use the button in product or pricing UI

```tsx
import { CheckoutButton } from "@/components/checkout-button";

export default function PricingCard() {
  return (
    <CheckoutButton
      priceId="price_123"
      mode="subscription"
      label="Start subscription"
    />
  );
}
```

Use:

- `mode="payment"` for one-time payments
- `mode="subscription"` for recurring prices

## 6) Add success and cancel routes

Create pages at `/success` and `/cancel` so Stripe redirects land on real routes.

Minimal examples:

```tsx
export default function SuccessPage() {
  return <h1>Payment successful</h1>;
}
```

```tsx
export default function CancelPage() {
  return <h1>Checkout canceled</h1>;
}
```

# UX rules

- Button text must clearly describe the action: `Buy now`, `Subscribe`, `Start trial`, not vague labels.
- Show a loading state immediately after click and disable repeat submissions.
- Surface errors inline near the button with `role="alert"`.
- Make pricing terms explicit before redirecting: amount, billing interval, and renewal behavior for subscriptions.
- For subscriptions, link to refund/cancellation terms near the CTA.
- Do not claim payment succeeded until the user returns from Stripe and the flow is verified server-side if fulfillment matters.

# Avoid

- Do not create Checkout Sessions in client code.
- Do not pass raw amounts from the browser; use Stripe Price IDs configured in Stripe.
- Do not use Product IDs (`prod_...`) where Stripe expects `price_...`.
- Do not rely on `/success` alone for provisioning access, shipping, or entitlement changes; use webhooks for production fulfillment.
- Do not hardcode localhost URLs in deployed environments.
- Do not keep template-specific Swedish copy unless the site language is Swedish.

# Verification

1. Set test keys in `.env.local`.
2. Start the app and render a `CheckoutButton` with a valid test `price_...`.
3. Click the button and confirm the browser redirects to `checkout.stripe.com`.
4. Complete checkout with Stripe test card `4242 4242 4242 4242`.
5. Confirm Stripe redirects back to `/success?session_id=...`.
6. Repeat and use the back/cancel path to confirm `/cancel` renders correctly.
7. Test both modes if supported:
   - one-time price with `mode: "payment"`
   - recurring price with `mode: "subscription"`
8. Confirm server logs show no secret leakage and no client bundle imports `stripe` server SDK.

Production note: if the site grants access, creates orders, or sends receipts based on successful payment, add a Stripe webhook handler before launch.
