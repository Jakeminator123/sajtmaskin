-- D1, uppföljning: gör abonnemangstabellerna kompletta ÄVEN i en databas som
-- redan fick den första versionen av dem.
--
-- Varför en egen fil. `add-site-subscriptions.sql` är ägaren av formen, men den
-- är byggd av `CREATE TABLE IF NOT EXISTS`. Så snart tabellen finns är hela
-- satsen en no-op: nya constraints i tabellkroppen når ALDRIG en databas där
-- den första versionen redan kördes (delade dev är exakt det fallet, och
-- ledgern gör dessutom att filen aldrig körs om). Att droppa och återskapa
-- tabellerna för hand är inget en annan maskin, CI eller en framtida
-- preview-apply kan förlita sig på. Den här filen är därför uppgraderingsvägen:
-- varje namngiven constraint i ägarfilen läggs till idempotent, och de FK:er
-- som fick fel form i första versionen byts ut.
--
-- Idempotensmönstret, en constraint per block:
--
--   DO $$ BEGIN
--     ALTER TABLE t ADD CONSTRAINT c ...;
--   EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
--
-- `ADD CONSTRAINT` saknar `IF NOT EXISTS` i Postgres. `duplicate_object` är
-- utfallet när constrainten redan finns; `duplicate_table` är utfallet när ett
-- index med samma namn redan backar en unikhet. Båda betyder "redan uppfyllt".
-- En färsk databas får alltså allt från ägarfilen och passerar den här filen
-- utan att ändra något.
--
-- FK-bytena är villkorade på KATALOGEN, inte blinda. En DROP körs bara när den
-- gamla, felaktiga formen faktiskt ligger där (`confdeltype = 'c'` = ON DELETE
-- CASCADE, eller ett enkolumnigt FK som ersatts av en tupel). Skulle ADD
-- misslyckas efter en DROP är omkörning ofarlig: DROP-villkoret matchar inte
-- längre och ADD försöker igen.
--
-- Additiv i grindens mening: inga fristående unika index, ingen DROP TABLE,
-- ingen DROP COLUMN och ingen datamutation. De ADD CONSTRAINT som finns här
-- riktar sig uteslutande mot tabeller som samma pending-omgång själv skapar och
-- som ännu inte finns i måldatabasen — se `check-additive-migrations.mjs`, som
-- avgör det mot katalogen och inte på förtroende.

