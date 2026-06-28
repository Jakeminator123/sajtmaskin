-- OpenClaw debug-mode bug-hunt findings (OC_DEBUG).
-- Structured, queryable results from an armed (Mode A) or autopilot (Mode B)
-- bug-hunt run. Distinct from engine_version_error_logs (per-version pipeline
-- findings): this is the debug harness's own observation log, grouped by run_id,
-- with the build outcome it forced and the scenario it was probing.
-- chat_id / version_id are plain TEXT (no FK) so findings survive cleanup of the
-- underlying debug chat/version and can reference synthetic ids.
-- Idempotent; runs via BOTH `npm run db:init` (applySqlMigrations) and the
-- production migration path `npm run db:migrate`.
-- RLS is applied separately in db-init.mjs via ALL_TABLES (oc_debug_findings).
CREATE TABLE IF NOT EXISTS oc_debug_findings (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  chat_id TEXT,
  version_id TEXT,
  scenario TEXT,
  severity TEXT NOT NULL,
  category TEXT,
  file TEXT,
  line INTEGER,
  message TEXT NOT NULL,
  build_result TEXT,
  repair_outcome TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oc_debug_findings_run_id ON oc_debug_findings(run_id);
CREATE INDEX IF NOT EXISTS idx_oc_debug_findings_version_id ON oc_debug_findings(version_id);
CREATE INDEX IF NOT EXISTS idx_oc_debug_findings_created_at ON oc_debug_findings(created_at DESC);

-- RLS: the production migration path (`npm run db:migrate`) only executes these
-- SQL files and never runs db-init.mjs's buildRlsQueries(), so enable RLS + the
-- backend policy here too. Keeps the repo's RLS-on-all-tables invariant for envs
-- updated via migrations.
ALTER TABLE oc_debug_findings ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'oc_debug_findings'
        AND policyname = 'oc_debug_findings_backend_full_access'
    ) THEN
      CREATE POLICY oc_debug_findings_backend_full_access ON oc_debug_findings
        FOR ALL TO postgres, service_role USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;
