-- Usage-baserad kostnad och kreditdebitering per genererad version.
-- Alla ekonomiska parametrar lagras som heltal: micro-USD, öre och basis points.

ALTER TABLE llm_usage
  ADD COLUMN IF NOT EXISTS cache_write_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS cost_microusd INTEGER,
  ADD COLUMN IF NOT EXISTS pricing_version TEXT,
  ADD COLUMN IF NOT EXISTS cost_breakdown JSONB;

-- The old product grant was 50 generic coins. New accounts instead receive
-- exactly one completed own-engine generation. Existing accounts that have
-- never completed a generated version retain the entitlement; accounts with
-- generation history are backfilled as already claimed at their earliest
-- generated version.
--
-- `llm_usage` is deliberately not the historical discriminator: telemetry is
-- best-effort and older persisted generations can have no usage row. The
-- canonical persisted generation path writes an assistant `engine_messages`
-- row and the `engine_versions` row in one transaction, with `edit_kind` null.
-- Non-generative version creators are excluded by provenance/shape:
-- imported_repo, quick_edit and restore have a non-null `edit_kind`, while the
-- deterministic no-LLM F3 fork has no message_id.
ALTER TABLE users
  ALTER COLUMN diamonds SET DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_generation_available BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS free_generation_claimed_version_id TEXT,
  ADD COLUMN IF NOT EXISTS free_generation_claimed_at TIMESTAMPTZ;

WITH first_generation AS (
  SELECT DISTINCT ON (ap.user_id)
    ap.user_id,
    ev.id AS version_id,
    ev.created_at AS generated_at
  FROM app_projects ap
  JOIN engine_chats ec ON ec.project_id = ap.id
  JOIN engine_versions ev ON ev.chat_id = ec.id
  JOIN engine_messages em
    ON em.id = ev.message_id
   AND em.chat_id = ev.chat_id
   AND em.role = 'assistant'
  WHERE ap.user_id IS NOT NULL
    AND ev.edit_kind IS NULL
  ORDER BY ap.user_id, ev.created_at ASC, ev.id ASC
)
UPDATE users AS u
SET free_generation_available = FALSE,
    free_generation_claimed_version_id = COALESCE(
      u.free_generation_claimed_version_id,
      first_generation.version_id
    ),
    free_generation_claimed_at = COALESCE(
      u.free_generation_claimed_at,
      first_generation.generated_at
    )
FROM first_generation
WHERE u.id = first_generation.user_id;

CREATE TABLE IF NOT EXISTS generation_billing_settings (
  id TEXT PRIMARY KEY,
  markup_basis_points INTEGER NOT NULL DEFAULT 20000
    CHECK (markup_basis_points BETWEEN 10000 AND 100000),
  usd_to_sek_ore INTEGER NOT NULL DEFAULT 1050
    CHECK (usd_to_sek_ore BETWEEN 100 AND 10000),
  sek_per_credit_ore INTEGER NOT NULL DEFAULT 300
    CHECK (sek_per_credit_ore BETWEEN 1 AND 100000),
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO generation_billing_settings (
  id, markup_basis_points, usd_to_sek_ore, sek_per_credit_ore
)
VALUES ('generation', 20000, 1050, 300)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS generation_billings (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  user_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_cost_microusd INTEGER NOT NULL DEFAULT 0,
  provider_cost_ore INTEGER NOT NULL DEFAULT 0,
  markup_basis_points INTEGER NOT NULL,
  billable_ore INTEGER NOT NULL DEFAULT 0,
  usd_to_sek_ore INTEGER NOT NULL,
  sek_per_credit_ore INTEGER NOT NULL,
  credits_charged INTEGER NOT NULL DEFAULT 0,
  free_generation_eligible BOOLEAN NOT NULL DEFAULT TRUE,
  free_generation_applied BOOLEAN NOT NULL DEFAULT FALSE,
  claim_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  usage_started_at TIMESTAMPTZ,
  llm_calls INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  pricing_version TEXT NOT NULL,
  price_breakdown JSONB,
  transaction_ids JSONB,
  first_usage_at TIMESTAMPTZ,
  last_usage_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE generation_billings
  ADD COLUMN IF NOT EXISTS free_generation_eligible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS free_generation_applied BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS claim_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS usage_started_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS generation_billings_version_unique
  ON generation_billings(version_id);
CREATE INDEX IF NOT EXISTS idx_generation_billings_chat
  ON generation_billings(chat_id);
CREATE INDEX IF NOT EXISTS idx_generation_billings_user_created
  ON generation_billings(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_generation_billings_created
  ON generation_billings(created_at);

ALTER TABLE generation_billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_billings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'generation_billing_settings'
        AND policyname = 'generation_billing_settings_backend_full_access'
    ) THEN
      CREATE POLICY generation_billing_settings_backend_full_access
        ON generation_billing_settings
        FOR ALL TO postgres, service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'generation_billings'
        AND policyname = 'generation_billings_backend_full_access'
    ) THEN
      CREATE POLICY generation_billings_backend_full_access
        ON generation_billings
        FOR ALL TO postgres, service_role USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;
