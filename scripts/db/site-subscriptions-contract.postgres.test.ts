// @vitest-environment node
/**
 * Postgres-backat D1-kontrakt: abonnemang per publicerad sajt och per
 * Stripe-läge.
 *
 * Varför DB-backad: hela poängen med D1 är att invarianterna ska vara
 * databasfakta och inte löften i applikationskod som ännu inte finns. Ingen
 * checkout, webhook eller worker läser tabellerna än, så ett mockat test hade
 * bara bevisat sitt eget mock. Det enda som går att bevisa i schemaetappen är
 * att databasen avvisar rätt skrivningar.
 *
 * Fem saker verifieras, alla direkt mot constraint-utfall:
 *   1. Test och live blandas aldrig. Samma externa identitet får finnas en
 *      gång per läge, och samma sajt får ha ett abonnemang i varje läge.
 *   2. Högst ETT pågående abonnemang eller checkout-anspråk per
 *      (projekt, läge), medan historiska avslutade rader bevaras.
 *   3. Stripe-status och hostingtillstånd är skilda axlar: `past_due` kan
 *      samexistera med en live sajt i respit.
 *   4. En periodgrant är unik per (läge, abonnemang, period), och en
 *      testgrant kan inte peka på en rad i den gemensamma creditledgern.
 *   5. Högst ett öppet paus-/återställningsjobb per abonnemang och typ.
 *
 * Säkerhet: testet SKRIVER rader och vägrar allt utom en dev-target via
 * repots egen `check-db-env-target.mjs`. Fotavtryck: rader med ett unikt
 * körprefix, raderade i `afterAll`.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import { config as loadEnvFile } from "dotenv";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  checkDbEnvTarget,
  loadDbTargets,
  resolveConfiguredDbUrl,
} from "./check-db-env-target.mjs";
import { resolveSslConfig } from "./db-ssl.mjs";

if (existsSync(".env.local")) loadEnvFile({ path: ".env.local", override: false });

function resolveDevDbUrl(): { url: string | null; reason: string } {
  const resolved = resolveConfiguredDbUrl(process.env);
  if (!resolved) return { url: null, reason: "ingen databas-URL i env" };
  const verdict = checkDbEnvTarget({
    expect: "dev",
    urlValue: resolved.value,
    targets: loadDbTargets(),
  });
  return verdict.ok
    ? { url: resolved.value, reason: verdict.message }
    : { url: null, reason: verdict.message };
}

const target = resolveDevDbUrl();
const requireDb = process.env.REQUIRE_POSTGRES_TESTS?.trim() === "1";

if (!target.url) {
  const message =
    `[site-subscriptions.postgres] ingen användbar dev-databas: ${target.reason}. ` +
    "Kör med en dev-POSTGRES_URL (t.ex. ur .env.local) eller CI:s tillfälliga Postgres.";
  if (requireDb) {
    throw new Error(
      `${message} REQUIRE_POSTGRES_TESTS=1 är satt, så ett hopp räknas som fel ` +
        "(annars hade grinden blivit grön utan att D1-kontraktet testats).",
    );
  }
  console.warn(`${message} SKIPPAS.`);
}

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const FOREIGN_KEY_VIOLATION = "23503";

describe.skipIf(!target.url)("D1 abonnemangsschema mot riktig Postgres", () => {
  const runTag = randomUUID().replace(/-/gu, "").slice(0, 12);
  const userA = `usr_sub_a_${runTag}`;
  const userB = `usr_sub_b_${runTag}`;
  /** Bär berättelsen om ett pågående anspråk. */
  const claimedSite = `prj_sub_claim_${runTag}`;
  /** Bär allt annat, nästan alltid som redan avslutade rader. */
  const historySite = `prj_sub_history_${runTag}`;
  /** Fri sajt för anspråk som måste vara ÖPPNA utan att krocka med ovanstående. */
  const openSite = `prj_sub_open_${runTag}`;
  const sharedSubscriptionId = `sub_shared_${runTag}`;
  const sharedSessionId = `cs_shared_${runTag}`;
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: target.url!,
      ssl: resolveSslConfig(target.url!),
      max: 4,
    });
    await pool.query(
      `insert into users (id, email, name, provider, email_verified)
       values ($1, $2, 'Sub A', 'email', true),
              ($3, $4, 'Sub B', 'email', true)`,
      [userA, `sub-a-${runTag}@example.invalid`, userB, `sub-b-${runTag}@example.invalid`],
    );
    await pool.query(
      `insert into app_projects (id, user_id, name)
       values ($1, $2, 'D1 anspråkssajt'), ($3, $2, 'D1 historiksajt'),
              ($4, $2, 'D1 fri sajt')`,
      [claimedSite, userA, historySite, openSite],
    );
  }, 60_000);

  afterAll(async () => {
    if (!pool) return;
    // Allt hänger nu i RESTRICT: abonnemangen håller både projektet OCH
    // användaren, och kundraderna håller användaren. Städningen måste därför gå
    // barn → förälder. Grants och jobb följer abonnemanget via CASCADE.
    await pool
      .query("delete from site_subscriptions where user_id = any($1::text[])", [[userA, userB]])
      .catch(() => null);
    await pool
      .query("delete from billing_customers where user_id = any($1::text[])", [[userA, userB]])
      .catch(() => null);
    await pool
      .query("delete from app_projects where id = any($1::text[])", [
        [claimedSite, historySite, openSite],
      ])
      .catch(() => null);
    await pool
      .query("delete from users where id = any($1::text[])", [[userA, userB]])
      .catch(() => null);
    await pool.end().catch(() => null);
  }, 60_000);

  let subscriptionSeq = 0;

  /** Skapar en rad. Default är en AVSLUTAD rad, som aldrig tar ett anspråk. */
  async function insertSubscription(input: {
    projectId?: string;
    userId?: string;
    billingMode: string;
    billingCustomerId?: string | null;
    open?: boolean;
    lifecycleState?: string;
    endedAt?: string | null;
    stripeSubscriptionId?: string | null;
    checkoutSessionId?: string | null;
    stripeStatus?: string | null;
    hostingDesired?: string;
    hostingActual?: string;
    graceUntil?: string | null;
  }): Promise<string> {
    const id = `sub_${runTag}_${(subscriptionSeq += 1)}`;
    const lifecycleState = input.lifecycleState ?? (input.open ? "active" : "ended");
    const endedAt =
      input.endedAt !== undefined
        ? input.endedAt
        : lifecycleState === "ended"
          ? new Date().toISOString()
          : null;
    await pool.query(
      `insert into site_subscriptions (
         id, user_id, project_id, billing_mode, billing_customer_id, lifecycle_state, ended_at,
         stripe_subscription_id, stripe_checkout_session_id, stripe_status,
         hosting_state_desired, hosting_state_actual, grace_until
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        input.userId ?? userA,
        input.projectId ?? historySite,
        input.billingMode,
        input.billingCustomerId ?? null,
        lifecycleState,
        endedAt,
        input.stripeSubscriptionId ?? null,
        input.checkoutSessionId ?? null,
        input.stripeStatus ?? null,
        input.hostingDesired ?? "active",
        input.hostingActual ?? "active",
        input.graceUntil ?? null,
      ],
    );
    return id;
  }

  let grantSeq = 0;

  async function insertGrant(input: {
    subscriptionId: string;
    userId?: string;
    billingMode: string;
    periodId: string;
    transactionId?: string | null;
  }): Promise<string> {
    const id = `grant_${runTag}_${(grantSeq += 1)}`;
    await pool.query(
      `insert into subscription_credit_grants (
         id, subscription_id, user_id, billing_mode, period_id, credits, transaction_id
       ) values ($1, $2, $3, $4, $5, 500, $6)`,
      [
        id,
        input.subscriptionId,
        input.userId ?? userA,
        input.billingMode,
        input.periodId,
        input.transactionId ?? null,
      ],
    );
    return id;
  }

  let jobSeq = 0;

  async function insertJob(input: {
    subscriptionId: string;
    kind: string;
    status?: string;
    billingMode?: string;
  }): Promise<string> {
    const id = `job_${runTag}_${(jobSeq += 1)}`;
    await pool.query(
      `insert into billing_jobs (id, subscription_id, billing_mode, kind, status)
       values ($1, $2, $3, $4, $5)`,
      [
        id,
        input.subscriptionId,
        input.billingMode ?? "test",
        input.kind,
        input.status ?? "pending",
      ],
    );
    return id;
  }

  // ── Migrationen är faktiskt applicerad ────────────────────────────────

  it("har de unika constraints migrationen deklarerar", async () => {
    const { rows } = await pool.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes
        where schemaname = 'public'
          and indexname in (
            'billing_customers_user_mode_unique',
            'billing_customers_stripe_customer_unique',
            'site_subscriptions_open_claim_unique',
            'site_subscriptions_stripe_subscription_unique',
            'site_subscriptions_checkout_session_unique',
            'subscription_credit_grants_period_unique',
            'billing_jobs_open_unique'
          )`,
    );
    const byName = new Map(rows.map((row) => [row.indexname, row.indexdef]));
    for (const name of [
      "billing_customers_user_mode_unique",
      "billing_customers_stripe_customer_unique",
      "site_subscriptions_open_claim_unique",
      "site_subscriptions_stripe_subscription_unique",
      "site_subscriptions_checkout_session_unique",
      "subscription_credit_grants_period_unique",
      "billing_jobs_open_unique",
    ]) {
      expect(byName.get(name), `${name} saknas — migrationen är inte applicerad`).toContain(
        "UNIQUE",
      );
    }
  });

  it("räknar anspråks- och ledgernycklarna i databasen, inte i applikationskoden", async () => {
    const { rows } = await pool.query<{
      table_name: string;
      column_name: string;
      generation_expression: string;
    }>(
      `select table_name, column_name, generation_expression
         from information_schema.columns
        where table_schema = 'public'
          and is_generated = 'ALWAYS'
          and table_name in (
            'site_subscriptions', 'subscription_credit_grants', 'billing_jobs'
          )`,
    );
    const byColumn = new Map(
      rows.map((row) => [`${row.table_name}.${row.column_name}`, row.generation_expression]),
    );
    expect(byColumn.get("site_subscriptions.open_claim_key")).toContain("lifecycle_state");
    expect(byColumn.get("billing_jobs.open_job_key")).toContain("status");
    expect(byColumn.get("subscription_credit_grants.ledger_idempotency_key")).toContain(
      "site_sub_period:",
    );
  });

  // ── 1. Test och live blandas aldrig ───────────────────────────────────

  it("ger samma konto en egen Stripe-kund i varje läge", async () => {
    await pool.query(
      `insert into billing_customers (id, user_id, billing_mode, stripe_customer_id)
       values ($1, $2, 'test', $3), ($4, $2, 'live', $5)`,
      [
        `bc_${runTag}_test`,
        userA,
        `cus_test_${runTag}`,
        `bc_${runTag}_live`,
        `cus_live_${runTag}`,
      ],
    );
    const { rows } = await pool.query<{ billing_mode: string }>(
      "select billing_mode from billing_customers where user_id = $1 order by billing_mode",
      [userA],
    );
    expect(rows.map((row) => row.billing_mode)).toEqual(["live", "test"]);
  });

  it("avvisar en andra kundrad för samma konto och läge", async () => {
    await expect(
      pool.query(
        `insert into billing_customers (id, user_id, billing_mode, stripe_customer_id)
         values ($1, $2, 'test', $3)`,
        [`bc_${runTag}_dupe`, userA, `cus_test_other_${runTag}`],
      ),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("avvisar samma Stripe-kund på två konton inom ett läge", async () => {
    await expect(
      pool.query(
        `insert into billing_customers (id, user_id, billing_mode, stripe_customer_id)
         values ($1, $2, 'test', $3)`,
        [`bc_${runTag}_steal`, userB, `cus_test_${runTag}`],
      ),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("låter samma externa abonnemangs-id förekomma en gång i test och en gång i live", async () => {
    // Unikheten gäller INOM ett läge. Ett testabonnemang och ett riktigt
    // abonnemang är två skilda sanningar även när strängarna ser lika ut.
    await insertSubscription({
      billingMode: "test",
      stripeSubscriptionId: sharedSubscriptionId,
      checkoutSessionId: sharedSessionId,
    });
    await expect(
      insertSubscription({
        billingMode: "live",
        stripeSubscriptionId: sharedSubscriptionId,
        checkoutSessionId: sharedSessionId,
      }),
    ).resolves.toBeTruthy();
  });

  it("avvisar samma Stripe-abonnemang två gånger inom ett läge", async () => {
    await expect(
      insertSubscription({ billingMode: "test", stripeSubscriptionId: sharedSubscriptionId }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("avvisar två rader för samma checkout-session inom ett läge", async () => {
    // En omlevererad `checkout.session.completed` får inte skapa ett andra
    // abonnemang för samma betalning.
    await expect(
      insertSubscription({ billingMode: "test", checkoutSessionId: sharedSessionId }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("tillåter flera rader utan extern identitet ännu", async () => {
    // Partiell i praktiken: UNIQUE tillåter flera NULL, annars kunde bara ETT
    // abonnemang någonsin finnas innan Stripe hunnit svara.
    await expect(insertSubscription({ billingMode: "test" })).resolves.toBeTruthy();
    await expect(insertSubscription({ billingMode: "test" })).resolves.toBeTruthy();
  });

  // ── 2. Ett pågående anspråk per (projekt, läge) ───────────────────────

  it("avvisar ett andra pågående abonnemang för samma sajt och läge", async () => {
    await insertSubscription({ projectId: claimedSite, billingMode: "test", open: true });
    await expect(
      insertSubscription({ projectId: claimedSite, billingMode: "test", open: true }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("behandlar ett oavslutat checkout-anspråk som upptaget", async () => {
    // Två samtidiga checkout-anrop avgörs av databasen, inte av en
    // UI-disable: det andra får 23505 och kan svara 409.
    const pending = await insertSubscription({
      projectId: historySite,
      billingMode: "live",
      lifecycleState: "checkout_pending",
    });
    await expect(
      insertSubscription({ projectId: historySite, billingMode: "live", open: true }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });

    await pool.query(
      `update site_subscriptions
          set lifecycle_state = 'ended', ended_at = now(), ended_reason = 'checkout_abandoned'
        where id = $1`,
      [pending],
    );
    const retried = await insertSubscription({
      projectId: historySite,
      billingMode: "live",
      open: true,
    });
    // Den övergivna raden finns kvar — historiken skrivs inte över.
    const { rows } = await pool.query<{ id: string; lifecycle_state: string }>(
      `select id, lifecycle_state from site_subscriptions
        where id = any($1::text[]) order by created_at`,
      [[pending, retried]],
    );
    expect(rows.map((row) => row.id)).toEqual([pending, retried]);
    expect(rows.map((row) => row.lifecycle_state)).toEqual(["ended", "active"]);
  });

  it("håller test och live isär även för samma sajt", async () => {
    // claimedSite har redan ett pågående TESTabonnemang. Ett live-abonnemang
    // för samma sajt måste gå igenom — annars kunde ett testabonnemang
    // blockera eller hålla en riktig kundsajt.
    await expect(
      insertSubscription({ projectId: claimedSite, billingMode: "live", open: true }),
    ).resolves.toBeTruthy();
  });

  it("kräver att en avslutad rad bär sin sluttid", async () => {
    await expect(
      insertSubscription({
        billingMode: "test",
        lifecycleState: "ended",
        endedAt: null,
      }),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it("vägrar ett abonnemang för en sajt som inte finns", async () => {
    await expect(
      insertSubscription({ projectId: `prj_ghost_${runTag}`, billingMode: "test" }),
    ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
  });

  it("skyddar bokföringen mot att sajten rensas bort under den", async () => {
    // ON DELETE RESTRICT med flit: MVP raderar ingen kunddata automatiskt, och
    // en projektstädning får inte ta abonnemangshistoriken med sig.
    await expect(
      pool.query("delete from app_projects where id = $1", [claimedSite]),
    ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
  });

  // ── 2b. Släktskapet är sammansatt: läge och ägare ärvs ────────────────

  it("har de sammansatta tupelnycklarna och tupel-FK:erna applicerade", async () => {
    // Bevisar att UPPGRADERINGSVÄGEN nådde den här databasen. Tabellerna
    // skapades av den första versionen av migrationen; `CREATE TABLE IF NOT
    // EXISTS` hade aldrig kunnat lägga till något av det här.
    const { rows: uniques } = await pool.query<{ indexname: string }>(
      `select indexname from pg_indexes
        where schemaname = 'public'
          and indexname in (
            'billing_customers_id_user_mode_unique',
            'site_subscriptions_id_mode_unique',
            'site_subscriptions_id_user_unique'
          )`,
    );
    expect(uniques.map((row) => row.indexname).sort()).toEqual([
      "billing_customers_id_user_mode_unique",
      "site_subscriptions_id_mode_unique",
      "site_subscriptions_id_user_unique",
    ]);

    const { rows: fks } = await pool.query<{ conname: string; def: string }>(
      `select conname, pg_get_constraintdef(oid) as def
         from pg_constraint
        where contype = 'f'
          and conname in (
            'site_subscriptions_customer_fk',
            'subscription_credit_grants_subscription_mode_fk',
            'subscription_credit_grants_subscription_owner_fk',
            'billing_jobs_subscription_mode_fk',
            'billing_customers_user_fk',
            'site_subscriptions_user_fk',
            'subscription_credit_grants_user_fk'
          )`,
    );
    const byName = new Map(fks.map((row) => [row.conname, row.def]));
    expect(byName.get("site_subscriptions_customer_fk")).toContain(
      "FOREIGN KEY (billing_customer_id, user_id, billing_mode)",
    );
    expect(byName.get("subscription_credit_grants_subscription_mode_fk")).toContain(
      "FOREIGN KEY (subscription_id, billing_mode)",
    );
    expect(byName.get("subscription_credit_grants_subscription_owner_fk")).toContain(
      "FOREIGN KEY (subscription_id, user_id)",
    );
    expect(byName.get("billing_jobs_subscription_mode_fk")).toContain(
      "FOREIGN KEY (subscription_id, billing_mode)",
    );
    // Bokföringen får inte kunna kaskadraderas bort med en användare.
    for (const name of [
      "billing_customers_user_fk",
      "site_subscriptions_user_fk",
      "subscription_credit_grants_user_fk",
    ]) {
      expect(byName.get(name), `${name} saknas`).toContain("ON DELETE RESTRICT");
    }
  });

  it("avvisar en live-grant på ett testabonnemang", async () => {
    // Det var precis det en FK mot enbart `id` tillät: en riktig kreditutbetalning
    // bokförd mot ett Stripe-testabonnemang.
    const testSubscription = await insertSubscription({ billingMode: "test" });
    await expect(
      insertGrant({
        subscriptionId: testSubscription,
        billingMode: "live",
        periodId: "inv_mode_mismatch",
      }),
    ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
  });

  it("avvisar en grant som bokförs på ett annat konto än abonnemangets ägare", async () => {
    const subscription = await insertSubscription({ billingMode: "test" });
    await expect(
      insertGrant({
        subscriptionId: subscription,
        userId: userB,
        billingMode: "test",
        periodId: "inv_owner_mismatch",
      }),
    ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
  });

  it("avvisar ett paus-/återställningsjobb i fel läge", async () => {
    const testSubscription = await insertSubscription({ billingMode: "test" });
    await expect(
      insertJob({ subscriptionId: testSubscription, kind: "pause", billingMode: "live" }),
    ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
  });

  it("tillåter kundlänken bara mot samma konto och samma läge", async () => {
    await pool.query(
      `insert into billing_customers (id, user_id, billing_mode, stripe_customer_id)
       values ($1, $2, 'test', $3)`,
      [`bc_${runTag}_b_test`, userB, `cus_test_b_${runTag}`],
    );

    // Rätt konto, rätt läge.
    await expect(
      insertSubscription({ billingMode: "test", billingCustomerId: `bc_${runTag}_test` }),
    ).resolves.toBeTruthy();

    // Ett annat konto får inte kopplas in — det hade bokfört betalningen fel.
    await expect(
      insertSubscription({ billingMode: "test", billingCustomerId: `bc_${runTag}_b_test` }),
    ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });

    // Rätt konto men fel läge: testkunden får inte bära ett riktigt abonnemang.
    await expect(
      insertSubscription({ billingMode: "live", billingCustomerId: `bc_${runTag}_test` }),
    ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
  });

  it("låter ett checkout-anspråk finnas innan Stripe-kunden gör det", async () => {
    // Den striktare formen (FK på (user_id, billing_mode) mot kundtabellen)
    // hade omöjliggjort ordningen flödet faktiskt har. NULL i kundlänken
    // hoppar över tupelkontrollen; den gäller så snart länken sätts.
    await expect(
      insertSubscription({
        projectId: openSite,
        billingMode: "live",
        lifecycleState: "checkout_pending",
        billingCustomerId: null,
      }),
    ).resolves.toBeTruthy();
  });

  it("skyddar bokföringen mot en adminrensning av användare", async () => {
    // Tidigare var länkarna ON DELETE CASCADE: en "rensa användare" i
    // adminpanelen hade tagit abonnemang, grants och jobb med sig.
    await expect(
      pool.query("delete from users where id = $1", [userA]),
    ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
  });

  it("skyddar bokföringen mot att kundraden raderas under den", async () => {
    await expect(
      pool.query("delete from billing_customers where id = $1", [`bc_${runTag}_test`]),
    ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
  });

  // ── 3. Stripe-status är inte hostingtillstånd ─────────────────────────

  it("låter past_due samexistera med en live sajt i respit", async () => {
    const id = await insertSubscription({
      billingMode: "test",
      stripeStatus: "past_due",
      hostingDesired: "grace",
      hostingActual: "active",
      graceUntil: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    const { rows } = await pool.query<{
      stripe_status: string;
      hosting_state_actual: string;
      grace_until: Date | null;
    }>(
      `select stripe_status, hosting_state_actual, grace_until
         from site_subscriptions where id = $1`,
      [id],
    );
    expect(rows[0]?.stripe_status).toBe("past_due");
    expect(rows[0]?.hosting_state_actual).toBe("active");
    expect(rows[0]?.grace_until).toBeInstanceOf(Date);
  });

  it("har ett eget faktiskt tillstånd för pågående paus och återställning", async () => {
    // En begärd paus är inte en genomförd paus. Utan 'pausing'/'resuming'
    // hade ett providerfel behövt bokföras som antingen aktiv eller pausad.
    const { rows } = await pool.query<{ constraint_def: string }>(
      `select pg_get_constraintdef(oid) as constraint_def
         from pg_constraint where conname = 'site_subscriptions_actual_check'`,
    );
    expect(rows[0]?.constraint_def).toContain("pausing");
    expect(rows[0]?.constraint_def).toContain("resuming");
  });

  it("avvisar ett hostingtillstånd utanför den fastställda mängden", async () => {
    await expect(
      insertSubscription({ billingMode: "test", hostingActual: "deleted" }),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });


  // ── 4. Periodgrant och testavgränsad ledger ───────────────────────────

  it("ger en periodgrant per (läge, abonnemang, period)", async () => {
    const subscription = await insertSubscription({ billingMode: "test" });
    await insertGrant({ subscriptionId: subscription, billingMode: "test", periodId: "inv_1" });
    // En omlevererad webhook och en manuell reparationskörning landar på
    // samma rad i stället för att granta två gånger.
    await expect(
      insertGrant({ subscriptionId: subscription, billingMode: "test", periodId: "inv_1" }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    await expect(
      insertGrant({ subscriptionId: subscription, billingMode: "test", periodId: "inv_2" }),
    ).resolves.toBeTruthy();
  });

  it("bygger ledgernyckeln i databasen så två lägen aldrig kolliderar", async () => {
    const { rows } = await pool.query<{ ledger_idempotency_key: string }>(
      `select ledger_idempotency_key from subscription_credit_grants
        where user_id = $1 and period_id = 'inv_1'`,
      [userA],
    );
    expect(rows[0]?.ledger_idempotency_key).toMatch(
      new RegExp(`^site_sub_period:test:sub_${runTag}_\\d+:inv_1$`, "u"),
    );
  });

  it("avvisar ett period-id som skulle göra ledgernyckeln tvetydig", async () => {
    const subscription = await insertSubscription({ billingMode: "test" });
    await expect(
      insertGrant({ subscriptionId: subscription, billingMode: "test", periodId: "inv:3" }),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it("hindrar en testgrant från att peka på den gemensamma creditledgern", async () => {
    // users.diamonds delas av preview och produktion. En testgrant som fick
    // knytas till en transaktionsrad vore första steget mot att fylla ett
    // riktigt saldo från Stripe testläge.
    const transactionId = `txn_${runTag}`;
    await pool.query(
      `insert into transactions (id, user_id, type, amount, balance_after, description)
       values ($1, $2, 'subscription_grant', 500, 500, 'D1 kontraktstest')`,
      [transactionId, userA],
    );
    const testSubscription = await insertSubscription({ billingMode: "test" });
    await expect(
      insertGrant({
        subscriptionId: testSubscription,
        billingMode: "test",
        periodId: "inv_ledger",
        transactionId,
      }),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });

    const liveSubscription = await insertSubscription({ billingMode: "live" });
    await expect(
      insertGrant({
        subscriptionId: liveSubscription,
        billingMode: "live",
        periodId: "inv_ledger",
        transactionId,
      }),
    ).resolves.toBeTruthy();

    await pool.query("delete from transactions where id = $1", [transactionId]);
  });

  // ── 5. Åtgärdsanspråk för paus och återställning ──────────────────────

  it("tillåter högst ett öppet jobb per abonnemang och typ", async () => {
    // Ett DB-fel efter provideranropet får inte tappa jobbet, och en
    // avstämning som startar två gånger får inte beställa två pausningar.
    const subscription = await insertSubscription({ billingMode: "test" });
    const pause = await insertJob({ subscriptionId: subscription, kind: "pause" });
    await expect(
      insertJob({ subscriptionId: subscription, kind: "pause" }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    // Paus och återställning är olika åtgärder och blockerar inte varandra.
    await expect(insertJob({ subscriptionId: subscription, kind: "resume" })).resolves.toBeTruthy();

    await pool.query(
      "update billing_jobs set status = 'done', completed_at = now() where id = $1",
      [pause],
    );
    await expect(insertJob({ subscriptionId: subscription, kind: "pause" })).resolves.toBeTruthy();

    const { rows } = await pool.query<{ count: string }>(
      `select count(*)::text as count from billing_jobs
        where subscription_id = $1 and kind = 'pause'`,
      [subscription],
    );
    expect(Number(rows[0]?.count)).toBe(2);
  });
});
