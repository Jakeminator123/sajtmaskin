DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'engine_versions'
      AND column_name = 'sandbox_url'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'engine_versions'
      AND column_name = 'preview_url'
  ) THEN
    ALTER TABLE engine_versions RENAME COLUMN sandbox_url TO preview_url;
  END IF;
END $$;
