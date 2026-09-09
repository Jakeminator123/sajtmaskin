// @vitest-environment node
/**
 * Migration-only wizard_runs security contract against real Postgres.
 *
 * The test creates a transaction-local schema, applies the original table
 * migration, simulates Supabase's exposed-table grants, then applies the new
 * hardening migration twice. Every schema/role change rolls back in afterAll.
 * This exercises the migration sources without touching the shared public
 * wizard_runs table.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { config as loadEnvFile } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { checkDbEnvTarget, loadDbTargets, resolveConfiguredDbUrl } from "./check-db-env-target.mjs";
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
    `[wizard-runs-rls.postgres] ingen användbar dev-databas: ${target.reason}. ` +
    "Kör med en dev-POSTGRES_URL (t.ex. ur .env.local) eller CI:s tillfälliga Postgres.";
  if (requireDb) {
    throw new Error(
      `${message} REQUIRE_POSTGRES_TESTS=1 är satt, så ett hopp räknas som fel ` +
        "(annars hade grinden blivit grön utan att wizard_runs-ACL/RLS testats).",
    );
  }
  console.warn(`${message} SKIPPAS.`);
}

const migrationDir = join(process.cwd(), "src", "lib", "db", "migrations");

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

describe.skipIf(!target.url)("wizard_runs ACL/RLS migration mot riktig Postgres", () => {
  const schema = `wizard_runs_rls_${randomUUID().replaceAll("-", "")}`;
  const quotedSchema = quoteIdentifier(schema);
  let client: Client;

  beforeAll(async () => {
    client = new Client({
      connectionString: target.url!,
      ssl: resolveSslConfig(target.url!),
    });
    await client.connect();
    await client.query("BEGIN");

    // Hosted Supabase already defines these. Vanilla postgres:16 in CI does
    // not, so create transaction-local compatibility roles when necessary.
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role NOLOGIN;
        END IF;
      END $$
    `);

    await client.query(`CREATE SCHEMA ${quotedSchema}`);
    await client.query(`GRANT USAGE ON SCHEMA ${quotedSchema} TO PUBLIC`);
    await client.query(`CREATE TABLE ${quotedSchema}.users (id text PRIMARY KEY)`);
    await client.query(`SET LOCAL search_path = ${quotedSchema}, public`);

    const createSql = await readFile(join(migrationDir, "add-wizard-runs.sql"), "utf8");
    await client.query(createSql);

    // Reproduce the confirmed migration-only exposure before the follow-up.
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${quotedSchema}.wizard_runs ` +
        "TO PUBLIC, anon, authenticated",
    );

    const hardenSource = await readFile(
      join(migrationDir, "harden-wizard-runs-access.sql"),
      "utf8",
    );
    const hardenSql = hardenSource.replaceAll("public.wizard_runs", `${quotedSchema}.wizard_runs`);
    await client.query(hardenSql);
    await client.query(hardenSql); // idempotency is part of the deploy contract
  }, 60_000);

  afterAll(async () => {
    if (!client) return;
    await client.query("ROLLBACK").catch(() => null);
    await client.end().catch(() => null);
  }, 60_000);

  async function queriesAsRole(
    role: "anon" | "authenticated" | "service_role",
    statements: string[],
  ) {
    const savepoint = `role_${role}`;
    await client.query(`SAVEPOINT ${savepoint}`);
    try {
      await client.query(`SET LOCAL ROLE ${role}`);
      const results = [];
      for (const sql of statements) results.push(await client.query(sql));
      return results;
    } finally {
      await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`).catch(() => null);
      await client.query(`RELEASE SAVEPOINT ${savepoint}`).catch(() => null);
    }
  }

  async function queryAsRole(role: "anon" | "authenticated" | "service_role", sql: string) {
    return (await queriesAsRole(role, [sql]))[0];
  }

  it("upgrades an exposed add-wizard-runs-only schema to deny-by-default", async () => {
    const state = await client.query<{
      relrowsecurity: boolean;
      anon_dml: boolean;
      authenticated_dml: boolean;
      public_dml: boolean;
    }>(`
      SELECT
        c.relrowsecurity,
        has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS anon_dml,
        has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS authenticated_dml,
        EXISTS (
          SELECT 1
          FROM aclexplode(c.relacl) acl
          WHERE acl.grantee = 0
            AND acl.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
        ) AS public_dml
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = '${schema}' AND c.relname = 'wizard_runs'
    `);

    expect(state.rows).toEqual([
      {
        relrowsecurity: true,
        anon_dml: false,
        authenticated_dml: false,
        public_dml: false,
      },
    ]);

    const policy = await client.query<{ roles: string[] }>(`
      SELECT roles
      FROM pg_policies
      WHERE schemaname = '${schema}'
        AND tablename = 'wizard_runs'
        AND policyname = 'wizard_runs_backend_full_access'
    `);
    expect(policy.rows).toEqual([{ roles: expect.arrayContaining(["postgres", "service_role"]) }]);
  });

  it.each(["anon", "authenticated"] as const)(
    "%s cannot select, insert, update or delete wizard runs",
    async (role) => {
      const operations = [
        `SELECT * FROM ${quotedSchema}.wizard_runs`,
        `INSERT INTO ${quotedSchema}.wizard_runs (id, user_id, status, expires_at) ` +
          "VALUES ('client-run', 'client-user', 'active', now())",
        `UPDATE ${quotedSchema}.wizard_runs SET status = 'expired'`,
        `DELETE FROM ${quotedSchema}.wizard_runs`,
      ];

      for (const sql of operations) {
        await expect(queryAsRole(role, sql)).rejects.toMatchObject({ code: "42501" });
      }
    },
  );

  it("postgres and service_role retain backend access", async () => {
    await client.query(
      `INSERT INTO ${quotedSchema}.users (id) VALUES ('backend-user'), ('service-user')`,
    );
    await client.query(
      `INSERT INTO ${quotedSchema}.wizard_runs (id, user_id, status, expires_at) ` +
        "VALUES ('postgres-run', 'backend-user', 'active', now() + interval '1 hour')",
    );

    const ownerRead = await client.query<{ id: string }>(
      `SELECT id FROM ${quotedSchema}.wizard_runs WHERE id = 'postgres-run'`,
    );
    expect(ownerRead.rows).toEqual([{ id: "postgres-run" }]);

    const serviceRead = await queryAsRole(
      "service_role",
      `SELECT id FROM ${quotedSchema}.wizard_runs WHERE id = 'postgres-run'`,
    );
    expect(serviceRead.rows).toEqual([{ id: "postgres-run" }]);

    const [inserted, selected, updated, deleted] = await queriesAsRole("service_role", [
      `INSERT INTO ${quotedSchema}.wizard_runs (id, user_id, status, expires_at)
       VALUES ('service-run', 'service-user', 'active', now() + interval '1 hour')
       RETURNING id`,
      `SELECT id FROM ${quotedSchema}.wizard_runs WHERE id = 'service-run'`,
      `UPDATE ${quotedSchema}.wizard_runs SET status = 'completed'
       WHERE id = 'service-run' RETURNING status`,
      `DELETE FROM ${quotedSchema}.wizard_runs WHERE id = 'service-run' RETURNING id`,
    ]);
    expect(inserted?.rows).toEqual([{ id: "service-run" }]);
    expect(selected?.rows).toEqual([{ id: "service-run" }]);
    expect(updated?.rows).toEqual([{ status: "completed" }]);
    expect(deleted?.rows).toEqual([{ id: "service-run" }]);
  });
});
