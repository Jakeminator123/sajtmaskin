-- D1: abonnemangsdata per publicerad sajt och per Stripe-läge. ENDAST schema —
-- ingen checkout, ingen webhook, ingen worker och inget Stripe-anrop aktiveras
-- av den här migrationen. Fyra nya tabeller, inga skrivare ännu.
--
-- Varför per sajt och inte per konto: ett abonnemang hör till `app_projects.id`.
-- Ompublicering skapar en ny deployment men samma projekt, och ett extra
-- domänalias är fortfarande samma projekt — ingen av dem får skapa en andra
-- betalning. `users.tier` är därför INTE auktoritet för om en sajt får vara
-- publicerad; ett konto kan ha en aktiv och en pausad sajt samtidigt.
--
-- Varför per läge: Vercel Preview och Production läser SAMMA prod-Postgres
-- (config/db-targets.json), så en Stripe-testkund och en riktig kund lever i
-- samma tabeller. Ett enda `users.stripe_customer_id` räcker inte. Varje
-- extern identitet bär därför `billing_mode` ('test' | 'live') i sin unikhet,
-- och `billing_mode` ägs av betrodd serverkonfiguration plus verifierade
-- Stripe-händelser — aldrig av ett requestbody-fält.
--
-- Additiv i den mening `npm run db:migrate:additive-check` kräver: fyra
-- `CREATE TABLE IF NOT EXISTS` + icke-unika `CREATE INDEX IF NOT EXISTS`.
-- All unikhet deklareras som tabellinterna constraints i CREATE TABLE i
-- stället för fristående unika index. Det är inte ett kringgående av grinden:
-- en unikhet som föds tillsammans med en tom tabell kan per definition inte
-- ogiltigförklara en INSERT i den gamla produktionskod som läser samma
-- databas, eftersom ingen sådan INSERT finns. Effekten i databasen är samma
-- unika btree-index.
--
-- "Högst ett pågående abonnemang per (projekt, läge)" uttrycks med en STORED
-- generated column som är NULL för avslutade rader. Postgres tillåter flera
-- NULL i en UNIQUE, så historiska avslutade abonnemang bevaras i full längd
-- samtidigt som bara ETT öppet anspråk kan finnas. Det ger samma garanti som
-- ett partiellt unikt index, men uttryckt så att både Drizzle och den
-- additiva grinden kan läsa den. Constrainten är den enda auktoriteten:
-- två samtidiga checkout-anrop avgörs av 23505, inte av en UI-disable.
--
-- Idempotent; körs via BÅDE `npm run db:init` (applySqlMigrations) och
-- `npm run db:migrate`.

-- Stripe-kundidentitet per användare OCH läge. Unik `(user_id, billing_mode)`
-- gör att samma konto kan ha både en testkund och en riktig kund utan att den
-- ena skriver över den andra. Unik `(billing_mode, stripe_customer_id)` gör
-- att samma Stripe-kund inte kan kopplas till två konton inom ett läge.
CREATE TABLE IF NOT EXISTS billing_customers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  billing_mode TEXT NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_customers_mode_check
    CHECK (billing_mode IN ('test', 'live')),
  CONSTRAINT billing_customers_user_mode_unique
    UNIQUE (user_id, billing_mode),
  CONSTRAINT billing_customers_stripe_customer_unique
    UNIQUE (billing_mode, stripe_customer_id)
);

