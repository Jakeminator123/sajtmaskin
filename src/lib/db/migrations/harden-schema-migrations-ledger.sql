-- Deny-by-default på migrationsledgern `public.schema_migrations` (SM-057).
--
-- Bakgrund: Supabase-projektets `public`-schema har default-privilegier som ger
-- ALLA rättigheter till `anon` och `authenticated` på varje ny tabell
-- (`pg_default_acl`: anon=arwdDxtm, authenticated=arwdDxtm). Appens övriga
-- tabeller räddas av att de har RLS påslaget — ledgern hade det inte, eftersom
-- den skapas av `scripts/db/migration-ledger.mjs#ensureMigrationLedger` med ett
-- rent `CREATE TABLE IF NOT EXISTS` utanför migrationsordningen.
--
-- Följden (verifierat i både dev och prod 2026-08-19, Supabase-lintern
-- `rls_disabled_in_public`, level ERROR, facing EXTERNAL): en klient med den
-- publika anon-nyckeln kunde läsa, skriva, radera och TRUNCATE:a ledgern över
-- PostgREST. Det ger ingen väg till appdata och kan inte hoppa över
-- migrationskod, men det förgiftar de gates som LÄSER ledgern
-- (`check-migrations-applied.mjs` → `prod-migrations-applied`) och kan i värsta
-- fall få en runner att tro att inget är applicerat och köra om migrationer som
-- inte är idempotenta.
--
-- Varför RLS räcker för att stoppa det: tabellägaren är `postgres`, samma roll
-- som både appen och migrationsrunnern ansluter med (`POSTGRES_URL`). En
-- tabellägare kringgår RLS (utan `FORCE ROW LEVEL SECURITY`), så ledgern
-- fortsätter fungera för runnern medan `anon`/`authenticated` — som går via
-- PostgREST med sina egna roller — möter deny-by-default utan policies.
-- REVOKE:en är andra försvarslinjen och gör avsikten läsbar i ACL:en.
--
-- `service_role` behålls avsiktligt: den är serverns egen adminroll.
--
-- Idempotent: `ENABLE ROW LEVEL SECURITY` och `REVOKE` går att köra om.
-- Rollguarderna gör migrationen körbar mot en vanlig Postgres utan Supabases
-- roller (lokal utveckling), där ett rått `REVOKE ... FROM anon` annars skulle
-- falla på 42704 undefined_object.
--
-- Syskon: `ensureMigrationLedger` skapar och låser ledgern i EN sats, så en
-- ledger som skapas på nytt efter att den här migrationen redan bokförts inte
-- föds vidöppen igen — och inte heller kan fastna committad men öppen om
-- körningen dör mitt i.

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY';

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.schema_migrations FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.schema_migrations FROM authenticated';
  END IF;
END
$$;
