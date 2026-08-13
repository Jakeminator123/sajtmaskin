// @vitest-environment node
/**
 * Stänger false-green i CI: `db:init` loggade "Row Level Security enabled"
 * även när `CREATE POLICY … TO postgres, service_role` failade för att
 * vanilla `postgres:16` saknar `service_role`. Testerna körs mot den
 * initierade databasen (CI: `npm run db:init` före `test:postgres`).
 *
 * Read-only mot katalogtabeller — inga rader skrivs.
 */
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
    `[rls-service-role.postgres] ingen användbar dev-databas: ${target.reason}. ` +
    "Kör med en dev-POSTGRES_URL (t.ex. ur .env.local) eller CI:s tillfälliga Postgres.";
  if (requireDb) {
    throw new Error(
      `${message} REQUIRE_POSTGRES_TESTS=1 är satt, så ett hopp räknas som fel ` +
        "(annars hade grinden blivit grön utan att RLS-rollerna testats).",
    );
  }
  console.warn(`${message} SKIPPAS.`);
}

describe.skipIf(!target.url)("CI RLS-setup mot riktig Postgres", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({
      connectionString: target.url!,
      ssl: resolveSslConfig(target.url!),
      max: 2,
    });
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.end().catch(() => null);
  });

  it("service_role finns i pg_roles efter db:init", async () => {
    const res = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_roles WHERE rolname = 'service_role'
       ) AS exists`,
    );
    expect(res.rows[0]?.exists).toBe(true);
  });

  it("users_backend_full_access finns och service_role är grantee", async () => {
    const res = await pool.query<{
      policyname: string;
      roles: string[];
    }>(
      `SELECT policyname, roles
         FROM pg_policies
        WHERE tablename = 'users'
          AND policyname = 'users_backend_full_access'`,
    );
    expect(res.rowCount).toBe(1);
    expect(res.rows[0].roles).toContain("service_role");
  });

  it("minst en *_backend_full_access-policy listar service_role", async () => {
    const res = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM pg_policies
        WHERE policyname LIKE '%_backend_full_access'
          AND 'service_role' = ANY (roles)`,
    );
    expect(Number(res.rows[0]?.count)).toBeGreaterThan(0);
  });
});
