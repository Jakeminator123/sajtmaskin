-- Additive pilot entitlement: one verified invitation binds to one project,
-- then grants one completed initial version and one completed follow-up on the
-- same chat. Historical rows stay null/false and retain existing billing.
CREATE TABLE IF NOT EXISTS public.kostnadsfri_campaign_entitlements (
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT kostnadsfri_campaign_invitation_unique UNIQUE (invitation_slug),
  CONSTRAINT kostnadsfri_campaign_project_unique UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS idx_kostnadsfri_campaign_user_id
  ON public.kostnadsfri_campaign_entitlements(user_id);

-- The first dev apply created these as standalone unique indexes. Attach that
-- exact old shape as table constraints; a missing or mismatched index falls
-- through to normal ADD CONSTRAINT and fails loudly on a name collision.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kostnadsfri_campaign_invitation_unique'
      AND conrelid = 'public.kostnadsfri_campaign_entitlements'::regclass
      AND contype = 'u'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_class idx
      JOIN pg_index i ON i.indexrelid = idx.oid
      WHERE idx.relname = 'kostnadsfri_campaign_invitation_unique'
        AND i.indrelid = 'public.kostnadsfri_campaign_entitlements'::regclass
        AND i.indisunique
        AND i.indisvalid
        AND i.indisready
        AND i.indnkeyatts = 1
        AND i.indnatts = 1
        AND i.indpred IS NULL
        AND i.indexprs IS NULL
        AND pg_get_indexdef(idx.oid, 1, TRUE) = 'invitation_slug'
    ) THEN
      ALTER TABLE public.kostnadsfri_campaign_entitlements
        ADD CONSTRAINT kostnadsfri_campaign_invitation_unique
        UNIQUE USING INDEX kostnadsfri_campaign_invitation_unique;
    ELSE
      ALTER TABLE public.kostnadsfri_campaign_entitlements
        ADD CONSTRAINT kostnadsfri_campaign_invitation_unique UNIQUE (invitation_slug);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kostnadsfri_campaign_project_unique'
      AND conrelid = 'public.kostnadsfri_campaign_entitlements'::regclass
      AND contype = 'u'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_class idx
      JOIN pg_index i ON i.indexrelid = idx.oid
      WHERE idx.relname = 'kostnadsfri_campaign_project_unique'
        AND i.indrelid = 'public.kostnadsfri_campaign_entitlements'::regclass
        AND i.indisunique
        AND i.indisvalid
        AND i.indisready
        AND i.indnkeyatts = 1
        AND i.indnatts = 1
        AND i.indpred IS NULL
        AND i.indexprs IS NULL
        AND pg_get_indexdef(idx.oid, 1, TRUE) = 'project_id'
    ) THEN
      ALTER TABLE public.kostnadsfri_campaign_entitlements
        ADD CONSTRAINT kostnadsfri_campaign_project_unique
        UNIQUE USING INDEX kostnadsfri_campaign_project_unique;
    ELSE
      ALTER TABLE public.kostnadsfri_campaign_entitlements
        ADD CONSTRAINT kostnadsfri_campaign_project_unique UNIQUE (project_id);
    END IF;
  END IF;
END $$;

ALTER TABLE public.generation_billings
  ADD COLUMN IF NOT EXISTS campaign_entitlement_id TEXT,
  ADD COLUMN IF NOT EXISTS campaign_phase TEXT,
  ADD COLUMN IF NOT EXISTS campaign_free_applied BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  -- Earlier dev applies used the same name without the explicit phase
  -- non-null arm. PostgreSQL accepts CHECK = UNKNOWN, so replace only that
  -- known weaker shape before the idempotent add below.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'generation_billings_campaign_phase_check'
      AND conrelid = 'public.generation_billings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) NOT ILIKE '%campaign_phase IS NOT NULL%'
  ) THEN
    ALTER TABLE public.generation_billings
      DROP CONSTRAINT generation_billings_campaign_phase_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'generation_billings_campaign_phase_check'
      AND conrelid = 'public.generation_billings'::regclass
      AND contype = 'c'
  ) THEN
    ALTER TABLE public.generation_billings
      ADD CONSTRAINT generation_billings_campaign_phase_check
      CHECK (
        (campaign_entitlement_id IS NULL AND campaign_phase IS NULL)
        OR
        (
          campaign_entitlement_id IS NOT NULL
          AND campaign_phase IS NOT NULL
          AND campaign_phase IN ('initial', 'followup')
        )
      );
  END IF;
END $$;

-- The marker is the durable reservation created only after successful
-- finalize. It closes the retry window even if settlement is temporarily down.
CREATE UNIQUE INDEX IF NOT EXISTS generation_billings_campaign_slot_unique
  ON public.generation_billings(campaign_entitlement_id, campaign_phase)
  WHERE campaign_entitlement_id IS NOT NULL;

ALTER TABLE public.kostnadsfri_campaign_entitlements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.kostnadsfri_campaign_entitlements FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.kostnadsfri_campaign_entitlements FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON TABLE public.kostnadsfri_campaign_entitlements TO service_role;
  END IF;
END $$;
