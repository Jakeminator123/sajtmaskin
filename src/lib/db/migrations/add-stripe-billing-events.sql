-- D2: beständig Stripe event-ID-idempotens för sajt-abonnemang.
-- Skild från periodförmånens unikhet i subscription_credit_grants.
-- Retriable fel ska kunna ligga kvar som processing/failed så Stripe kan
-- retrysa — de kvitteras inte som completed.
--
-- Additiv CREATE TABLE IF NOT EXISTS. Appliceras INTE av D2-PR:n;
-- ägaren kör migrationen mot den delade preview/prod-databasen.
CREATE TABLE IF NOT EXISTS stripe_billing_events (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  billing_mode TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  lease_expires_at TIMESTAMPTZ,
  last_error TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT stripe_billing_events_mode_check
    CHECK (billing_mode IN ('test', 'live')),
  CONSTRAINT stripe_billing_events_status_check
    CHECK (status IN ('processing', 'completed', 'failed')),
  CONSTRAINT stripe_billing_events_event_id_unique
    UNIQUE (event_id)
);

CREATE INDEX IF NOT EXISTS idx_stripe_billing_events_status
  ON stripe_billing_events (status, created_at);

ALTER TABLE stripe_billing_events ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  REVOKE ALL PRIVILEGES ON TABLE public.stripe_billing_events FROM PUBLIC;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL PRIVILEGES ON TABLE public.stripe_billing_events FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON TABLE public.stripe_billing_events FROM authenticated;
  END IF;

  DROP POLICY IF EXISTS stripe_billing_events_backend_full_access
    ON public.stripe_billing_events;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL PRIVILEGES ON TABLE public.stripe_billing_events TO service_role;
    CREATE POLICY stripe_billing_events_backend_full_access
      ON public.stripe_billing_events
      FOR ALL TO postgres, service_role USING (true) WITH CHECK (true);
  ELSE
    CREATE POLICY stripe_billing_events_backend_full_access
      ON public.stripe_billing_events
      FOR ALL TO postgres USING (true) WITH CHECK (true);
  END IF;
END
$$;
