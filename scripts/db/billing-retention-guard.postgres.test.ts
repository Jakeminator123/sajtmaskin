// @vitest-environment node
/**
 * Postgres-backad kontroll av bevarandespärren: den SQL spärren faktiskt bygger
 * körs mot en riktig databas.
 *
 * Varför DB-backad: spärrens enhetstester mockar `db.execute`, och en mock ser
 * aldrig frågan. En interpolerad JS-lista expanderas av Drizzle till en
 * parameter per post — `ANY(($1, $2)::text[])` är en record Postgres vägrar
 * casta (42846) och `ANY(($1)::text[])` är en ogiltig arrayliteral (22P02) — så
 * varje rensning med en icke-tom lista kastade i stället för att svara, utan att
 * något test märkte det.
 *
 * Determinism: `usersExcept` läser HELA tabellerna, och den här lanen kör flera
 * filer parallellt mot samma dev-databas. Därför jämförs två frågor som skiljer
 * sig på exakt en skyddad adress, körda i EN `repeatable read`-snapshot:
 * differensen kan bara komma från testets egna rader. Snapshoten är dessutom
 * `read only`, vilket gör det till ett bevis att spärren inte skriver — en
 * INSERT/UPDATE/DELETE hade fallit på 25006.
 *
 * Säkerhet: testet SKRIVER fixturrader och vägrar allt utom en dev-target via
 * repots egen `check-db-env-target.mjs`. Fotavtryck: rader med ett unikt
 * körprefix, raderade i `afterAll`.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import { config as loadEnvFile } from "dotenv";
import { PgDialect } from "drizzle-orm/pg-core";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
    `[billing-retention.postgres] ingen användbar dev-databas: ${target.reason}. ` +
    "Kör med en dev-POSTGRES_URL (t.ex. ur .env.local) eller CI:s tillfälliga Postgres.";
  if (requireDb) {
    throw new Error(
      `${message} REQUIRE_POSTGRES_TESTS=1 är satt, så ett hopp räknas som fel ` +
        "(annars hade grinden blivit grön utan att spärren körts mot en databas).",
    );
  }
  console.warn(`${message} SKIPPAS.`);
}

/**
 * Spärrens `db.execute` pekas om till en riktig anslutning. Frågan kompileras av
 * Drizzles egen PostgreSQL-dialekt först, alltså exakt samma text och
 * parameterlista som produktionsvägen skickar.
 */
const runtime = vi.hoisted(() => ({
  execute: null as null | ((query: unknown) => Promise<{ rows: unknown[] }>),
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    execute: (query: unknown) => {
      if (!runtime.execute) throw new Error("[billing-retention.postgres] poolen saknas");
      return runtime.execute(query);
    },
  },
}));

const { countProtectedBillingRows, projectIdsWithBillingRows } = await import(
  "@/lib/db/billing-retention-guard"
);

const MALFORMED_ARRAY_LITERAL = "22P02";
const CANNOT_CAST_RECORD = "42846";