-- ── billing_customers ────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE billing_customers ADD CONSTRAINT billing_customers_mode_check
    CHECK (billing_mode IN ('test', 'live'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- Första versionen lät en raderad användare ta kundraden med sig, och därmed
-- (via kedjan nedan) hela bokföringen. D3 säger ingen automatisk radering.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'billing_customers'::regclass
       AND contype = 'f'
       AND confdeltype = 'c'
       AND conname IN ('billing_customers_user_id_fkey', 'billing_customers_user_fk')
  ) THEN
    ALTER TABLE billing_customers DROP CONSTRAINT IF EXISTS billing_customers_user_id_fkey;
    ALTER TABLE billing_customers DROP CONSTRAINT IF EXISTS billing_customers_user_fk;
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE billing_customers ADD CONSTRAINT billing_customers_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE billing_customers ADD CONSTRAINT billing_customers_user_mode_unique
    UNIQUE (user_id, billing_mode);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE billing_customers ADD CONSTRAINT billing_customers_stripe_customer_unique
    UNIQUE (billing_mode, stripe_customer_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- Måltupeln för abonnemangets kundlänk.
DO $$ BEGIN
  ALTER TABLE billing_customers ADD CONSTRAINT billing_customers_id_user_mode_unique
    UNIQUE (id, user_id, billing_mode);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- ── site_subscriptions ───────────────────────────────────────────────────────

-- Tupelnycklarna FÖRST: grants och jobb nedan refererar dem.
DO $$ BEGIN
  ALTER TABLE site_subscriptions ADD CONSTRAINT site_subscriptions_id_mode_unique
    UNIQUE (id, billing_mode);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE site_subscriptions ADD CONSTRAINT site_subscriptions_id_user_unique
    UNIQUE (id, user_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'site_subscriptions'::regclass
       AND contype = 'f'
       AND confdeltype = 'c'
       AND conname IN ('site_subscriptions_user_id_fkey', 'site_subscriptions_user_fk')
  ) THEN
    ALTER TABLE site_subscriptions DROP CONSTRAINT IF EXISTS site_subscriptions_user_id_fkey;
    ALTER TABLE site_subscriptions DROP CONSTRAINT IF EXISTS site_subscriptions_user_fk;
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE site_subscriptions ADD CONSTRAINT site_subscriptions_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- Den enkolumniga kundlänken kontrollerade bara att id:t fanns: en betalande
-- kunds abonnemang kunde peka på en annan användares kundrad, eller på en
-- kundrad i det andra Stripe-läget. Ersätts av hela tupeln.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'site_subscriptions'::regclass
       AND conname = 'site_subscriptions_billing_customer_id_fkey'
  ) THEN
    ALTER TABLE site_subscriptions
      DROP CONSTRAINT site_subscriptions_billing_customer_id_fkey;
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE site_subscriptions ADD CONSTRAINT site_subscriptions_customer_fk
    FOREIGN KEY (billing_customer_id, user_id, billing_mode)
    REFERENCES billing_customers (id, user_id, billing_mode) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE site_subscriptions ADD CONSTRAINT site_subscriptions_mode_check
    CHECK (billing_mode IN ('test', 'live'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE site_subscriptions ADD CONSTRAINT site_subscriptions_lifecycle_check
    CHECK (lifecycle_state IN ('checkout_pending', 'active', 'ended'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE site_subscriptions ADD CONSTRAINT site_subscriptions_desired_check
    CHECK (hosting_state_desired IN ('active', 'grace', 'paused'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE site_subscriptions ADD CONSTRAINT site_subscriptions_actual_check
    CHECK (hosting_state_actual IN ('active', 'pausing', 'paused', 'resuming'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE site_subscriptions ADD CONSTRAINT site_subscriptions_ended_at_check
    CHECK ((lifecycle_state = 'ended') = (ended_at IS NOT NULL));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE site_subscriptions ADD CONSTRAINT site_subscriptions_open_claim_unique
    UNIQUE (open_claim_key);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE site_subscriptions ADD CONSTRAINT site_subscriptions_stripe_subscription_unique
    UNIQUE (billing_mode, stripe_subscription_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE site_subscriptions ADD CONSTRAINT site_subscriptions_checkout_session_unique
    UNIQUE (billing_mode, stripe_checkout_session_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- ── subscription_credit_grants ───────────────────────────────────────────────

-- Den enkolumniga abonnemangslänken lät en live-grant peka på ett
-- testabonnemang och en grant bokföras på ett annat konto än abonnemangets
-- ägare. Ersätts av två tupler: läge respektive ägare.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'subscription_credit_grants'::regclass
       AND conname = 'subscription_credit_grants_subscription_id_fkey'
  ) THEN
    ALTER TABLE subscription_credit_grants
      DROP CONSTRAINT subscription_credit_grants_subscription_id_fkey;
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE subscription_credit_grants
    ADD CONSTRAINT subscription_credit_grants_subscription_mode_fk
    FOREIGN KEY (subscription_id, billing_mode)
    REFERENCES site_subscriptions (id, billing_mode) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE subscription_credit_grants
    ADD CONSTRAINT subscription_credit_grants_subscription_owner_fk
    FOREIGN KEY (subscription_id, user_id)
    REFERENCES site_subscriptions (id, user_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'subscription_credit_grants'::regclass
       AND contype = 'f'
       AND confdeltype = 'c'
       AND conname IN (
         'subscription_credit_grants_user_id_fkey',
         'subscription_credit_grants_user_fk'
       )
  ) THEN
    ALTER TABLE subscription_credit_grants
      DROP CONSTRAINT IF EXISTS subscription_credit_grants_user_id_fkey;
    ALTER TABLE subscription_credit_grants
      DROP CONSTRAINT IF EXISTS subscription_credit_grants_user_fk;
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE subscription_credit_grants ADD CONSTRAINT subscription_credit_grants_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE subscription_credit_grants ADD CONSTRAINT subscription_credit_grants_mode_check
    CHECK (billing_mode IN ('test', 'live'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE subscription_credit_grants ADD CONSTRAINT subscription_credit_grants_status_check
    CHECK (status IN ('pending', 'granted', 'skipped', 'simulated'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE subscription_credit_grants ADD CONSTRAINT subscription_credit_grants_credits_check
    CHECK (credits >= 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE subscription_credit_grants
    ADD CONSTRAINT subscription_credit_grants_period_id_check
    CHECK (strpos(period_id, ':') = 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE subscription_credit_grants
    ADD CONSTRAINT subscription_credit_grants_test_ledger_check
    CHECK (billing_mode = 'live' OR transaction_id IS NULL);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- PostgreSQLs UNIQUE tillåter flera NULL: väntande/testgrants kan vara
-- olänkade, men samma ledgertransaktion får inte styrka två periodförmåner.
DO $$ BEGIN
  ALTER TABLE subscription_credit_grants
    ADD CONSTRAINT subscription_credit_grants_transaction_unique
    UNIQUE (transaction_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE subscription_credit_grants ADD CONSTRAINT subscription_credit_grants_period_unique
    UNIQUE (billing_mode, subscription_id, period_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- ── billing_jobs ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'billing_jobs'::regclass
       AND conname = 'billing_jobs_subscription_id_fkey'
  ) THEN
    ALTER TABLE billing_jobs DROP CONSTRAINT billing_jobs_subscription_id_fkey;
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE billing_jobs ADD CONSTRAINT billing_jobs_subscription_mode_fk
    FOREIGN KEY (subscription_id, billing_mode)
    REFERENCES site_subscriptions (id, billing_mode) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE billing_jobs ADD CONSTRAINT billing_jobs_mode_check
    CHECK (billing_mode IN ('test', 'live'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE billing_jobs ADD CONSTRAINT billing_jobs_kind_check
    CHECK (kind IN ('pause', 'resume'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE billing_jobs ADD CONSTRAINT billing_jobs_status_check
    CHECK (status IN ('pending', 'running', 'done', 'failed'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE billing_jobs ADD CONSTRAINT billing_jobs_attempts_check
    CHECK (attempts >= 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE billing_jobs ADD CONSTRAINT billing_jobs_open_unique
    UNIQUE (open_job_key);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
