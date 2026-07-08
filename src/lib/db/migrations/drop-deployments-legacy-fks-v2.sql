-- Re-run of the deployments legacy-FK drop, under a NEW filename (v2).
--
-- Why a second file: the schema_migrations ledger tracks migrations by
-- FILENAME only. The original drop-deployments-legacy-fks.sql shipped with
-- hardcoded constraint names (deployments_chat_id_fkey /
-- deployments_version_id_fkey) and was applied + recorded on databases before
-- PR #431 upgraded its body to a catalog-based drop. On those databases the
-- ledger says "applied", so db:migrate:check stays green and the upgraded
-- logic never runs — Drizzle-named FKs (deployments_chat_id_chats_id_fk /
-- deployments_version_id_versions_id_fk) from db-push-initialized
-- environments survive and own-engine publish keeps failing. This new
-- filename is pending on every such database, forcing one re-run of the
-- catalog-based drop.
--
-- Idempotent: drops every FOREIGN KEY on deployments.chat_id/version_id
-- regardless of constraint name; a no-op where v1 (or db-init) already
-- cleaned up. Safe to re-run.
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
