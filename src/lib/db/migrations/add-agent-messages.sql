-- Sajtagentens (OpenClaw) samtal per builderchatt — beständig agenthistorik
-- för den gemensamma chatten (plan 2026-10-22 «En chatt: Sajtagenten i
-- buildern»). Egen tabell, inte engine_messages: den tabellen är byggmotorns
-- LLM-historik och får inte förorenas av agentens frågor och svar.
-- kind: 'chat' | 'internal' (maskinskapad väckning som visas som statusrad).
-- meta: { anchorBuilderMessageId, builderTarget } — ankare i tidslinjen och
-- versionen modellen såg när turen skickades.
-- Idempotent; körs via BÅDE `npm run db:init` (applySqlMigrations) och
-- `npm run db:migrate`. Additiv (CREATE TABLE IF NOT EXISTS) — klienten är
-- fail-soft tills tabellen finns.

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES engine_chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'chat',
  content TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_chat_created
  ON agent_messages(chat_id, created_at);

-- RLS: migrationsvägen (`npm run db:migrate`) kör bara de här SQL-filerna och
-- aldrig db-init.mjs buildRlsQueries(), så RLS + backend-policyn sätts här
-- också. Behåller repots RLS-on-all-tables-invariant.
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'agent_messages'
        AND policyname = 'agent_messages_backend_full_access'
    ) THEN
      CREATE POLICY agent_messages_backend_full_access ON agent_messages
        FOR ALL TO postgres, service_role USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;
