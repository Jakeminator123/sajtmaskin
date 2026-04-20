-- Stripe webhook idempotency guard.
--
-- A single Stripe checkout session must never produce more than one
-- transaction row, so a duplicate webhook delivery (which Stripe will
-- retry on any non-2xx response, and even on healthy responses if its
-- internal bookkeeping decides to) surfaces as a unique-violation that
-- the webhook handler can swallow safely.
--
-- NULL is allowed (and not constrained) so non-Stripe transactions
-- such as `signup_bonus` continue to coexist freely; PostgreSQL treats
-- NULLs as distinct in a unique index by default.
CREATE UNIQUE INDEX IF NOT EXISTS transactions_stripe_session_idx
  ON transactions (stripe_session_id);
