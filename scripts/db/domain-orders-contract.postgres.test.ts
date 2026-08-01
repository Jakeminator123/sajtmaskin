// @vitest-environment node
/**
 * Postgres-backad test för domänköpets idempotenskontrakt.
 *
 * Varför den måste vara DB-backad: hela garantin "en domän kan inte köpas
 * eller debiteras två gånger" ligger i två PARTIELLA unika index i
 * `add-domain-purchase-orders.sql`. Drizzle kan inte uttrycka partiella
 * uniques, så schemat i `schema.ts` nämner dem inte, och en mockad test kan
 * bara bevisa att koden *försöker* — inte att databasen faktiskt avvisar den
 * andra skrivningen. En oapplicerad eller felskriven migration hade alltså
 * lämnat pengavägen oskyddad med grön svit.
 *
 * Testet asserterar dessutom att `LIVE_DOMAIN_ORDER_STATUSES` i koden är exakt
 * samma mängd som indexets predikat. Glider de isär slutar en status som koden
 * tror håller namnet att vara unik i databasen, och två kunder kan köpa samma
 * domän.
 *
 * Säkerhet: testet SKRIVER rader och vägrar därför allt utom en dev-target,
 * via repots egen `check-db-env-target.mjs`. Fotavtryck: rader i
 * `domain_orders` med ett unikt testprefix, raderade i `afterAll`.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import { config as loadEnvFile } from "dotenv";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LIVE_DOMAIN_ORDER_STATUSES } from "../../src/lib/domains/order-status";
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
    `[domain-orders.postgres] ingen användbar dev-databas: ${target.reason}. ` +
    "Kör med en dev-POSTGRES_URL (t.ex. ur .env.local) eller CI:s tillfälliga Postgres.";
  if (requireDb) {
    throw new Error(
      `${message} REQUIRE_POSTGRES_TESTS=1 är satt, så ett hopp räknas som fel ` +
        "(annars hade grinden blivit grön utan att kontraktet testats).",
    );
  }
  console.warn(`${message} SKIPPAS.`);
}

const UNIQUE_VIOLATION = "23505";

describe.skipIf(!target.url)("domänköpets idempotenskontrakt mot riktig Postgres", () => {
  const runTag = randomUUID().slice(0, 8);
  const testDomain = `dotest-${runTag}.example`;
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: target.url!,
      ssl: resolveSslConfig(target.url!),
      max: 2,
    });
  }, 60_000);

  afterAll(async () => {
    if (!pool) return;
    await pool
      .query("delete from domain_orders where domain like $1", [`dotest-${runTag}%`])
      .catch(() => null);
    await pool.end().catch(() => null);
  }, 60_000);

  async function insertOrder(input: {
    domain: string;
    status: string;
    sessionId?: string | null;
  }): Promise<string> {
    const id = `ord_${randomUUID()}`;
    await pool.query(
      `insert into domain_orders (id, project_id, domain, status, stripe_session_id, user_id)
       values ($1, $2, $3, $4, $5, $6)`,
      [id, `prj_${runTag}`, input.domain, input.status, input.sessionId ?? null, `usr_${runTag}`],
    );
    return id;
  }

  it("har de partiella unika indexen migrationen deklarerar", async () => {
    const { rows } = await pool.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes
       where tablename = 'domain_orders'
         and indexname in ('idx_domain_orders_live_domain', 'idx_domain_orders_stripe_session')`,
    );
    const byName = new Map(rows.map((r) => [r.indexname, r.indexdef]));

    const liveIdx = byName.get("idx_domain_orders_live_domain");
    expect(liveIdx, "live-domain-indexet saknas — migrationen är inte applicerad").toBeTruthy();
    expect(liveIdx).toContain("UNIQUE");
    expect(liveIdx).toContain("lower(domain)");
    expect(liveIdx).toContain("WHERE");

    const sessionIdx = byName.get("idx_domain_orders_stripe_session");
    expect(sessionIdx, "stripe-session-indexet saknas").toBeTruthy();
    expect(sessionIdx).toContain("UNIQUE");
  });

  it("indexets predikat är exakt kodens LIVE_DOMAIN_ORDER_STATUSES", async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
       where tablename = 'domain_orders' and indexname = 'idx_domain_orders_live_domain'`,
    );
    const predicate = rows[0]?.indexdef ?? "";
    // Läs ut statusarna ur predikatet i stället för att jämföra strängformat:
    // Postgres normaliserar `IN (...)` till `= ANY (ARRAY[...])`, och en
    // textjämförelse hade fällt testet på formatering i stället för på drift.
    const quoted = [...predicate.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
    expect(new Set(quoted)).toEqual(new Set(LIVE_DOMAIN_ORDER_STATUSES));
  });

  it("avvisar en andra LIVE order för samma domän", async () => {
    await insertOrder({ domain: testDomain, status: "pending_payment" });
    await expect(
      insertOrder({ domain: testDomain, status: "pending_payment" }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("avvisar en andra live order även när skiftläget skiljer", async () => {
    // `lower(domain)` i indexet är hela poängen: Example.COM och example.com
    // är samma namn hos registraren.
    const mixed = `dotest-${runTag}-case.example`;
    await insertOrder({ domain: mixed, status: "paid" });
    await expect(
      insertOrder({ domain: mixed.toUpperCase(), status: "pending_payment" }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("släpper namnet när ordern nått ett terminalt läge", async () => {
    const released = `dotest-${runTag}-released.example`;
    const firstId = await insertOrder({ domain: released, status: "pending_payment" });
    await pool.query("update domain_orders set status = 'refunded' where id = $1", [firstId]);
    // Måste gå igenom: en återbetalad order får inte låsa namnet för alltid.
    await expect(
      insertOrder({ domain: released, status: "pending_payment" }),
    ).resolves.toBeTruthy();
  });

  it("låter en utgången order återupplivas när namnet är fritt", async () => {
    // En sen `checkout.session.completed` betyder att kunden faktiskt betalade.
    // Har ingen annan tagit namnet ska ordern kunna gå tillbaka till `paid` i
    // stället för att pengarna blir kvar utan leverans.
    const revivable = `dotest-${runTag}-revive.example`;
    const id = await insertOrder({ domain: revivable, status: "expired" });
    await pool.query("update domain_orders set status = 'paid' where id = $1", [id]);
    const { rows } = await pool.query<{ status: string }>(
      "select status from domain_orders where id = $1",
      [id],
    );
    expect(rows[0].status).toBe("paid");
  });

  it("vägrar återuppliva en utgången order när någon annan hunnit ta namnet", async () => {
    // Det är databasen som avgör, inte applikationskoden: indexet gör det
    // omöjligt att sälja samma namn två gånger, så webhooken kan lita på
    // felet och återbetala i stället.
    const contested = `dotest-${runTag}-contested.example`;
    const lapsed = await insertOrder({ domain: contested, status: "expired" });
    await insertOrder({ domain: contested, status: "registered" });
    await expect(
      pool.query("update domain_orders set status = 'paid' where id = $1", [lapsed]),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("avvisar två ordrar för samma Stripe-session", async () => {
    const sessionId = `cs_test_${runTag}`;
    await insertOrder({
      domain: `dotest-${runTag}-s1.example`,
      status: "paid",
      sessionId,
    });
    await expect(
      insertOrder({ domain: `dotest-${runTag}-s2.example`, status: "paid", sessionId }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("tillåter flera ordrar utan Stripe-session", async () => {
    // Partiellt index: NULL får inte kollidera, annars kunde bara en enda order
    // någonsin existera innan checkout-sessionen hunnit skrivas.
    await expect(
      insertOrder({ domain: `dotest-${runTag}-n1.example`, status: "canceled", sessionId: null }),
    ).resolves.toBeTruthy();
    await expect(
      insertOrder({ domain: `dotest-${runTag}-n2.example`, status: "canceled", sessionId: null }),
    ).resolves.toBeTruthy();
  });

  it("har kolumnerna köpflödet skriver", async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name = 'domain_orders'`,
    );
    const columns = new Set(rows.map((r) => r.column_name));
    for (const required of [
      "user_id",
      "chat_id",
      "vercel_project_id",
      "registrar",
      "stripe_session_id",
      "stripe_payment_intent",
      "stripe_refund_id",
      "price_ore",
      "wholesale_ore",
      "paid_at",
      "registered_at",
      "refunded_at",
      "expires_at",
      "failure_reason",
    ]) {
      expect(columns.has(required), `kolumnen ${required} saknas`).toBe(true);
    }
  });
});