-- Ett abonnemang per publicerad sajt och läge.
--
-- Tre AVSIKTLIGT separata tillståndsaxlar, eftersom de kan säga emot varandra:
--
--   1. `lifecycle_state` — vårt eget anspråk på projektet. 'checkout_pending'
--      och 'active' håller platsen; 'ended' släpper den. Ett uppsagt
--      abonnemang som ännu inte nått periodslut är fortfarande 'active' med
--      `cancel_at_period_end` satt: kunden har betalat perioden och ingen
--      annan betalning får startas för samma sajt under tiden.
--   2. `stripe_status` — Stripes egen råa status, lagrad som den kom in.
--      `past_due` betyder INTE att sajten är pausad; under respit är den live.
--   3. `hosting_state_desired` / `hosting_state_actual` — vad driften ska vara
--      respektive vad den bekräftat är. En begärd paus är inte en genomförd
--      paus: `actual` står i 'pausing' tills provideråtgärden och HTTP har
--      bekräftat den. Ett providerfel får aldrig bokföras som 'paused'.
--
-- Policyfälten följer D3: `grace_until` (7 dagar live efter misslyckad
-- förnyelse), `cancel_at_period_end` (uppsägning gäller efter betald period),
-- `retain_until` (minst 90 dagar bevarande räknat från FAKTISK paus, inte från
-- Stripe-statusbytet) och `last_published_ref` (den senast fungerande
-- publicerade artefakten som ägaren kan återställa med ett klick — aldrig
-- senaste utkastet).
--
-- FK mot `app_projects` är `ON DELETE RESTRICT` med flit. Bokföringsdata ska
-- inte kunna försvinna för att någon rensar ett projekt, och MVP har ingen
-- automatisk radering. Den operatörsstyrda avslutsprocessen ägs av D3.
CREATE TABLE IF NOT EXISTS site_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES app_projects(id) ON DELETE RESTRICT,
  billing_mode TEXT NOT NULL,
  -- Bekvämlighetslänk. Den logiska kopplingen är (user_id, billing_mode), så
  -- checkout kan skapa anspråksraden innan Stripe-kunden finns.
  billing_customer_id TEXT REFERENCES billing_customers(id) ON DELETE SET NULL,

  -- Extern identitet. Båda är NULL innan respektive Stripe-objekt existerar;
  -- UNIQUE tillåter flera NULL, så en oavslutad checkout blockerar inget.
  stripe_subscription_id TEXT,
  stripe_checkout_session_id TEXT,
  -- Prisversionen kunden faktiskt godkände (Stripe price-id eller intern
  -- prisreferens). Fryst vid checkout: en senare prisändring får inte ändra
  -- vad ett löpande abonnemang kostar.
  price_ref TEXT,
  currency TEXT,
  -- Belopp i ÖRE. Stripe debiterar heltal i minsta enhet; en SEK-avrundad
  -- siffra hade behövt rundas om vid debitering (samma skäl som domain_orders).
  amount_ore INTEGER,
  stripe_status TEXT,

  lifecycle_state TEXT NOT NULL DEFAULT 'checkout_pending',
  ended_reason TEXT,
  ended_at TIMESTAMPTZ,

  hosting_state_desired TEXT NOT NULL DEFAULT 'active',
  hosting_state_actual TEXT NOT NULL DEFAULT 'active',
  pause_requested_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  resumed_at TIMESTAMPTZ,

  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  cancel_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  grace_until TIMESTAMPTZ,
  retain_until TIMESTAMPTZ,

  last_published_ref TEXT,
  last_published_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Anspråksnyckeln. NULL så snart raden är avslutad, vilket frigör sajten för
  -- ett nytt abonnemang utan att den historiska raden rörs.
  open_claim_key TEXT GENERATED ALWAYS AS (
    CASE
      WHEN lifecycle_state <> 'ended' THEN billing_mode || ':' || project_id
    END
  ) STORED,

  CONSTRAINT site_subscriptions_mode_check
    CHECK (billing_mode IN ('test', 'live')),
  CONSTRAINT site_subscriptions_lifecycle_check
    CHECK (lifecycle_state IN ('checkout_pending', 'active', 'ended')),
  CONSTRAINT site_subscriptions_desired_check
    CHECK (hosting_state_desired IN ('active', 'grace', 'paused')),
  CONSTRAINT site_subscriptions_actual_check
    CHECK (hosting_state_actual IN ('active', 'pausing', 'paused', 'resuming')),
  -- En avslutad rad måste bära sin sluttid, och en levande rad får inte bära
  -- en. Annars går det inte att svara på "när slutade den" i efterhand.
  CONSTRAINT site_subscriptions_ended_at_check
    CHECK ((lifecycle_state = 'ended') = (ended_at IS NOT NULL)),
  CONSTRAINT site_subscriptions_open_claim_unique
    UNIQUE (open_claim_key),
  CONSTRAINT site_subscriptions_stripe_subscription_unique
    UNIQUE (billing_mode, stripe_subscription_id),
  CONSTRAINT site_subscriptions_checkout_session_unique
    UNIQUE (billing_mode, stripe_checkout_session_id)
);

-- Kreditgrant per giltig betald abonnemangsperiod.
--
-- Nyckeldesign (D1 beslutar den, D2 skriver koden): den logiska periodförmånen
-- identifieras av (billing_mode, subscription_id, period_id). Att en webhook
-- är idempotent och att själva periodförmånen är idempotent är två olika
-- saker — en omlevererad `invoice.paid` och en manuell reparationskörning ska
-- båda landa på samma rad här.
--
-- `ledger_idempotency_key` är exakt den sträng en LIVE-grant senare ska skriva
-- som `transactions.idempotency_key`. Den är genererad av databasen så att
-- ingen framtida kodväg kan bygga den lite annorlunda och därmed dubbelgranta.
-- Nyckeln blir unik via periodunikheten nedan; `period_id` får inte innehålla
-- avgränsaren, annars vore sammanfogningen tvetydig.
--
-- Testläget får ALDRIG röra gemensamma `users.diamonds`: `transaction_id` är
-- spärrad till live av en CHECK, så en testgrant kan inte peka på en rad i den
-- delade ledgern ens om koden försöker.
CREATE TABLE IF NOT EXISTS subscription_credit_grants (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES site_subscriptions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  billing_mode TEXT NOT NULL,
  -- Stabil identitet för den betalda perioden (t.ex. Stripe invoice-id).
  period_id TEXT NOT NULL,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  credits INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  -- Bara live. Raden i den gemensamma creditledgern som faktiskt flyttade saldo.
  transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  ledger_idempotency_key TEXT GENERATED ALWAYS AS (
    'site_sub_period:' || billing_mode || ':' || subscription_id || ':' || period_id
  ) STORED,

  CONSTRAINT subscription_credit_grants_mode_check
    CHECK (billing_mode IN ('test', 'live')),
  CONSTRAINT subscription_credit_grants_status_check
    CHECK (status IN ('pending', 'granted', 'skipped', 'simulated')),
  CONSTRAINT subscription_credit_grants_credits_check
    CHECK (credits >= 0),
  CONSTRAINT subscription_credit_grants_period_id_check
    CHECK (strpos(period_id, ':') = 0),
  CONSTRAINT subscription_credit_grants_test_ledger_check
    CHECK (billing_mode = 'live' OR transaction_id IS NULL),
  CONSTRAINT subscription_credit_grants_period_unique
    UNIQUE (billing_mode, subscription_id, period_id)
);

