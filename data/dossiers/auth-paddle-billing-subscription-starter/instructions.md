# When to use

Use this dossier when the app needs:

- Supabase auth in a Next.js App Router project
- request-time session refresh via middleware
- Paddle Billing subscriptions with webhook-driven sync into your database
- a server-side customer portal endpoint for managing billing

This is a good fit for SaaS apps with gated dashboards, account pages, and subscription plans.

# How to integrate

## 1) Install and configure env vars

Required environment variables:

```env
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_PADDLE_ENV=sandbox
PADDLE_API_KEY=
PADDLE_NOTIFICATION_WEBHOOK_SECRET=
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=
```

Notes:

- `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be exposed to the client.
- `NEXT_PUBLIC_PADDLE_ENV` should be `sandbox` during development and `production` in live environments.
- `PADDLE_NOTIFICATION_WEBHOOK_SECRET` must match the webhook destination configured in Paddle.

## 2) Add Supabase session middleware

Keep a root `middleware.ts` that refreshes auth state on every request:

```ts
import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

The helper should use `@supabase/ssr` and call `supabase.auth.getUser()` so refreshed cookies are written back to the response.

## 3) Create server-side Supabase clients

Use one client for authenticated requests and one admin client for webhook/database sync.

Server client:

```ts
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {}
        },
      },
    }
  );
}
```

Admin client:

```ts
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
);
```

## 4) Add Paddle webhook verification

The webhook route must read the raw request body and verify `paddle-signature` before doing any writes.

```ts
import { NextRequest } from 'next/server';
import { ProcessWebhook } from '@/lib/paddle/process-webhook';
import { getPaddleInstance } from '@/lib/paddle/get-paddle-instance';

const webhookProcessor = new ProcessWebhook();

export async function POST(request: NextRequest) {
  const signature = request.headers.get('paddle-signature') || '';
  const rawRequestBody = await request.text();
  const secret = process.env.PADDLE_NOTIFICATION_WEBHOOK_SECRET || '';

  if (!signature || !rawRequestBody) {
    return Response.json({ error: 'Missing signature from header' }, { status: 400 });
  }

  try {
    const paddle = getPaddleInstance();
    const event = await paddle.webhooks.unmarshal(rawRequestBody, secret, signature);

    await webhookProcessor.processEvent(event);

    return Response.json({ ok: true, eventType: event.eventType });
  } catch {
    return Response.json({ error: 'Invalid webhook' }, { status: 400 });
  }
}
```

Important integration rules:

- Use `request.text()`, not `request.json()`, before signature verification.
- Verify the signature before parsing business data.
- Make webhook processing idempotent with an upsert keyed by Paddle subscription ID or event ID.
- Return 2xx only after the event is accepted or safely ignored.

## 5) Add a Paddle server helper

```ts
import { Paddle } from '@paddle/paddle-node-sdk';

let paddleInstance: Paddle | null = null;

export function getPaddleInstance() {
  if (!paddleInstance) {
    paddleInstance = new Paddle(process.env.PADDLE_API_KEY!, {
      environment:
        process.env.NEXT_PUBLIC_PADDLE_ENV === 'production' ? 'production' : 'sandbox',
    });
  }

  return paddleInstance;
}
```

## 6) Sync subscription state into Supabase

Keep the webhook processor small and deterministic. Typical behavior:

- accept only subscription-related events
- map Paddle event types to internal statuses
- upsert into a `subscriptions` table
- store timestamps and external IDs

Example:

```ts
await supabaseAdmin.from('subscriptions').upsert(
  {
    paddle_subscription_id: subscriptionId,
    paddle_customer_id: customerId,
    status,
    updated_at: new Date().toISOString(),
    raw_payload: data,
  },
  { onConflict: 'paddle_subscription_id' }
);
```

Recommended columns:

- `paddle_subscription_id` unique
- `paddle_customer_id`
- `user_id` if you map subscriptions to app users
- `status`
- `price_id` or `product_id`
- `current_period_ends_at`
- `updated_at`
- `raw_payload` jsonb

## 7) Add a secure billing management endpoint

Expose customer portal creation from a server route only:

```ts
import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getPaddleInstance } from '@/lib/paddle/get-paddle-instance';

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { customerId } = await request.json();

  const paddle = getPaddleInstance();
  const session = await paddle.customerPortalSessions.create({ customerId });

  return Response.json({ url: session.urls.general.overview });
}
```

Do not create customer portal sessions directly from the client with secret credentials.

# UX rules

- Hide billing management and plan changes behind authentication.
- Show current plan, billing status, renewal/cancel state, and a clear CTA to manage billing.
- Treat webhook state as source of truth for subscription status; do not rely only on optimistic client state after checkout.
- If a billing action is pending, show a neutral processing state and refresh from server data.
- For protected pages, redirect unauthenticated users to sign-in before showing billing actions.

# Avoid

- Do not expose `SUPABASE_SERVICE_ROLE_KEY` or `PADDLE_API_KEY` to client components.
- Do not parse webhook bodies as JSON before signature verification.
- Do not trust a client-provided subscription status without reconciling against Paddle webhooks.
- Do not keep template branding, demo metadata, or unrelated dashboard utilities from the source starter.
- Do not write broad middleware matchers that intercept static assets unnecessarily.

# Verification

## Auth

- Sign in through Supabase and confirm authenticated requests persist across refreshes.
- Visit a protected route and confirm the session is available server-side.
- Confirm auth cookies are updated by middleware when tokens rotate.

## Paddle webhook

- Configure Paddle to send events to `/api/webhook`.
- Trigger a sandbox subscription event.
- Confirm the route returns 200 for valid signed events.
- Confirm invalid or unsigned requests return 400/401-class failures.
- Confirm the `subscriptions` table is updated idempotently.

## Billing portal

- Call the customer portal route while signed in and confirm it returns a portal URL.
- Call it while signed out and confirm it returns `401 Unauthorized`.

## Production readiness

- Verify `NEXT_PUBLIC_PADDLE_ENV=production` in production only.
- Verify webhook secret and API key are from the same Paddle environment.
- Verify the app does not import server-only Paddle or Supabase admin modules into client code.
