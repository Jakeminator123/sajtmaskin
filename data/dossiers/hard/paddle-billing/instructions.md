# When to use

- Use for recurring **Paddle Billing subscriptions** in a Next.js App Router app (not one-off payments — that is the Stripe `payments` dossier).
- Use when subscription status must be synced from verified Paddle webhooks into a Supabase `subscriptions` table.
- Use when authenticated users need a server-side customer-portal endpoint. Best fit for SaaS dashboards on Supabase Auth.

# How to integrate

- Host-app dependency (REQUIRED, not optional): this dossier assumes Supabase Auth — the selector auto-expands `subscriptions` to the `auth` capability PINNED to the `supabase-auth` dossier (dependency pin in `select.ts`), which provides the root `middleware.ts` / session refresh / sign-in surface; this dossier ships NO auth middleware of its own to avoid a root-`middleware.ts` collision. It also assumes a `subscriptions` table with a UNIQUE `paddle_subscription_id`, columns `paddle_customer_id`, `status`, `updated_at`, `raw_payload`, plus a **`user_id`** column (uuid, FK to auth.users) so the customer-portal route can derive the Paddle customer server-side. The dossier does NOT create the table, migrations, or populate `user_id` — provision them in the host app (typically set `user_id` when checkout completes or on first webhook).
- Configure env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PADDLE_API_KEY`, `PADDLE_NOTIFICATION_WEBHOOK_SECRET` (set `NEXT_PUBLIC_PADDLE_ENV=production` only for live keys).
- Graceful degrade (mock: visual — the surface renders, billing never fakes): when env is missing OR a preview placeholder, or the `subscriptions` table does not exist, the server routes return a recognizable JSON 503 (`subscriptions-not-configured` / `subscriptions-table-missing`) — nothing crashes. Render plans/pricing fully; the manage-billing/subscribe ACTION shows `<SubscriptionConfigNotice />` (honest demo notice) instead of touching Paddle. Never simulate a successful charge or an active subscription.
- Mount the webhook at `/api/webhook` (or point the Paddle destination at your route). Verify the signature on the raw `request.text()` body before any DB write.
- Call the customer-portal route only for a signed-in Supabase user; the route looks up `paddle_customer_id` from `subscriptions.user_id` — never post a client `customerId`.

# UX rules

- Show billing actions only to authenticated users.
- Treat webhook-synced subscription state as the source of truth.
- Show current plan, status, renewal/cancellation state, and a clear manage-billing CTA.
- After checkout or portal changes, show a pending state until the server has received webhook updates.

# Avoid

- Do NOT expose `SUPABASE_SERVICE_ROLE_KEY` or `PADDLE_API_KEY` to client components, and never call Paddle portal APIs from the browser.
- Do NOT parse or trust webhook JSON before verifying the `paddle-signature` header on the raw body; an unsigned/tampered webhook must return 4xx, never 500.
- Do NOT accept a client-provided `customerId` in the portal route — derive it from `subscriptions.user_id` (see customer-portal route).
- Do NOT silently assume the `subscriptions` table exists — degrade to 503 and surface the setup gap.
- Do NOT trust client-provided subscription status without webhook reconciliation, and drop unrelated starter-kit layouts/dashboards/demo routes.

# Verification

- Send a valid Paddle sandbox subscription event and confirm `/api/webhook` returns 2xx after the row is upserted.
- Send an unsigned or tampered webhook and confirm it is rejected with 400/401 and no DB write.
- Replay the same subscription event and confirm handling is idempotent (upsert on `paddle_subscription_id`).
- With env unset, confirm `/api/webhook` and the customer-portal route return 503 (`subscriptions-not-configured`) and the site does not 500.
- Sign in and confirm the customer-portal route returns a portal URL; call it signed out and confirm 401.
- Confirm server-only modules (`lib/paddle/supabase-admin.ts`) are never imported by client components.
