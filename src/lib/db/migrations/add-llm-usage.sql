-- Tokenförbrukning per LLM-anrop (fas, modell, ägare).
--
-- Kompletterar engine_generation_logs (per chat) och generation_telemetry (per
-- version) i stället för att ersätta dem: de bär codegen-strömmens siffror och
-- har egna konsumenter. Den här tabellen svarar på vad VARJE fas kostade —
-- inklusive Deep Brief, verifier, RepairGate, embeddings och klassificerarna,
-- vars usage tidigare kastades.
--
-- Inga FK: förbrukningen är en ekonomisk händelse som ska överleva att chatten
-- städas bort, och anrop sker även innan en version finns (brief, scaffold-val).
CREATE TABLE IF NOT EXISTS llm_usage (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  chat_id TEXT,
  version_id TEXT,
  user_id TEXT,
  session_id TEXT,
  phase TEXT NOT NULL,
  workload TEXT,
  provider TEXT,
  model TEXT NOT NULL,
  model_tier TEXT,
  input_tokens INTEGER,
  cached_input_tokens INTEGER,
  output_tokens INTEGER,
  reasoning_tokens INTEGER,
  duration_ms INTEGER,
  ok BOOLEAN NOT NULL DEFAULT TRUE,
  error_code TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_chat ON llm_usage(chat_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_version ON llm_usage(version_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_user_created ON llm_usage(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_llm_usage_created ON llm_usage(created_at);

-- RLS: prod-migrationsvägen (`npm run db:migrate`) kör bara dessa SQL-filer och
-- aldrig db-init.mjs:s buildRlsQueries(), så aktivera RLS + backend-policyn här
-- också. Håller repots RLS-på-alla-tabeller-invariant för migrerade miljöer.
ALTER TABLE llm_usage ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'llm_usage'
        AND policyname = 'llm_usage_backend_full_access'
    ) THEN
      CREATE POLICY llm_usage_backend_full_access ON llm_usage
        FOR ALL TO postgres, service_role USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;
