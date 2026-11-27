-- Durable paid media orders. Keep the original project and source identifiers
-- through deletion so the request receipt and eventual refund survive.
CREATE TABLE IF NOT EXISTS video_generation_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  source_media_id BIGINT NOT NULL,
  source_url TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  credits INTEGER NOT NULL,
  provider_cost_ore INTEGER NOT NULL,
  billable_ore INTEGER NOT NULL,
  provider_task_id TEXT,
  result_media_id BIGINT REFERENCES media_library(id) ON DELETE SET NULL,
  error TEXT,
  lease_id TEXT,
  lease_until TIMESTAMPTZ,
  next_check_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  poll_failures INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT video_generation_jobs_status_check
    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
  CONSTRAINT video_generation_jobs_credits_check CHECK (credits > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS video_generation_jobs_user_request_unique
  ON video_generation_jobs(user_id, request_id);
CREATE INDEX IF NOT EXISTS idx_video_generation_jobs_owner_project
  ON video_generation_jobs(user_id, project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_video_generation_jobs_active_user
  ON video_generation_jobs(user_id)
  WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_video_generation_jobs_active_due
  ON video_generation_jobs(next_check_at)
  WHERE status IN ('pending', 'processing');

ALTER TABLE video_generation_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE video_generation_jobs FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE video_generation_jobs FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE video_generation_jobs FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE video_generation_jobs TO service_role;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'video_generation_jobs'
        AND policyname = 'video_generation_jobs_backend_full_access'
    ) THEN
      CREATE POLICY video_generation_jobs_backend_full_access ON video_generation_jobs
        FOR ALL TO postgres, service_role USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;
