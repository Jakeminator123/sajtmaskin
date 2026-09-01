-- Server-side single-flight for Product Postcheck (L6).
-- One Chromium launch per preview target
-- (version_id, files_revision, preview_session_id, lifecycle_token).
-- Concurrent / retried POSTs reuse the row instead of launching another
-- browser. Cached `result` lets a waiter return the winner's JSON.
-- `lifecycle_token` is '' when the bind tuple has NULL so UNIQUE treats
-- two null-token claims as the same key.
-- Idempotent; runs via BOTH `npm run db:init` (applySqlMigrations) and
-- `npm run db:migrate`.

CREATE TABLE IF NOT EXISTS product_postcheck_runs (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES engine_chats(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL,
  files_revision TEXT NOT NULL,
  preview_session_id TEXT NOT NULL,
  lifecycle_token TEXT NOT NULL DEFAULT '',
  verification_run_id TEXT,
  status TEXT NOT NULL,
  skip_reason TEXT,
  result JSONB,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS product_postcheck_runs_claim_unique
  ON product_postcheck_runs(
    version_id,
    files_revision,
    preview_session_id,
    lifecycle_token
  );
CREATE INDEX IF NOT EXISTS idx_product_postcheck_runs_chat_id
  ON product_postcheck_runs(chat_id);
CREATE INDEX IF NOT EXISTS idx_product_postcheck_runs_expires_at
  ON product_postcheck_runs(expires_at);

ALTER TABLE product_postcheck_runs ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'product_postcheck_runs'
        AND policyname = 'product_postcheck_runs_backend_full_access'
    ) THEN
      CREATE POLICY product_postcheck_runs_backend_full_access ON product_postcheck_runs
        FOR ALL TO postgres, service_role USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;
