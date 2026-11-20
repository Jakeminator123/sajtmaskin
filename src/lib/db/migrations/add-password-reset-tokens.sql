-- "Glömt lösenord?": engångslänkar för lösenordsåterställning.
-- Bara sha256-hashen av token lagras. Länken är tidsbegränsad (expires_at)
-- och fungerar en gång (used_at + radradering vid lyckad återställning).
-- Egen tabell i stället för kolumner på users: befintliga users-läsningar
-- (`select().from(users)`) påverkas inte innan migrationen är applicerad.
-- Idempotent; körs via BÅDE `npm run db:init` (applySqlMigrations) och
-- `npm run db:migrate`. Additiv (CREATE TABLE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash
  ON password_reset_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
  ON password_reset_tokens(user_id);

-- RLS: migrationsvägen (`npm run db:migrate`) kör bara de här SQL-filerna och
-- aldrig db-init.mjs buildRlsQueries(), så RLS + backend-policyn sätts här
-- också. Behåller repots RLS-on-all-tables-invariant.
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'password_reset_tokens'
        AND policyname = 'password_reset_tokens_backend_full_access'
    ) THEN
      CREATE POLICY password_reset_tokens_backend_full_access ON password_reset_tokens
        FOR ALL TO postgres, service_role USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;