describe.skipIf(!target.url)("bevarandespärren mot riktig Postgres", () => {
  const runTag = randomUUID().replace(/-/gu, "").slice(0, 12);
  /** Ägaren till abonnemanget, granten och jobbet. */
  const ownerId = `usr_guard_owner_${runTag}`;
  const ownerEmail = `guard-owner-${runTag}@example.invalid`;
  const projectId = `prj_guard_${runTag}`;
  const subscriptionId = `sub_guard_${runTag}`;
  const dialect = new PgDialect();
  let pool: Pool;

  function executeOn(runner: Pool | PoolClient) {
    return async (query: unknown) => {
      const compiled = dialect.sqlToQuery(query as never);
      return runner.query(compiled.sql, compiled.params as unknown[]);
    };
  }

  /**
   * Kör `fn` mot en enda `repeatable read read only`-snapshot, så att flera
   * frågor ser exakt samma databas och bara skiljer sig på det testet varierar.
   */
  async function inSnapshot<T>(fn: () => Promise<T>): Promise<T> {
    const client = await pool.connect();
    const previous = runtime.execute;
    try {
      await client.query("begin transaction isolation level repeatable read read only");
      runtime.execute = executeOn(client);
      return await fn();
    } finally {
      runtime.execute = previous;
      await client.query("rollback").catch(() => null);
      client.release();
    }
  }

  beforeAll(async () => {
    pool = new Pool({
      connectionString: target.url!,
      ssl: resolveSslConfig(target.url!),
      max: 4,
    });
    runtime.execute = executeOn(pool);

    await pool.query(
      `insert into users (id, email, name, provider, email_verified)
       values ($1, $2, 'Spärrägare', 'email', true)`,
      [ownerId, ownerEmail],
    );
    await pool.query(
      "insert into app_projects (id, user_id, name) values ($1, $2, 'Spärrens sajt')",
      [projectId, ownerId],
    );
    await pool.query(
      `insert into site_subscriptions
         (id, user_id, project_id, billing_mode, lifecycle_state, ended_at)
       values ($1, $2, $3, 'test', 'ended', now())`,
      [subscriptionId, ownerId, projectId],
    );
    await pool.query(
      `insert into subscription_credit_grants
         (id, subscription_id, user_id, billing_mode, period_id, credits)
       values ($1, $2, $3, 'test', $4, 500)`,
      [`grant_guard_${runTag}`, subscriptionId, ownerId, `inv_guard_${runTag}`],
    );
    await pool.query(
      `insert into billing_jobs (id, subscription_id, billing_mode, kind, status)
       values ($1, $2, 'test', 'pause', 'pending')`,
      [`job_guard_${runTag}`, subscriptionId],
    );
  }, 60_000);

  afterAll(async () => {
    if (!pool) return;
    // Allt hänger i RESTRICT, så städningen går barn → förälder. Grant och jobb
    // följer abonnemanget via CASCADE.
    await pool
      .query("delete from site_subscriptions where id = $1", [subscriptionId])
      .catch(() => null);
    await pool.query("delete from app_projects where id = $1", [projectId]).catch(() => null);
    await pool.query("delete from users where id = $1", [ownerId]).catch(() => null);
    await pool.end().catch(() => null);
  }, 60_000);

  // ── Varför bindningen måste vara EN parameter ──────────────────────────

  it("bekräftar att den gamla bindningen avvisas av databasen", async () => {
    // Ankaret för fyndet: exakt de två formerna Drizzle producerade när listan
    // interpolerades post för post. Ingen av dem kan någonsin ha fungerat.
    await expect(
      pool.query("select 1 where 'x' = ANY(($1)::text[])", ["x"]),
    ).rejects.toMatchObject({ code: MALFORMED_ARRAY_LITERAL });
    await expect(
      pool.query("select 1 where 'x' = ANY(($1, $2)::text[])", ["x", "y"]),
    ).rejects.toMatchObject({ code: CANNOT_CAST_RECORD });
  });

  // ── Projektlistor: en post och flera ───────────────────────────────────

  it("räknar en projektlista med EN post", async () => {
    await expect(
      countProtectedBillingRows({ kind: "projectIds", projectIds: [projectId] }),
    ).resolves.toEqual({ subscriptions: 1, grants: 1, jobs: 1 });
  });

  it("räknar en projektlista med FLERA poster", async () => {
    await expect(
      countProtectedBillingRows({
        kind: "projectIds",
        projectIds: [`prj_ghost_a_${runTag}`, projectId, `prj_ghost_b_${runTag}`],
      }),
    ).resolves.toEqual({ subscriptions: 1, grants: 1, jobs: 1 });
  });

  it("hittar inget för en projektlista som inte rör bokföringen", async () => {
    await expect(
      countProtectedBillingRows({
        kind: "projectIds",
        projectIds: [`prj_ghost_c_${runTag}`, `prj_ghost_d_${runTag}`],
      }),
    ).resolves.toEqual({ subscriptions: 0, grants: 0, jobs: 0 });
  });

  it("pekar ut de bokförda projekten för bakgrundsstädningen", async () => {
    await expect(projectIdsWithBillingRows([projectId])).resolves.toEqual(new Set([projectId]));
    await expect(
      projectIdsWithBillingRows([`prj_ghost_e_${runTag}`, projectId]),
    ).resolves.toEqual(new Set([projectId]));
    await expect(projectIdsWithBillingRows([`prj_ghost_f_${runTag}`])).resolves.toEqual(new Set());
  });

  // ── E-postlistor ───────────────────────────────────────────────────────

  it("skyddar exakt de adresser användarrensningen får lämna kvar", async () => {
    // Två frågor i samma snapshot: den ena skyddar abonnemangets ägare, den
    // andra inte. Differensen kan bara vara testets egen rad — och den listan
    // körs både med en och med två poster.
    const { exposed, protectedOwner } = await inSnapshot(async () => ({
      exposed: await countProtectedBillingRows({
        kind: "usersExcept",
        keepEmails: [`guard-other-${runTag}@example.invalid`],
      }),
      protectedOwner: await countProtectedBillingRows({
        kind: "usersExcept",
        keepEmails: [`guard-other-${runTag}@example.invalid`, ownerEmail],
      }),
    }));

    expect(exposed.subscriptions - protectedOwner.subscriptions).toBe(1);
    expect(exposed.grants - protectedOwner.grants).toBe(1);
    expect(exposed.jobs - protectedOwner.jobs).toBe(1);
  });

  it("skriver ingenting — hela räkningen tål en read-only-transaktion", async () => {
    // 25006 (`read_only_sql_transaction`) hade fallit ut här om spärren
    // innehöll en enda skrivning. Den är LÄSARE i D1, och det är det som gör
    // den tillåten att nämna tabellerna alls.
    const counts = await inSnapshot(async () =>
      countProtectedBillingRows({ kind: "allProjects" }),
    );

    expect(counts.subscriptions).toBeGreaterThanOrEqual(1);
  });
});
