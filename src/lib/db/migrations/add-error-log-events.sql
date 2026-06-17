-- Durable store for the error-log RAG (cross-run fault/fix telemetry).
-- Mirrors the local NDJSON producer shape so the retriever can rebuild the same
-- TF-IDF index from Postgres in serverless prod (where the local fs is
-- ephemeral). Idempotent; runs via BOTH `npm run db:init` (applySqlMigrations)
-- and the production migration path `npm run db:migrate`.
-- RLS is applied separately in db-init.mjs via ALL_TABLES (error_log_events).
CREATE TABLE IF NOT EXISTS error_log_events (
  id BIGSERIAL PRIMARY KEY,
  phase TEXT NOT NULL,
  subphase TEXT,
  creator TEXT,
  fixer TEXT,
  severity TEXT,
  fault TEXT NOT NULL,
  fault_text TEXT,
  fix_text TEXT,
  model_tier TEXT,
  model TEXT,
  provider TEXT,
  pass_number INTEGER,
  repair_pass_index INTEGER,
  result TEXT,
  chat_id TEXT,
  version_id TEXT,
  scaffold_id TEXT,
  route_path TEXT,
  variant_id TEXT,
  capability_ids JSONB,
  generation_mode TEXT,
  lineage_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_error_log_events_created_at ON error_log_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_log_events_fault ON error_log_events(fault);

-- RLS: the production migration path (`npm run db:migrate`) only executes these
-- SQL files and never runs db-init.mjs's buildRlsQueries(), so enable RLS + the
-- backend policy here too. Keeps the repo's RLS-on-all-tables invariant for envs
-- updated via migrations (the table holds cross-tenant fault_text/fix_text).
ALTER TABLE error_log_events ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'error_log_events'
        AND policyname = 'error_log_events_backend_full_access'
    ) THEN
      CREATE POLICY error_log_events_backend_full_access ON error_log_events
        FOR ALL TO postgres, service_role USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;
