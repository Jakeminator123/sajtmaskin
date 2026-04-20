# When to use

Use this dossier when you need **Supabase authentication in a Next.js App Router app** and/or **Stripe billing events mirrored into Supabase**.

Typical fits:
- apps with email/OAuth sign-in via Supabase
- apps that need middleware-based session refresh
- apps that sell credits, plans, or one-time purchases through Stripe
- apps that keep `products`, `prices`, or user credits in Postgres/Supabase

Do **not** use this dossier just because the source template was an AI app. The integration value here is Supabase SSR auth + Stripe webhook syncing, not the Extrapolate UI.

# How to integrate

## 1) Environment variables

Required for auth:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Required for billing sync:

```env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

Optional / template-specific variables from the source project can usually be ignored unless you are also implementing those systems:
- `REPLICATE_API_TOKEN`
- `CRON_SECRET`
- `TUNNEL_URL`
- separate test/prod Stripe secrets if your app explicitly branches by environment

## 2) Add Supabase middleware

Keep a middleware helper that creates a Supabase SSR client and persists cookie updates onto both the request and response.

```ts
// lib/supabase/middleware.ts
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export const createClient = (request: NextRequest) => {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    },
  );

  return { supabase, response };
};
```

Then wire the root middleware:

```ts
// middleware.ts
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { supabase, response } = createClient(request);
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

Why this matters: Supabase SSR auth relies on middleware to refresh and propagate cookies correctly across App Router requests.

## 3) Add the auth callback route

Use an auth callback route to exchange the OAuth or magic-link code for a session.

```ts
// app/api/auth/callback/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
```

Notes:
- Preserve `next` only for internal paths.
- The source file also tracks marketing attribution via Dub cookies; that is optional and should only be kept if the app already uses Dub.

## 4) Add an admin Supabase client for webhooks

Stripe webhook handlers should use the service role key, not the public anon key.

```ts
// lib/supabase/admin.ts
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
```

## 5) Add the Stripe webhook route

The source template syncs Stripe `products` and `prices` tables and updates credits after `checkout.session.completed`.

```ts
// app/api/webhooks/stripe/route.ts
import { headers } from "next/headers";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const body = await req.text();
  const signature = headers().get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return new Response("Missing Stripe webhook configuration", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    return new Response("Invalid signature", { status: 400 });
  }

  const supabase = createAdminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "paid" && session.client_reference_id) {
        await supabase.rpc("update_credits", {
          user_id: session.client_reference_id,
          credit_amount: Number(session.metadata?.credits ?? 0),
        });
      }
      break;
    }
  }

  return new Response("OK");
}
```

If you also mirror catalog data, handle:
- `product.created`
- `product.updated`
- `product.deleted`
- `price.created`
- `price.updated`
- `price.deleted`

## 6) Database expectations

This dossier assumes you have corresponding tables / functions in Supabase, typically:
- `products`
- `prices`
- `update_credits(user_id uuid, credit_amount integer)` RPC

The exact schema is app-specific. The runtime LLM should adapt inserts/upserts to the actual schema instead of blindly copying the source app’s custom types.

# UX rules

- Keep auth redirects fast and silent; users should land back on the intended page after sign-in.
- If auth code exchange fails, redirect to a human-readable error page with retry guidance.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client.
- Billing success UI should not rely only on the client redirect; Stripe webhooks are the source of truth for granting credits/entitlements.
- If credits are granted from Stripe metadata, validate that the metadata exists and is numeric before applying it.

# Avoid

- Do not keep the source `app/layout.tsx`; it is template-specific UI and analytics glue.
- Do not copy Dub analytics, Crisp chat, fonts, navbar, or branded metadata unless the target app already uses them.
- Do not run Stripe DB mutations from client components or public API routes without signature verification.
- Do not use the anon Supabase key for webhook writes.
- Do not depend on `NEXT_PUBLIC_VERCEL_ENV` branching unless the project explicitly has separate test/prod secrets and deployment rules.
- Do not assume the source-specific types `StripeProduct` / `StripePrice` exist in the target app.

# Verification

## Supabase auth

- Start the app and complete a Supabase OAuth or magic-link flow.
- Confirm `/api/auth/callback` exchanges the `code` successfully.
- Confirm the session persists across refreshes.
- Confirm middleware runs on non-static routes and does not break assets or API routes.

## Stripe webhook

Use the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Trigger events:

```bash
stripe trigger product.created
stripe trigger price.created
stripe trigger checkout.session.completed
```

Verify:
- invalid signatures return 400
- valid webhook events return 200
- `products` / `prices` rows are inserted, updated, or deleted as expected
- `checkout.session.completed` updates credits/entitlements in Supabase exactly once

## Security checks

- `SUPABASE_SERVICE_ROLE_KEY` is only referenced in server files
- webhook route reads raw body via `req.text()` before signature verification
- no client bundle imports admin Supabase code