-- Beständigt åtgärdsanspråk för paus/återställning. SCHEMA ENDAST — ingen
-- worker, inget schemalagt jobb och ingen provideranrop läggs till här.
--
-- Poängen med en tabell i stället för ett minnesjobb: pausen består av ett
-- provideranrop OCH en databasskrivning. Går skrivningen fel efter anropet får
-- jobbet inte försvinna — raden ligger kvar som 'running' med `provider_ref`
-- från anropet, och nästa körning kan stämma av i stället för att pausa igen.
--
-- `open_job_key` (NULL när jobbet är färdigt) ger högst ETT öppet jobb per
-- (abonnemang, typ), så en avstämningskörning som startar två gånger inte kan
-- beställa två pausningar av samma sajt.
CREATE TABLE IF NOT EXISTS billing_jobs (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES site_subscriptions(id) ON DELETE CASCADE,
  billing_mode TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  -- Vad providern svarade (deployment-/alias-referens), så ett DB-fel efter
  -- anropet kan stämmas av i stället för att köras om blint.
  provider_ref TEXT,
  last_error TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  open_job_key TEXT GENERATED ALWAYS AS (
    CASE
      WHEN status IN ('pending', 'running') THEN kind || ':' || subscription_id
    END
  ) STORED,

  CONSTRAINT billing_jobs_mode_check
    CHECK (billing_mode IN ('test', 'live')),
  CONSTRAINT billing_jobs_kind_check
    CHECK (kind IN ('pause', 'resume')),
  CONSTRAINT billing_jobs_status_check
    CHECK (status IN ('pending', 'running', 'done', 'failed')),
  CONSTRAINT billing_jobs_attempts_check
    CHECK (attempts >= 0),
  CONSTRAINT billing_jobs_open_unique
    UNIQUE (open_job_key)
);

CREATE INDEX IF NOT EXISTS idx_billing_customers_user
  ON billing_customers (user_id);
CREATE INDEX IF NOT EXISTS idx_site_subscriptions_user
  ON site_subscriptions (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_site_subscriptions_project
  ON site_subscriptions (project_id);
CREATE INDEX IF NOT EXISTS idx_site_subscriptions_mode_lifecycle
  ON site_subscriptions (billing_mode, lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_site_subscriptions_period_end
  ON site_subscriptions (current_period_end);
CREATE INDEX IF NOT EXISTS idx_site_subscriptions_grace_until
  ON site_subscriptions (grace_until);
CREATE INDEX IF NOT EXISTS idx_subscription_credit_grants_subscription
  ON subscription_credit_grants (subscription_id, created_at);
CREATE INDEX IF NOT EXISTS idx_subscription_credit_grants_user
  ON subscription_credit_grants (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_billing_jobs_runnable
  ON billing_jobs (status, run_after);
CREATE INDEX IF NOT EXISTS idx_billing_jobs_subscription
  ON billing_jobs (subscription_id);

-- Deny-by-default, samma hårdhet som wizard_runs och av samma skäl: de här
-- tabellerna är server-ägd betalnings- och behörighetsdata, och Supabases
-- default-privilegier ger annars anon/authenticated rättigheter på nya
-- publika tabeller. RLS ensamt räcker inte för en migration-only-deploy, så
-- grants revokeras här och inte bara i db-init:s separata RLS-pass.
--
-- Rollvakterna gör migrationen körbar på vanlig Postgres (CI) som saknar
-- Supabases roller. Omkörning är säker.
DO $$
DECLARE
  billing_table TEXT;
BEGIN
  FOREACH billing_table IN ARRAY ARRAY[
    'billing_customers',
    'site_subscriptions',
    'subscription_credit_grants',
    'billing_jobs'
  ]
  LOOP
    IF to_regclass('public.' || billing_table) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', billing_table);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', billing_table);

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon', billing_table);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM authenticated', billing_table);
    END IF;

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      billing_table || '_backend_full_access',
      billing_table
    );

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO service_role', billing_table);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO postgres, service_role USING (true) WITH CHECK (true)',
        billing_table || '_backend_full_access',
        billing_table
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO postgres USING (true) WITH CHECK (true)',
        billing_table || '_backend_full_access',
        billing_table
      );
    END IF;
  END LOOP;
END
$$;
