-- Durable inbox for inbound OpenAI platform webhooks (Standard Webhooks spec),
-- received on POST /api/webhooks/openai. OpenAI only fires these for
-- asynchronous jobs (Responses API with background:true, Batch, fine-tuning),
-- so this is a receipt/audit trail for admin/backoffice — not a live progress
-- channel (builder chat stays on SSE). Idempotent; runs via BOTH
-- `npm run db:init` (applySqlMigrations) and `npm run db:migrate`.
--
-- `event_id` (evt_…) is UNIQUE: OpenAI retries undelivered events for up to
-- 72h and the receiver inserts with ON CONFLICT DO NOTHING, so redeliveries
-- can never duplicate rows. `created_at` = when WE received the event
-- (dump-logs.mjs orders every kind on created_at); `event_created_at` =
-- OpenAI's own event timestamp; `object_id` = data.id (resp_…/batch_…) for
-- correlating against a future background-mode caller.
CREATE TABLE IF NOT EXISTS openai_webhook_events (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  object_id TEXT,
  event_created_at TIMESTAMPTZ,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_openai_webhook_events_created_at
  ON openai_webhook_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_openai_webhook_events_type
  ON openai_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_openai_webhook_events_object_id
  ON openai_webhook_events(object_id);

-- RLS: mirror error_log_events — the production migration path
-- (`npm run db:migrate`) only executes these SQL files and never runs
-- db-init.mjs's buildRlsQueries(), so enable RLS + the backend policy here too.
ALTER TABLE openai_webhook_events ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'openai_webhook_events'
        AND policyname = 'openai_webhook_events_backend_full_access'
    ) THEN
      CREATE POLICY openai_webhook_events_backend_full_access ON openai_webhook_events
        FOR ALL TO postgres, service_role USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;
