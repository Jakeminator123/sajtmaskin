-- Persist which Vercel project a Sajtmaskin project publishes to, so
-- re-publishing reuses the SAME Vercel project (name-targeted) instead of
-- implicitly creating a new one, and custom domains can be attached to the
-- customer's own generated project rather than the workspace's project.
-- Both columns are nullable: existing projects migrate cleanly and get the
-- link backfilled on their next publish.
ALTER TABLE app_projects ADD COLUMN IF NOT EXISTS vercel_project_id TEXT;
ALTER TABLE app_projects ADD COLUMN IF NOT EXISTS vercel_project_name TEXT;
