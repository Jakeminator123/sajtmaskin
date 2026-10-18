-- Additive per-message history for the kostnadsfri campaign. The legacy
-- kostnadsfri_pages.sent_at/source fields remain the compatibility register;
-- follow-up messages live here and never rewrite the first company-level send.
CREATE TABLE IF NOT EXISTS public.kostnadsfri_mail_events (
  message_id TEXT PRIMARY KEY,
  kostnadsfri_page_id INTEGER,
  slug TEXT NOT NULL,
  recipient TEXT NOT NULL,
  sender TEXT NOT NULL,
  flow_id TEXT NOT NULL,
  step TEXT NOT NULL CHECK (step IN ('first', 'follow')),
  variant TEXT NOT NULL CHECK (variant IN ('text', 'animated')),
  scheduled_at TIMESTAMPTZ,
  smtp_accepted_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  outcome TEXT NOT NULL CHECK (outcome IN ('scheduled', 'accepted', 'uncertain', 'failed')),
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kostnadsfri_mail_events_slug_created
  ON public.kostnadsfri_mail_events(slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kostnadsfri_mail_events_flow_id
  ON public.kostnadsfri_mail_events(flow_id);

-- Optional correlation on the already server-owned campaign entitlement.
-- Existing rows stay NULL and retain their historical meaning.
ALTER TABLE public.kostnadsfri_campaign_entitlements
  ADD COLUMN IF NOT EXISTS mail_message_id TEXT;

ALTER TABLE public.kostnadsfri_mail_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.kostnadsfri_mail_events FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.kostnadsfri_mail_events FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON TABLE public.kostnadsfri_mail_events TO service_role;
  END IF;
END $$;
