-- Fix: columns created as TIMESTAMP (WITHOUT TIME ZONE) by older migration files
-- should be TIMESTAMPTZ so NOW() and explicit JS Date writes are always stored as UTC
-- regardless of the database session timezone.
--
-- Affected tables (created via migration SQL, not db-init.mjs which already uses TIMESTAMPTZ):
--   generation_telemetry  — add-generation-telemetry.sql used bare TIMESTAMP
--   version_comments      — add-collaboration-tables.sql used bare TIMESTAMP
--   version_approvals     — add-collaboration-tables.sql used bare TIMESTAMP
--
-- USING ... AT TIME ZONE 'UTC': interprets stored values as UTC (correct for rows
-- written when the DB session was UTC; rows written in a UTC+2 session remain off
-- by 2 h in the historical data — see PR body for the safe correction strategy).
--
-- All ALTER COLUMNs are guarded by a data_type check so the migration is a no-op
-- on databases where the column is already TIMESTAMPTZ (e.g. fresh installs after
-- add-generation-telemetry.sql and add-collaboration-tables.sql were fixed).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'generation_telemetry'
      AND column_name = 'created_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE generation_telemetry
      ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'version_comments'
      AND column_name = 'created_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE version_comments
      ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'version_comments'
      AND column_name = 'updated_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE version_comments
      ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'version_approvals'
      AND column_name = 'created_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE version_approvals
      ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
  END IF;
END $$;
