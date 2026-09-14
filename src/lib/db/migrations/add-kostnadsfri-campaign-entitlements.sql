-- Additive pilot entitlement: one verified invitation binds to one project,
-- then grants one completed initial version and one completed follow-up on the
-- same chat. Historical rows stay null/false and retain existing billing.
CREATE TABLE IF NOT EXISTS kostnadsfri_campaign_entitlements (
  id TEXT PRIMARY KEY,
  invitation_slug TEXT NOT NULL,
  kostnadsfri_page_id INTEGER,
  project_id TEXT NOT NULL,
  user_id TEXT,
  session_id TEXT NOT NULL,
  initial_chat_id TEXT,
  initial_version_id TEXT,
  initial_claimed_at TIMESTAMPTZ,
  followup_version_id TEXT,
  followup_claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS kostnadsfri_campaign_invitation_unique
  ON kostnadsfri_campaign_entitlements(invitation_slug);
CREATE UNIQUE INDEX IF NOT EXISTS kostnadsfri_campaign_project_unique
  ON kostnadsfri_campaign_entitlements(project_id);
CREATE INDEX IF NOT EXISTS idx_kostnadsfri_campaign_user_id
  ON kostnadsfri_campaign_entitlements(user_id);

ALTER TABLE generation_billings
  ADD COLUMN IF NOT EXISTS campaign_entitlement_id TEXT,
  ADD COLUMN IF NOT EXISTS campaign_phase TEXT,
  ADD COLUMN IF NOT EXISTS campaign_free_applied BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'generation_billings_campaign_phase_check'
      AND conrelid = 'generation_billings'::regclass
  ) THEN
    ALTER TABLE generation_billings
      ADD CONSTRAINT generation_billings_campaign_phase_check
      CHECK (
        (campaign_entitlement_id IS NULL AND campaign_phase IS NULL)
        OR
        (campaign_entitlement_id IS NOT NULL AND campaign_phase IN ('initial', 'followup'))
      );
  END IF;
END $$;

-- The marker is the durable reservation created only after successful
-- finalize. It closes the retry window even if settlement is temporarily down.
CREATE UNIQUE INDEX IF NOT EXISTS generation_billings_campaign_slot_unique
  ON generation_billings(campaign_entitlement_id, campaign_phase)
  WHERE campaign_entitlement_id IS NOT NULL;

ALTER TABLE kostnadsfri_campaign_entitlements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE kostnadsfri_campaign_entitlements FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE kostnadsfri_campaign_entitlements FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON TABLE kostnadsfri_campaign_entitlements TO service_role;
  END IF;
END $$;
