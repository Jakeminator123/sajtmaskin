// @vitest-environment node
/**
 * Postgres-backat B1-kontrakt: en wizard-körning kostar 11 krediter totalt,
 * run-id:t är serverägt, och ett påhittat/avslutat/utgånget/främmande UUID
 * ger inte LLM-passage.
 *
 * Varför DB-backad: både "en ledger-rad" och "klienten kan inte hitta på ett
 * giltigt id" är databasfakta (partiellt unikt aktivt run + unikt
 * (user_id, type, idempotency_key)). En mockad svit kan bara bevisa att
 * koden *försöker*.
 *
 * Säkerhet: testet SKRIVER rader och vägrar allt utom en dev-target via
 * `check-db-env-target.mjs`. Alla id:n har ett unikt körprefix och raderas
 * i afterAll.
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
    `[wizard-runs.postgres] ingen användbar dev-databas: ${target.reason}. ` +
    "Kör med en dev-POSTGRES_URL (t.ex. ur .env.local) eller CI:s tillfälliga Postgres.";
  if (requireDb) {
    throw new Error(
      `${message} REQUIRE_POSTGRES_TESTS=1 är satt, så ett hopp räknas som fel ` +
        "(annars hade grinden blivit grön utan att B1-kontraktet testats).",
    );
  }
  console.warn(`${message} SKIPPAS.`);
}

describe.skipIf(!target.url)("B1 wizard_runs mot riktig Postgres", () => {
  const runTag = randomUUID();
  const userA = `usr_wiz_a_${runTag}`;
  const userB = `usr_wiz_b_${runTag}`;
  const initialBalance = 1_000;
  let pool: Pool;
  let wizardRuns: typeof import("../../src/lib/db/services/wizard-runs");

  beforeAll(async () => {
    pool = new Pool({
      connectionString: target.url!,
      ssl: resolveSslConfig(target.url!),
      max: 4,
    });
    await pool.query(
      `insert into users (
         id, email, name, provider, diamonds, free_generation_available, email_verified
       ) values
         ($1, $2, 'Wizard A', 'email', $5, false, true),
         ($3, $4, 'Wizard B', 'email', $5, false, true)`,
      [
        userA,
        `wizard-a-${runTag}@example.invalid`,
        userB,
        `wizard-b-${runTag}@example.invalid`,
        initialBalance,
      ],
    );
    wizardRuns = await import("../../src/lib/db/services/wizard-runs");
  }, 60_000);

  afterAll(async () => {
    if (!pool) return;
    await pool.query("delete from users where id = any($1::text[])", [[userA, userB]]).catch(
      () => null,
    );
    await pool.end().catch(() => null);
  }, 60_000);

  async function ledger(userId: string) {
    const { rows } = await pool.query<{
      id: string;
      amount: number;
      idempotency_key: string | null;
    }>(
      `select id, amount, idempotency_key
         from transactions
        where user_id = $1 and type = 'wizard_enrich'
        order by created_at`,
      [userId],
    );
    return rows;
  }

  async function balance(userId: string) {
    const { rows } = await pool.query<{ diamonds: number }>(
      "select diamonds from users where id = $1",
      [userId],
    );
    return rows[0]?.diamonds ?? -1;
  }

  it("har de unika index som gör dubbeldebitering och påhittade id omöjliga", async () => {
    const { rows } = await pool.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes
        where indexname in (
          'wizard_runs_user_active_idx',
          'transactions_user_type_idempotency_idx'
        )`,
    );
    const byName = new Map(rows.map((row) => [row.indexname, row.indexdef]));
    const runIdx = byName.get("wizard_runs_user_active_idx");
    expect(runIdx, "wizard_runs_user_active_idx saknas — migrationen är inte applicerad").toBeTruthy();
    expect(runIdx).toContain("UNIQUE");
    expect(runIdx).toMatch(/status.*=.*'active'/);

    const ledgerIdx = byName.get("transactions_user_type_idempotency_idx");
    expect(ledgerIdx, "transactions_user_type_idempotency_idx saknas").toBeTruthy();
    expect(ledgerIdx).toContain("UNIQUE");
    expect(ledgerIdx).toContain("idempotency_key");
  });

  it("lookup + competitors + N enrich kostar totalt 11 och skapar en ledger-rad", async () => {
    const started = await wizardRuns.startWizardRun({ userId: userA });
    expect(started.charged).toBe(true);
    expect(started.cost).toBe(11);
    expect(started.run.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const authorizations = await Promise.all([
      wizardRuns.requireActiveWizardRun(userA, started.run.id),
      wizardRuns.requireActiveWizardRun(userA, started.run.id),
      wizardRuns.requireActiveWizardRun(userA, started.run.id),
      wizardRuns.requireActiveWizardRun(userA, started.run.id),
      wizardRuns.requireActiveWizardRun(userA, started.run.id),
    ]);
    expect(authorizations.every((result) => result.ok)).toBe(true);

    const rows = await ledger(userA);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount).toBe(-11);
    expect(rows[0]?.idempotency_key).toBe(started.run.id);
    expect(await balance(userA)).toBe(initialBalance - 11);
  });

  it("tio parallella starter skapar exakt en aktiv körning och en ledger-rad", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => wizardRuns.startWizardRun({ userId: userA })),
    );
    const ids = new Set(results.map((result) => result.run.id));
    expect(ids.size).toBe(1);
    expect(results.every((result) => result.run.id === results[0]?.run.id)).toBe(true);
    expect(results.filter((result) => result.charged)).toHaveLength(0);

    const rows = await ledger(userA);
    expect(rows).toHaveLength(1);
    expect(await balance(userA)).toBe(initialBalance - 11);
  });

  it("påhittat, återanvänt och främmande UUID ger inte aktiv passage", async () => {
    const started = await wizardRuns.startWizardRun({ userId: userA });
    const invented = randomUUID();

    const missing = await wizardRuns.requireActiveWizardRun(userA, invented);
    expect(missing).toMatchObject({ ok: false, status: 403 });

    const foreign = await wizardRuns.requireActiveWizardRun(userB, started.run.id);
    expect(foreign).toMatchObject({ ok: false, status: 403 });

    const completed = await wizardRuns.completeWizardRun(userA, started.run.id);
    expect(completed.ok).toBe(true);

    const reused = await wizardRuns.requireActiveWizardRun(userA, started.run.id);
    expect(reused).toMatchObject({ ok: false, status: 409 });

    const bCannotComplete = await wizardRuns.completeWizardRun(userB, started.run.id);
    expect(bCannotComplete).toMatchObject({ ok: false, status: 403 });

    expect(await ledger(userA)).toHaveLength(1);
    expect(await ledger(userB)).toHaveLength(0);
  });

  it("en utgången körning avvisas och kan inte återanvändas gratis", async () => {
    const expiredId = randomUUID();
    await pool.query(
      `insert into wizard_runs (id, user_id, status, created_at, expires_at)
       values ($1, $2, 'active', now() - interval '3 hours', now() - interval '1 hour')`,
      [expiredId, userA],
    );

    const denied = await wizardRuns.requireActiveWizardRun(userA, expiredId);
    expect(denied).toMatchObject({ ok: false, status: 409 });

    const { rows } = await pool.query<{ status: string }>(
      "select status from wizard_runs where id = $1",
      [expiredId],
    );
    expect(rows[0]?.status).toBe("expired");

    const retry = await wizardRuns.requireActiveWizardRun(userA, expiredId);
    expect(retry).toMatchObject({ ok: false, status: 409 });
    expect(await ledger(userA)).toHaveLength(1);
  });

  it("en ny start efter completed debiterar en ny körning, inte den gamla nyckeln", async () => {
    const next = await wizardRuns.startWizardRun({ userId: userA });
    expect(next.reused).toBe(false);
    expect(next.charged).toBe(true);
    const rows = await ledger(userA);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.idempotency_key)).size).toBe(2);
    expect(await balance(userA)).toBe(initialBalance - 22);
  });
});
