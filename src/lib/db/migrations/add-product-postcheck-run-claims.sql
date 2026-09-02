-- L6: server-side single-flight for Product Postcheck.
-- One Chromium launch per revision tuple
-- (version_id, files_revision, preview_session, lifecycle_token, mutation_revision).
-- Concurrent POSTs: INSERT … ON CONFLICT DO NOTHING — loser gets claim_busy.
-- Stale takeover only after expires_at; takeover bumps claim_generation.
-- Completion is CAS on (run_id, claim_generation) so a displaced owner cannot write.
--
-- Schema differs from closed #1251 (`add-product-postcheck-runs.sql`): that
-- table used (version, files, session, lifecycle) plus fail-open / result-cache
-- columns (`lease_expires_at`, `verification_run_id`, `result`). If a leftover
-- #1251 table is present it is dropped before create — those rows were never
-- a correctness store.
--
-- Sentinels: lifecycle_token '' and mutation_revision 0 mean "absent / legacy"
-- so UNIQUE treats two null-token / null-mutation claims as the same key
-- (Postgres UNIQUE allows multiple NULLs).
-- Idempotent; runs via BOTH `npm run db:init` (applySqlMigrations) and
-- `npm run db:migrate`.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product_postcheck_runs'
      AND column_name = 'lease_expires_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product_postcheck_runs'
      AND column_name = 'claim_generation'
  ) THEN
    DROP TABLE public.product_postcheck_runs;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS product_postcheck_runs (
  run_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES engine_chats(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL,
  files_revision TEXT NOT NULL,
  preview_session TEXT NOT NULL,
  lifecycle_token TEXT NOT NULL DEFAULT '',
  mutation_revision INTEGER NOT NULL DEFAULT 0,
  owner TEXT NOT NULL,
  claim_generation INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  CONSTRAINT product_postcheck_runs_status_check
    CHECK (status IN ('running', 'passed', 'blocked', 'failed', 'superseded', 'expired')),
  CONSTRAINT product_postcheck_runs_generation_check
    CHECK (claim_generation >= 1),
  CONSTRAINT product_postcheck_runs_mutation_check
    CHECK (mutation_revision >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS product_postcheck_runs_claim_unique
  ON product_postcheck_runs (
    version_id,
    files_revision,
    preview_session,
    lifecycle_token,
    mutation_revision
  );
CREATE INDEX IF NOT EXISTS idx_product_postcheck_runs_chat_id
  ON product_postcheck_runs (chat_id);
CREATE INDEX IF NOT EXISTS idx_product_postcheck_runs_expires_at
  ON product_postcheck_runs (expires_at);

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
