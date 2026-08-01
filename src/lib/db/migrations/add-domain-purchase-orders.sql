-- In-app domain purchase: turn the dormant `domain_orders` table into a real
-- order ledger with the constraints that make "cannot be bought or charged
-- twice" a database fact rather than an application promise.
--
-- The table already existed (created by db-init.mjs, never written to by any
-- runtime code and with no .sql migration of its own). This migration adopts
-- it: `CREATE TABLE IF NOT EXISTS` so a database that never ran db-init still
-- gets it, then additive `ADD COLUMN IF NOT EXISTS` for the purchase columns.
--
-- Money is stored in ÖRE, not SEK. Stripe charges integer minor units, and a
-- SEK-rounded figure would have to be re-rounded at charge time — a place for
-- the amount shown and the amount charged to drift apart. The legacy
-- `customer_price` / `vercel_cost` columns are left untouched (they predate
-- this flow, have no writer, and dropping columns is not worth the risk).
--
-- Two unique indexes carry the idempotency:
--
--   1. `stripe_session_id` UNIQUE — a redelivered `checkout.session.completed`
--      cannot create a second order. Mirrors transactions_stripe_session_idx.
--   2. `lower(domain)` UNIQUE over LIVE statuses only — two customers cannot
--      hold a live order for the same name at once, while dead orders
--      (expired/canceled/refunded/failed) release the name for a retry.
--
-- Statuses: pending_payment -> paid -> registering -> registered
--           and the terminal branches expired | canceled | registration_failed
--           | refunded.

CREATE TABLE IF NOT EXISTS domain_orders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  order_id TEXT,
  customer_price INTEGER,
  vercel_cost INTEGER,
  currency TEXT,
  status TEXT,
  years INTEGER,
  domain_added_to_project BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Tenant + context. Nullable at the DB level because pre-existing rows (if any
-- database has them) cannot be backfilled; every read path filters on user_id,
-- so a NULL can never match a signed-in user and is therefore unreachable
-- rather than leaky.
ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS chat_id TEXT;
ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS vercel_project_id TEXT;

-- Which provider quoted and would fulfil ("vercel" | "loopia").
ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS registrar TEXT;

-- Stripe linkage. `stripe_session_id` is the idempotency key for webhooks.
ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;
ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS stripe_payment_intent TEXT;
ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT;

-- Money in öre, frozen at checkout. `price_ore` is what the customer approved;
-- re-reading the registrar after payment must never change what we charged.
ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS price_ore INTEGER;
ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS wholesale_ore INTEGER;

-- Lifecycle timestamps + the reason a terminal failure happened, so a stuck
-- order can be triaged from the row alone without correlating logs.
ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ;
ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE domain_orders ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- One order per Stripe session. Partial so the legacy rows (NULL session) and
-- any future non-Stripe path do not collide on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_orders_stripe_session
  ON domain_orders (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- One LIVE order per domain, globally. This is the constraint that makes a
-- double purchase impossible even when two requests race past any application
-- check: the second INSERT fails with 23505 and the route answers 409.
CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_orders_live_domain
  ON domain_orders (lower(domain))
  WHERE status IN ('pending_payment', 'paid', 'registering', 'registered');

CREATE INDEX IF NOT EXISTS idx_domain_orders_user
  ON domain_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_domain_orders_status
  ON domain_orders (status);

-- RLS: mirror the other migrations. The production path (`npm run db:migrate`)
-- only executes these SQL files and never runs db-init.mjs's buildRlsQueries(),
-- so the policy has to be declared here too.
ALTER TABLE domain_orders ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'domain_orders'
        AND policyname = 'domain_orders_backend_full_access'
    ) THEN
      CREATE POLICY domain_orders_backend_full_access ON domain_orders
        FOR ALL TO postgres, service_role USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;
