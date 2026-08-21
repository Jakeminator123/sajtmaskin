-- SM-070: OpenClaw live_review grant + idempotent review claims.
-- Grant is per engine chat and is the only authority Product Postcheck trusts.
-- Runs are unique on (version_id, files_revision) so concurrent/retried
-- postchecks reuse one paid review. Blob URLs live on the run row (owner + TTL).
-- Idempotent; runs via BOTH `npm run db:init` (applySqlMigrations) and
-- `npm run db:migrate`.

CREATE TABLE IF NOT EXISTS live_review_grants (
  chat_id TEXT PRIMARY KEY REFERENCES engine_chats(id) ON DELETE CASCADE,
  granted JSONB NOT NULL DEFAULT '[]'::jsonb,
  powers_on BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS live_review_runs (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES engine_chats(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL,
  files_revision TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  skip_reason TEXT,
  result JSONB,
  desktop_url TEXT,
  mobile_url TEXT,
  desktop_blob_path TEXT,
  mobile_blob_path TEXT,
  model_attempts INTEGER NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS live_review_runs_version_revision_unique
  ON live_review_runs(version_id, files_revision);
CREATE INDEX IF NOT EXISTS idx_live_review_runs_chat_id
  ON live_review_runs(chat_id);
CREATE INDEX IF NOT EXISTS idx_live_review_runs_expires_at
  ON live_review_runs(expires_at);

ALTER TABLE live_review_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_review_runs ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'live_review_grants'
        AND policyname = 'live_review_grants_backend_full_access'
    ) THEN
      CREATE POLICY live_review_grants_backend_full_access ON live_review_grants
        FOR ALL TO postgres, service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'live_review_runs'
        AND policyname = 'live_review_runs_backend_full_access'
    ) THEN
      CREATE POLICY live_review_runs_backend_full_access ON live_review_runs
        FOR ALL TO postgres, service_role USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;
