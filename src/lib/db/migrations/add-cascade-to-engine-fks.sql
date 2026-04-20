-- Add ON DELETE CASCADE to four FKs that previously blocked engine_chats /
-- engine_versions deletion. Postgres doesn't support `ALTER CONSTRAINT ...
-- ON DELETE CASCADE`, so we DROP IF EXISTS + ADD. Idempotent: safe to run
-- multiple times.
--
-- Why: deleting a row in engine_chats / engine_versions used to require
-- manually emptying generation_telemetry, version_comments, version_approvals
-- first (see scripts/db/cleanup-test-projects.mjs). With cascade, Postgres
-- handles the chain.
--
-- Constraint names follow Postgres default `{table}_{column}_fkey`.

-- generation_telemetry.chat_id → engine_chats.id (CASCADE)
ALTER TABLE generation_telemetry
  DROP CONSTRAINT IF EXISTS generation_telemetry_chat_id_fkey;
ALTER TABLE generation_telemetry
  ADD CONSTRAINT generation_telemetry_chat_id_fkey
  FOREIGN KEY (chat_id) REFERENCES engine_chats(id) ON DELETE CASCADE;

-- generation_telemetry.version_id → engine_versions.id (CASCADE)
ALTER TABLE generation_telemetry
  DROP CONSTRAINT IF EXISTS generation_telemetry_version_id_fkey;
ALTER TABLE generation_telemetry
  ADD CONSTRAINT generation_telemetry_version_id_fkey
  FOREIGN KEY (version_id) REFERENCES engine_versions(id) ON DELETE CASCADE;

-- version_comments.chat_id → engine_chats.id (CASCADE)
ALTER TABLE version_comments
  DROP CONSTRAINT IF EXISTS version_comments_chat_id_fkey;
ALTER TABLE version_comments
  ADD CONSTRAINT version_comments_chat_id_fkey
  FOREIGN KEY (chat_id) REFERENCES engine_chats(id) ON DELETE CASCADE;

-- version_approvals.chat_id → engine_chats.id (CASCADE)
ALTER TABLE version_approvals
  DROP CONSTRAINT IF EXISTS version_approvals_chat_id_fkey;
ALTER TABLE version_approvals
  ADD CONSTRAINT version_approvals_chat_id_fkey
  FOREIGN KEY (chat_id) REFERENCES engine_chats(id) ON DELETE CASCADE;
