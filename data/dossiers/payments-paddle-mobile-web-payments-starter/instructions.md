# When to use

Use this dossier when you need a **web-based Paddle checkout flow for a mobile app**, especially iOS, where the user starts payment in a Next.js site and must be sent back into the app via a custom URL scheme after a successful purchase.

This dossier is a fit for:
- pricing pages for mobile apps
- paywall / upgrade flows opened in a webview or browser
- SaaS or app-shell projects that sell subscriptions managed by Paddle

This dossier is **not** a full billing backend. It does **not** include:
- webhook processing
- entitlement syncing
- subscription state storage in your database
- Apple App Store in-app purchase flows

# How to integrate

## 1) Install and configure environment variables

Required env vars:

```env
APPLE_TEAM_ID=ABCDE12345
NEXT_PUBLIC_BUNDLE_IDENTIFIER=com.example.yourapp
NEXT_PUBLIC_APP_REDIRECT_URL=yourapp://checkout_redirect/success
NEXT_PUBLIC_PADDLE_ENV=sandbox
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=your_paddle_client_token
```

Notes:
- `NEXT_PUBLIC_APP_REDIRECT_URL` should be a deep link your mobile app handles.
- `NEXT_PUBLIC_PADDLE_ENV` must be `sandbox` or `production`.
- `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` is required to initialize Paddle.js.
- `APPLE_TEAM_ID` and `NEXT_PUBLIC_BUNDLE_IDENTIFIER` are relevant to the broader mobile app setup, but the web integration here primarily relies on the `NEXT_PUBLIC_*` variables.

## 2) Add the Paddle initializer

Create a shared client utility:

```ts
"use client";

import { initializePaddle, type Paddle } from "@paddle/paddle-js";

let paddlePromise: Promise<Paddle | undefined> | null = null;

export function getPaddleInstance() {
  if (!paddlePromise) {
    const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    const environment = process.env.NEXT_PUBLIC_PADDLE_ENV as "sandbox" | "production" | undefined;

    if (!token) throw new Error("Missing NEXT_PUBLIC_PADDLE_CLIENT_TOKEN");
    if (!environment) throw new Error("Missing NEXT_PUBLIC_PADDLE_ENV");

    paddlePromise = initializePaddle({
      environment,
      token,
    });
  }

  return paddlePromise;
}
```

Only call this from client components or client utilities.

## 3) Build a checkout launcher

Open Paddle Checkout from a client component or helper:

```ts
"use client";

import { getPaddleInstance } from "@/src/lib/paddle";
import { getMobileRedirectUrl } from "@/src/lib/redirect";

export async function openPaddleCheckout(priceId: string) {
  const paddle = await getPaddleInstance();

  if (!paddle) throw new Error("Failed to initialize Paddle");

  paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    settings: {
      displayMode: "overlay",
      successUrl: "https://example.com/checkout/success",
    },
    eventCallback(event) {
      if (event.name === "checkout.completed") {
        const transactionId = event.data?.transaction_id;

        if (transactionId) {
          window.location.href = getMobileRedirectUrl(transactionId);
        }
      }
    },
  });
}
```

Important:
- Redirect the user back into the app only after `checkout.completed`.
- Include the Paddle `transaction_id` in the redirect so the app or backend can verify the purchase.
- Replace the placeholder `successUrl` with a real page on your domain if your flow needs a web fallback.

## 4) Use it from a pricing or upgrade button

```tsx
"use client";

import { useState } from "react";
import { openPaddleCheckout } from "@/src/lib/open-paddle-checkout";

export function UpgradeButton({ priceId }: { priceId: string }) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      disabled={loading}
      onClick={async () => {
        try {
          setLoading(true);
          await openPaddleCheckout({ priceId });
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? "Loading…" : "Upgrade"}
    </button>
  );
}
```

## 5) Render billing text consistently

The included helpers are useful when showing Paddle-derived pricing details:

```ts
import { formatBillingCycle } from "@/src/lib/format-billing-cycle";
import { formatCurrency } from "@/src/lib/format-currency";
import { formatTrialPeriod } from "@/src/lib/format-trial-period";

const priceLabel = formatCurrency(12.99, "USD");
const cycleLabel = formatBillingCycle({ frequency: 1, interval: "month" });
const trialLabel = formatTrialPeriod({ frequency: 7, interval: "day" });
```

## 6) Handle the app deep link

The mobile app should register and handle the same deep-link scheme used in `NEXT_PUBLIC_APP_REDIRECT_URL`, for example:

```txt
yourapp://checkout_redirect/success?transactionId=txn_123
```

Your app should:
- parse `transactionId`
- call your backend to validate the purchase or fetch transaction status
- unlock entitlements only after server-side verification

# UX rules

- Always show the final billing cadence clearly, e.g. `US$12.99 / month`.
- If there is a trial, show both the trial duration and the post-trial billing amount.
- Disable the purchase button while initializing checkout.
- Provide a fallback message if deep-link redirect is unavailable.
- If checkout is opened outside the mobile app context, keep a web success page available.
- Treat the redirect as a convenience, not as proof of payment.

# Avoid

- Do not unlock premium access purely because the browser hit `checkout.completed`.
- Do not hardcode sandbox assumptions into production builds.
- Do not call Paddle initialization from the server.
- Do not depend on template-specific layout files, toasters, or demo pricing pages.
- Do not assume every checkout completion event contains all customer data you need for entitlements.
- Do not store sensitive verification logic in the client.

# Verification

## Local checks

1. Confirm env vars are present.
2. Render a button that calls `openPaddleCheckout`.
3. Click the button and verify Paddle overlay opens.
4. Complete a sandbox transaction.
5. Confirm the browser attempts to navigate to:

```txt
yourapp://checkout_redirect/success?transactionId=...
```

## Production-readiness checks

- `NEXT_PUBLIC_PADDLE_ENV=production` in production.
- Deep-link scheme is registered in the iOS app.
- Backend can verify Paddle transactions before granting access.
- Pricing UI uses real Paddle price IDs.
- There is a fallback success page for users who do not return to the app.

## Runtime sanity checks

Useful assertions during integration:

```ts
if (!process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN) {
  throw new Error("Missing NEXT_PUBLIC_PADDLE_CLIENT_TOKEN");
}

if (!process.env.NEXT_PUBLIC_APP_REDIRECT_URL) {
  throw new Error("Missing NEXT_PUBLIC_APP_REDIRECT_URL");
}
```
