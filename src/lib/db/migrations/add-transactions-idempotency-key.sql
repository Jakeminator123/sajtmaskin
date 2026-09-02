-- B1: durable idempotency for fixed credit entitlements.
-- A wizard run shares one key across company lookup, competitors and enrich,
-- so retries and concurrent route completions can create at most one debit.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_user_type_idempotency_idx
  ON transactions(user_id, type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
