-- Drop the two FKs that block own-engine publishing (P0).
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
-- Idempotent: DROP CONSTRAINT IF EXISTS. Safe to re-run.
ALTER TABLE deployments DROP CONSTRAINT IF EXISTS deployments_chat_id_fkey;
ALTER TABLE deployments DROP CONSTRAINT IF EXISTS deployments_version_id_fkey;
