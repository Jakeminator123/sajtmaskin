-- Distributed lease table for server-verify / build-error-repair / manual-repair
-- background jobs (Plan C / P1). See
-- docs/plans/active/2026-06-27-server-verify-distributed-lock.md.
--
-- A single active (status='running') row per version_id is the cross-instance
-- lock: any verify/repair run that mutates an engine_versions row must hold the
-- active lease for that version. `kind` is metadata (which caller took the
-- lease) and does NOT participate in uniqueness, so verify and repair can never
-- both own the same version concurrently.
--
-- Additive + idempotent: creating the table/indexes never touches
-- engine_versions, and old code simply ignores the table. New code must fail
-- SAFE if acquire fails (treat "no lease" as "do not run"), never crash.
CREATE TABLE IF NOT EXISTS engine_version_jobs (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES engine_versions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  lease_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- The lock itself: only ONE active (running) lease per version, regardless of
-- kind. Expiry-takeover is handled by the acquire ON CONFLICT path.
CREATE UNIQUE INDEX IF NOT EXISTS "engine_version_jobs_active_uq"
  ON "engine_version_jobs" ("version_id")
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_engine_version_jobs_version
  ON engine_version_jobs (version_id);
