-- wizard_runs is a server-owned entitlement table. Wizard routes authenticate
-- with the application's custom JWT and access Postgres through the backend;
-- browser/Data API roles must never read or mutate these rows directly.
--
-- The original add-wizard-runs.sql migration created the table without RLS.
-- Supabase projects whose default privileges expose new public tables therefore
-- granted anon/authenticated SELECT, INSERT, UPDATE and DELETE until db:init's
-- separate RLS pass happened. Migration-only deploys never ran that pass.
--
-- Keep grants and RLS in this follow-up migration so both canonical entry
-- points (db:init and db:migrate) converge on the same deny-by-default state.
-- PUBLIC is revoked as defense in depth; direct grants to Supabase's two client
-- roles are revoked separately. postgres remains the table owner. service_role
-- keeps explicit table privileges and a policy for vanilla Postgres, where the
-- local compatibility role does not have Supabase's BYPASSRLS attribute.
--
-- Role guards keep the migration runnable on ordinary Postgres installations
-- that do not define Supabase roles. Re-running it is safe.

DO $$
BEGIN
  IF to_regclass('public.wizard_runs') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.wizard_runs ENABLE ROW LEVEL SECURITY';
  EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.wizard_runs FROM PUBLIC';

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.wizard_runs FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.wizard_runs FROM authenticated';
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS wizard_runs_backend_full_access ON public.wizard_runs';

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT ALL PRIVILEGES ON TABLE public.wizard_runs TO service_role';
    EXECUTE $policy$
      CREATE POLICY wizard_runs_backend_full_access ON public.wizard_runs
        FOR ALL
        TO postgres, service_role
        USING (true)
        WITH CHECK (true)
    $policy$;
  ELSE
    EXECUTE $policy$
      CREATE POLICY wizard_runs_backend_full_access ON public.wizard_runs
        FOR ALL
        TO postgres
        USING (true)
        WITH CHECK (true)
    $policy$;
  END IF;
END
$$;
