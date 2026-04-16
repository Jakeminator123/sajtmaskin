DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'engine_versions'
      AND column_name = 'repaired_files_json'
  ) THEN
    ALTER TABLE engine_versions ADD COLUMN repaired_files_json TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'engine_versions'
      AND column_name = 'repair_available_at'
  ) THEN
    ALTER TABLE engine_versions ADD COLUMN repair_available_at TIMESTAMPTZ;
  END IF;
END $$;
