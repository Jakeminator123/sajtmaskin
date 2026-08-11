-- Durable inbox for Vercel Log Drain deliveries (schema `log` v1), received on
-- POST /api/drains/vercel. Closes the one gap /logg has always had to work
-- around: the app's own `console.warn`/`console.error` lines live ONLY on the
-- Vercel platform, so a crashed product-postcheck looked like a polite policy
-- skip in `engine_version_error_logs`. With a drain configured those lines land
-- here and `dump-logs.mjs --kinds=drain` can read them next to the rest.
--
-- This table is deliberately NOT a full log mirror. The receiver drops
-- uninteresting lines (see `shouldPersistDrainLog` in
-- `src/lib/vercel-log-drain.ts`) and prunes rows older than the retention
-- window, so the table stays a bounded diagnostic tail — not log storage.
--
-- `log_id` (Vercel's `id`) is UNIQUE: deliveries can repeat on retry and the
-- receiver inserts with ON CONFLICT DO NOTHING, so redeliveries can never
-- duplicate rows. `log_timestamp` = when Vercel generated the line;
-- `created_at` = when WE received it (dump-logs.mjs orders every kind on
-- created_at). Idempotent; runs via BOTH `npm run db:init` (applySqlMigrations)
-- and `npm run db:migrate`.
CREATE TABLE IF NOT EXISTS vercel_log_drain_events (
  id BIGSERIAL PRIMARY KEY,
  log_id TEXT NOT NULL UNIQUE,
  log_timestamp TIMESTAMPTZ,
  source TEXT,
  level TEXT,
  type TEXT,
  environment TEXT,
  host TEXT,
  path TEXT,
  status_code INTEGER,
  request_id TEXT,
  deployment_id TEXT,
  project_id TEXT,
  execution_region TEXT,
  message TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- created_at DESC: every dump-logs kind orders on it, and the retention prune
-- deletes on it. log_timestamp DESC: correlating a run against a /logg time
-- window uses Vercel's clock, not ours.
CREATE INDEX IF NOT EXISTS idx_vercel_log_drain_events_created_at
  ON vercel_log_drain_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vercel_log_drain_events_log_timestamp
  ON vercel_log_drain_events(log_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_vercel_log_drain_events_level
  ON vercel_log_drain_events(level);
CREATE INDEX IF NOT EXISTS idx_vercel_log_drain_events_request_id
  ON vercel_log_drain_events(request_id);

-- RLS: mirror openai_webhook_events — the production migration path
-- (`npm run db:migrate`) only executes these SQL files and never runs
-- db-init.mjs's buildRlsQueries(), so enable RLS + the backend policy here too.
ALTER TABLE vercel_log_drain_events ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'vercel_log_drain_events'
        AND policyname = 'vercel_log_drain_events_backend_full_access'
    ) THEN
      CREATE POLICY vercel_log_drain_events_backend_full_access ON vercel_log_drain_events
        FOR ALL TO postgres, service_role USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;
