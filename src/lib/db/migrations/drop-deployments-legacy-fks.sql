-- Drop the FKs that block own-engine publishing (P0).
--
-- deployments.chat_id / deployments.version_id were created with FKs to the
-- LEGACY tables chats(id) / versions(id). The own-engine publish flow
-- (POST /api/v0/deployments -> createDeploymentRecord) writes ENGINE ids
-- (engine_chats.id / engine_versions.id), which do not exist in the legacy
-- tables -> every publish fails with a foreign-key violation on the insert
-- ("Failed query: insert into deployments ..."). Prod had 0 deployment rows
-- because of this.
--
-- The column intentionally holds ids from EITHER world (legacy v0-era chats
-- or engine chats -- the GET handler resolves both), so no single FK target
-- is correct. Referential cleanup for engine chats is handled by the app
-- (chat deletion cascades live on the engine_* tables; deployments rows are
-- historical log rows).
--
-- Idempotent: drops every FOREIGN KEY on chat_id/version_id regardless of
-- constraint name (Postgres default `deployments_chat_id_fkey` or Drizzle
-- `deployments_chat_id_chats_id_fk`). Safe to re-run.
-- Canonical body also lives in src/lib/db/deployments-legacy-fk-drop.ts.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_schema = kcu.constraint_schema
     AND tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'deployments'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name IN ('chat_id', 'version_id')
  LOOP
    EXECUTE format('ALTER TABLE deployments DROP CONSTRAINT IF EXISTS %I', r.constraint_name);
  END LOOP;
END $$;
