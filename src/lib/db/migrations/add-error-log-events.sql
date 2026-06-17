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
