-- Fast Edit Lane (2026-06). Adds edit_kind to engine_versions so trivial,
-- deterministic edits (quick_edit) can be distinguished from full generations
-- and rendered as minor versions (v3.1, v3.2) under their parent. Nullable and
-- default-safe: existing rows keep edit_kind = NULL (a normal version).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'engine_versions'
      AND column_name = 'edit_kind'
  ) THEN
    ALTER TABLE engine_versions ADD COLUMN edit_kind TEXT;
  END IF;
END $$;
