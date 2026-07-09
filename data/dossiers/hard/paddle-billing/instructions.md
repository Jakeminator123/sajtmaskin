# When to use

- Use for recurring **Paddle Billing subscriptions** in a Next.js App Router app (not one-off payments — that is the Stripe `payments` dossier).
- Use when subscription status must be synced from verified Paddle webhooks into a Supabase `subscriptions` table.
- Use when authenticated users need a server-side customer-portal endpoint. Best fit for SaaS dashboards on Supabase Auth.

# How to integrate

- Host-app dependency (REQUIRED, not optional): this dossier assumes Supabase Auth AND a `subscriptions` table with a UNIQUE `paddle_subscription_id`, plus `paddle_customer_id`, `status`, `updated_at`, `raw_payload`, and a way to map your signed-in user to a Paddle customer id. The dossier does NOT create the table, migrations, or the user↔customer mapping — provision them in the host app.
- Configure env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PADDLE_API_KEY`, `PADDLE_NOTIFICATION_WEBHOOK_SECRET` (set `NEXT_PUBLIC_PADDLE_ENV=production` only for live keys).
- Graceful degrade: when env or the `subscriptions` table is missing the server routes return a recognizable JSON 503 (`subscriptions-not-configured` / `subscriptions-table-missing`) and the middleware passes through — nothing crashes. Render the pricing / manage-billing button in demo mode with `<SubscriptionConfigNotice />` until it is configured.
- Mount the webhook at `/api/webhook` (or point the Paddle destination at your route). Verify the signature on the raw `request.text()` body before any DB write.
- Call the customer-portal route only for a signed-in Supabase user; authorize the Paddle customer id server-side from your mapping.

# UX rules

- Show billing actions only to authenticated users.
- Treat webhook-synced subscription state as the source of truth.
- Show current plan, status, renewal/cancellation state, and a clear manage-billing CTA.
- After checkout or portal changes, show a pending state until the server has received webhook updates.

# Avoid

- Do NOT expose `SUPABASE_SERVICE_ROLE_KEY` or `PADDLE_API_KEY` to client components, and never call Paddle portal APIs from the browser.
- Do NOT parse or trust webhook JSON before verifying the `paddle-signature` header on the raw body; an unsigned/tampered webhook must return 4xx, never 500.
- Do NOT trust a client-provided `customerId` in the portal route without authorizing it against the signed-in user's mapping (otherwise one user can open another's billing portal).
- Do NOT silently assume the `subscriptions` table exists — degrade to 503 and surface the setup gap.
- Do NOT trust client-provided subscription status without webhook reconciliation, and drop unrelated starter-kit layouts/dashboards/demo routes.

# Verification

- Send a valid Paddle sandbox subscription event and confirm `/api/webhook` returns 2xx after the row is upserted.
- Send an unsigned or tampered webhook and confirm it is rejected with 400/401 and no DB write.
- Replay the same subscription event and confirm handling is idempotent (upsert on `paddle_subscription_id`).
- With env unset, confirm `/api/webhook` and the customer-portal route return 503 (`subscriptions-not-configured`) and the site does not 500.
- Sign in and confirm the customer-portal route returns a portal URL; call it signed out and confirm 401.
- Confirm server-only modules (`admin.ts`) are never imported by client components.
