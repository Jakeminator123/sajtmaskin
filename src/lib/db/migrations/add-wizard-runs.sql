-- B1: server-owned wizard run. The client only receives this id; it cannot
-- invent a valid one. Start creates the row and debits 11 credits once
-- (transactions.idempotency_key = wizard_runs.id). Lookup, competitors,
-- enrich and prefetch authorize the run and do not charge again.
--
-- The unique transactions(user_id, type, idempotency_key) index remains the
-- last ledger invariant for the debit itself.

CREATE TABLE IF NOT EXISTS wizard_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT wizard_runs_status_check CHECK (status IN ('active', 'completed', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_wizard_runs_user_id
  ON wizard_runs(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS wizard_runs_user_active_idx
  ON wizard_runs(user_id)
  WHERE status = 'active';
