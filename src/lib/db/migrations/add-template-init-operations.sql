-- SM-013: durable template-init reservation.
-- The insert on claim_key is the concurrency lock. operation_id is the
-- credit idempotency key and stays stable across retry. Status is
-- pending / completed / failed so a retry reclaims the same operation
-- instead of minting a second import.
--
-- Additive CREATE TABLE IF NOT EXISTS. No unique index outside the
-- primary key (the additive gate treats CREATE UNIQUE INDEX as breaking).
-- Committed but not applied here — preview shares the production database.

CREATE TABLE IF NOT EXISTS template_init_operations (
  claim_key TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL,
  status TEXT NOT NULL,
  user_id TEXT,
  session_id TEXT,
  project_id TEXT,
  template_id TEXT NOT NULL,
  chat_id TEXT,
  version_id TEXT,
  claim_generation INTEGER NOT NULL DEFAULT 1,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT template_init_operations_status_check
    CHECK (status IN ('pending', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_template_init_operations_project
  ON template_init_operations (project_id);
CREATE INDEX IF NOT EXISTS idx_template_init_operations_expires_at
  ON template_init_operations (expires_at);

ALTER TABLE template_init_operations ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'template_init_operations'
        AND policyname = 'template_init_operations_backend_full_access'
    ) THEN
      CREATE POLICY template_init_operations_backend_full_access ON template_init_operations
        FOR ALL TO postgres, service_role USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;
