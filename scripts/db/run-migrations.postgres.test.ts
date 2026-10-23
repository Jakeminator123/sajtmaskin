// @vitest-environment node
/**
 * `runPendingMigrations` against a REAL Postgres: the per-file transaction with
 * its ledger row, rollback on failure, the already-exists stop and the advisory
 * lock. The unit tests only cover the pure helpers.
 *
 * Writes DDL and ledger rows, so it runs only against a throwaway Postgres (CI's
 * service container or a local database), never the shared DEV Supabase project.
 * Every object and ledger row carries a per-run suffix and is removed afterwards.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { config as loadEnvFile } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  checkDbEnvTarget,
  describeDbTarget,
  loadDbTargets,
  resolveConfiguredDbUrl,
} from "./check-db-env-target.mjs";
import { connectionStringForPg, resolveSslConfig } from "./db-ssl.mjs";
import { MIGRATION_LOCK_KEY } from "./migration-ledger.mjs";
import { runPendingMigrations } from "./run-migrations";

if (existsSync(".env.local")) loadEnvFile({ path: ".env.local", override: false });

function resolveThrowawayDbUrl(): { url: string | null; reason: string } {
  const resolved = resolveConfiguredDbUrl(process.env);
  if (!resolved) return { url: null, reason: "ingen databas-URL i env" };
  const verdict = checkDbEnvTarget({
    expect: "dev",
    urlValue: resolved.value,
    targets: loadDbTargets(),
  });
  if (!verdict.ok) return { url: null, reason: verdict.message };
  if (describeDbTarget(resolved.value)?.projectRef) {
    return {
      url: null,
      reason: "URL:en är ett Supabase-projekt; testet skriver i ledgern och kräver en tillfällig Postgres",
    };
  }
  return { url: resolved.value, reason: verdict.message };
}

const target = resolveThrowawayDbUrl();
const requireDb = process.env.REQUIRE_POSTGRES_TESTS?.trim() === "1";

if (!target.url) {
  const message = `[run-migrations.postgres] ingen användbar databas: ${target.reason}.`;
  if (requireDb) {
    throw new Error(
      `${message} REQUIRE_POSTGRES_TESTS=1 är satt, så ett hopp räknas som fel ` +
        "(annars hade grinden blivit grön utan att runnern testats).",
    );
  }
  console.warn(`${message} SKIPPAS.`);
}

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);
const TABLE_OK = `zz_runner_ok_${RUN}`;
const TABLE_BAD = `zz_runner_bad_${RUN}`;
const TABLE_DUP = `zz_runner_dup_${RUN}`;
const FILE_OK = `zz-runner-${RUN}-ok.sql`;
const FILE_BAD = `zz-runner-${RUN}-bad.sql`;
const FILE_DUP = `zz-runner-${RUN}-dup.sql`;

function newClient(): Client {
  return new Client({
    connectionString: connectionStringForPg(target.url!),
    ssl: resolveSslConfig(target.url!),
  });
}

describe.skipIf(!target.url)("runPendingMigrations mot riktig Postgres", () => {
  let dir: string;
  let client: Client;
  let other: Client;
  const quiet = () => {};

  async function ledgerHas(file: string): Promise<boolean> {
    const res = await other.query("SELECT 1 FROM schema_migrations WHERE filename = $1", [file]);
    return (res.rowCount ?? 0) > 0;
  }

  async function tableExists(name: string): Promise<boolean> {
    const res = await other.query("SELECT to_regclass($1) AS oid", [`public.${name}`]);
    return res.rows[0]?.oid !== null;
  }

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "run-migrations-"));
    writeFileSync(join(dir, FILE_OK), `CREATE TABLE ${TABLE_OK} (id int);`);
    // Creates a table, then fails: the whole file must roll back.
    writeFileSync(
      join(dir, FILE_BAD),
      `CREATE TABLE ${TABLE_BAD} (id int);\nSELECT * FROM zz_missing_${RUN};`,
    );
    // Non-idempotent DDL on an object that already exists without a ledger row.
    writeFileSync(join(dir, FILE_DUP), `CREATE TABLE ${TABLE_DUP} (id int);`);
    client = newClient();
    other = newClient();
    await client.connect();
    await other.connect();
  });

  afterAll(async () => {
    if (other) {
      await other
        .query("DELETE FROM schema_migrations WHERE filename LIKE $1", [`zz-runner-${RUN}-%`])
        .catch(() => {});
      await other.query(`DROP TABLE IF EXISTS ${TABLE_OK}, ${TABLE_BAD}, ${TABLE_DUP}`).catch(() => {});
      await other.end().catch(() => {});
    }
    await client?.end().catch(() => {});
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("commits a file together with its ledger row and skips it next time", async () => {
    await expect(runPendingMigrations({ client, dir, files: [FILE_OK], log: quiet })).resolves.toEqual([
      FILE_OK,
    ]);
    expect(await tableExists(TABLE_OK)).toBe(true);
    expect(await ledgerHas(FILE_OK)).toBe(true);
    await expect(runPendingMigrations({ client, dir, files: [FILE_OK], log: quiet })).resolves.toEqual([]);
  });

  it("rolls back a failing file completely and records nothing", async () => {
    await expect(runPendingMigrations({ client, dir, files: [FILE_BAD], log: quiet })).rejects.toThrow();
    expect(await tableExists(TABLE_BAD)).toBe(false);
    expect(await ledgerHas(FILE_BAD)).toBe(false);
  });

  it("stops when an object already exists without a ledger entry", async () => {
    await other.query(`CREATE TABLE ${TABLE_DUP} (id int);`);
    await expect(runPendingMigrations({ client, dir, files: [FILE_DUP], log: quiet })).rejects.toThrow(
      /already exists but the ledger has no entry/,
    );
    expect(await ledgerHas(FILE_DUP)).toBe(false);
  });

  it("releases the lock after a failed run", async () => {
    await expect(runPendingMigrations({ client, dir, files: [FILE_BAD], log: quiet })).rejects.toThrow();
    const res = await other.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [
      MIGRATION_LOCK_KEY,
    ]);
    expect(res.rows[0]?.locked).toBe(true);
    await other.query("SELECT pg_advisory_unlock(hashtext($1))", [MIGRATION_LOCK_KEY]);
  });

  it("refuses to run while another session holds the lock", async () => {
    await other.query("SELECT pg_advisory_lock(hashtext($1))", [MIGRATION_LOCK_KEY]);
    try {
      await expect(runPendingMigrations({ client, dir, files: [FILE_OK], log: quiet })).rejects.toThrow(
        /holds the lock/,
      );
    } finally {
      await other.query("SELECT pg_advisory_unlock(hashtext($1))", [MIGRATION_LOCK_KEY]);
    }
  });
});
