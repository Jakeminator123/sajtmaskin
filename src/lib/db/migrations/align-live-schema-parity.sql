-- Live schema-parity reconciliation (2026-08-05).
--
-- Background: db-init.mjs creates tables with CREATE TABLE IF NOT EXISTS, so a
-- table born under an OLD definition never picks up later shape changes. The
-- prod tables predate several definitions (bare TIMESTAMP instead of
-- TIMESTAMPTZ, missing UNIQUE/FK constraints), while the newer dev DB matches
-- today's db-init — verified live by scripts/db/check-schema-parity.mjs, which
-- found 32 differences despite both migration ledgers being green.
--
-- Canonical target = src/lib/db/schema.ts + scripts/db/db-init.mjs. Most fixes
-- move PROD forward; two move DEV (redundant chats_v0_chat_id_key duplicate,
-- guest_usage constraint name) and one is mixed (versions.pinned NOT NULL —
-- schema.ts says NOT NULL, dev was nullable).
--
-- Every step is guarded + idempotent: a fresh install (db-init already
-- canonical) and a re-run are both no-ops. Verified pre-flight against prod
-- data (read-only, 2026-08-05): 0 duplicate users.email / chats.v0_chat_id /
-- guest_usage.session_id / kostnadsfri_pages.slug; 0 orphans for the FKs added
-- here (images, transactions, user_audits). Table sizes are tiny (< 200 rows),
-- so the type-change table rewrites are instant.

-- ---------------------------------------------------------------------------
-- 1) TIMESTAMP -> TIMESTAMPTZ on columns fix-timestamp-tz.sql did not cover
--    (same USING ... AT TIME ZONE 'UTC' strategy: Supabase sessions run UTC).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('app_projects',   'created_at'),
      ('app_projects',   'updated_at'),
      ('chats',          'created_at'),
      ('chats',          'updated_at'),
      ('deployments',    'created_at'),
      ('deployments',    'updated_at'),
      ('project_data',   'created_at'),
      ('project_data',   'updated_at'),
      ('projects',       'created_at'),
      ('projects',       'updated_at'),
      ('registry_cache', 'fetched_at'),
      ('registry_cache', 'updated_at'),
      ('versions',       'created_at'),
      ('versions',       'pinned_at')
    ) AS t(tbl, col)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = r.tbl
        AND column_name = r.col
        AND data_type = 'timestamp without time zone'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN %I TYPE TIMESTAMPTZ USING %I AT TIME ZONE ''UTC''',
        r.tbl, r.col, r.col
      );
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2) versions.pinned: schema.ts says NOT NULL DEFAULT false; the old
--    add-column path left it nullable on dev.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'versions'
      AND column_name = 'pinned'
      AND is_nullable = 'YES'
  ) THEN
    UPDATE versions SET pinned = FALSE WHERE pinned IS NULL;
    ALTER TABLE versions ALTER COLUMN pinned SET DEFAULT FALSE;
    ALTER TABLE versions ALTER COLUMN pinned SET NOT NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) UNIQUE constraints declared in db-init's CREATE TABLE that pre-existing
--    prod tables never received. Names match what column-level UNIQUE creates,
--    so fresh installs and dev are exact no-ops.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_email_key' AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.kostnadsfri_pages') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kostnadsfri_pages_slug_key'
      AND conrelid = 'public.kostnadsfri_pages'::regclass
  ) THEN
    ALTER TABLE kostnadsfri_pages ADD CONSTRAINT kostnadsfri_pages_slug_key UNIQUE (slug);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) chats.v0_chat_id: the canonical unique guarantee is the runtime index
--    chats_v0_chat_id_unique (db-init). The column-level UNIQUE additionally
--    created the redundant duplicate chats_v0_chat_id_key on newer installs
--    (dev) — drop it so all environments converge on one index.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS chats_v0_chat_id_unique ON chats(v0_chat_id);
ALTER TABLE chats DROP CONSTRAINT IF EXISTS chats_v0_chat_id_key;

-- ---------------------------------------------------------------------------
-- 5) guest_usage.session_id: canonical index name is guest_usage_session_idx
--    (schema.ts + db-health-check). Newer installs got the column-level
--    constraint guest_usage_session_id_key instead — converge on the index.
--    Create first, drop second: uniqueness is enforced at every point.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS guest_usage_session_idx ON guest_usage(session_id);
ALTER TABLE guest_usage DROP CONSTRAINT IF EXISTS guest_usage_session_id_key;

-- ---------------------------------------------------------------------------
-- 6) registry_cache: canonical shape (db-init) has NO id column — identity is
--    the unique (base_url, style, source) index. Prod's table was created from
--    an older definition with id SERIAL PRIMARY KEY. Pure cache data (3 rows),
--    safe to reshape; DROP COLUMN also drops registry_cache_pkey.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'registry_cache'
      AND column_name = 'id'
  ) THEN
    ALTER TABLE registry_cache DROP COLUMN id;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7) FKs declared in db-init's CREATE TABLE that pre-existing prod tables
--    never received. Pre-verified: 0 orphan rows in prod for all three, so
--    plain (validating) ADD CONSTRAINT is safe.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.images') IS NOT NULL
     AND to_regclass('public.app_projects') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'images_project_id_fkey' AND conrelid = 'public.images'::regclass
     ) THEN
    ALTER TABLE images
      ADD CONSTRAINT images_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES app_projects(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.transactions') IS NOT NULL
     AND to_regclass('public.users') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'transactions_user_id_fkey' AND conrelid = 'public.transactions'::regclass
     ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.user_audits') IS NOT NULL
     AND to_regclass('public.users') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'user_audits_user_id_fkey' AND conrelid = 'public.user_audits'::regclass
     ) THEN
    ALTER TABLE user_audits
      ADD CONSTRAINT user_audits_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 8) project_data / project_files FKs (REFERENCES app_projects(id) ON DELETE
--    CASCADE): prod has orphan child rows whose parent app_project was deleted
--    while the FK was missing (98 + 1965 rows, none newer than 2026-07-30) —
--    exactly the rows CASCADE would have removed. Delete them, then add the
--    FKs so future deletes cascade like dev.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.project_data') IS NOT NULL
     AND to_regclass('public.app_projects') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'project_data_project_id_fkey' AND conrelid = 'public.project_data'::regclass
     ) THEN
    DELETE FROM project_data t
    WHERE t.project_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM app_projects p WHERE p.id = t.project_id);
    ALTER TABLE project_data
      ADD CONSTRAINT project_data_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES app_projects(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.project_files') IS NOT NULL
     AND to_regclass('public.app_projects') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'project_files_project_id_fkey' AND conrelid = 'public.project_files'::regclass
     ) THEN
    DELETE FROM project_files t
    WHERE t.project_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM app_projects p WHERE p.id = t.project_id);
    ALTER TABLE project_files
      ADD CONSTRAINT project_files_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES app_projects(id) ON DELETE CASCADE;
  END IF;
END $$;
