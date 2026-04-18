-- F2/F3 lifecycle (2026-04). Adds parent_version_id (forks F3 versions
-- from a specific F2 version) and lifecycle_stage ("design" | "integrations")
-- to the engine_versions table. Both nullable/default-safe so existing rows
-- migrate cleanly to the F2 design stage with no parent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'engine_versions'
      AND column_name = 'parent_version_id'
  ) THEN
    ALTER TABLE engine_versions ADD COLUMN parent_version_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'engine_versions'
      AND column_name = 'lifecycle_stage'
  ) THEN
    ALTER TABLE engine_versions
      ADD COLUMN lifecycle_stage TEXT NOT NULL DEFAULT 'design';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS engine_versions_parent_version_id_idx
  ON engine_versions(parent_version_id);

CREATE INDEX IF NOT EXISTS engine_versions_lifecycle_stage_idx
  ON engine_versions(lifecycle_stage);
