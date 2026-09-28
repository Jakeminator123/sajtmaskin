/**
 * Shared migration run plan — one module for control (`db:migrate:check`,
 * additive-check) and apply (`run-migrations.ts`, `db-init.mjs`).
 *
 * Rules:
 *   - Only `toApply` is executed. Ledgered filenames are not re-run.
 *   - Checksums: new successful applies store sha256. Legacy rows without a
 *     checksum are skipped (never backfilled with today's file hash, never
 *     re-run just to fill the gap). Mismatch when a checksum EXISTS is fatal.
 *   - already-exists on an unledgered file is NOT proof the whole file applied.
 *   - Ledger ensure/record failures abort the production apply path.
 *   - Session advisory lock serializes concurrent applies.
 *   - SQL containing CONCURRENTLY is not wrapped in a transaction.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  MIGRATION_ORDER,
  resolveMigrationRunOrder,
  isAlreadyExistsError,
} from "./migration-order.mjs";
import {
  ensureMigrationLedger,
  readAppliedMigrations,
  recordAppliedMigration,
} from "./migration-ledger.mjs";

/** Two-int advisory lock key pair — stable across runners. */
export const MIGRATION_LOCK_KEY1 = 0x53414a54; // 'SAJT'
export const MIGRATION_LOCK_KEY2 = 0x4d494752; // 'MIGR'

export function checksumSql(sql) {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

/**
 * Pure plan: what should control approve / apply execute?
 *
 * @param {{
 *   order?: readonly string[],
 *   applied: Map<string, { checksum: string | null }> | Set<string> | null,
 *   files: Map<string, string>,
 * }} input
 */
export function buildMigrationPlan({ order = MIGRATION_ORDER, applied, files }) {
  /** @type {Array<{ filename: string, sql: string, checksum: string }>} */
  const toApply = [];
  /** @type {Array<{ filename: string, reason: 'already-applied' | 'legacy-no-checksum' }>} */
  const skipped = [];
  /** @type {Array<{ filename: string, ledgerChecksum: string, fileChecksum: string }>} */
  const mismatches = [];

  for (const filename of order) {
    const sql = files.get(filename);
    if (typeof sql !== "string") {
      throw new Error(`Missing SQL content for planned migration: ${filename}`);
    }
    const fileChecksum = checksumSql(sql);

    if (applied === null || !applied.has(filename)) {
      toApply.push({ filename, sql, checksum: fileChecksum });
      continue;
    }

    const ledgerChecksum = (() => {
      if (applied instanceof Map) {
        const entry = applied.get(filename);
        const value = entry?.checksum;
        return typeof value === "string" && value.length > 0 ? value : null;
      }
      // Set<string> legacy test shape — treat as applied without checksum.
      return null;
    })();

    if (ledgerChecksum === null) {
      skipped.push({ filename, reason: "legacy-no-checksum" });
      continue;
    }

    if (ledgerChecksum !== fileChecksum) {
      mismatches.push({ filename, ledgerChecksum, fileChecksum });
      continue;
    }

    skipped.push({ filename, reason: "already-applied" });
  }

  return { toApply, skipped, mismatches };
}

/** Filenames the runner would execute — identical to control's pending set when mismatches are empty. */
export function planFilenamesToApply(plan) {
  return plan.toApply.map((item) => item.filename);
}

export function assertPlanExecutable(plan) {
  if (plan.mismatches.length === 0) return;
  const detail = plan.mismatches
    .map(
      (m) =>
        `${m.filename}: ledger=${m.ledgerChecksum.slice(0, 12)}… file=${m.fileChecksum.slice(0, 12)}…`,
    )
    .join("; ");
  throw new Error(
    `Checksum mismatch for ledgered migration(s) — refusing to apply or treat as in-sync: ${detail}. ` +
      `Do not rewrite applied SQL in place; add a new migration file instead.`,
  );
}

export function sqlRequiresNonTransactional(sql) {
  return /\bCONCURRENTLY\b/iu.test(sql);
}

/**
 * Load every MIGRATION_ORDER file after drift-checking the directory listing.
 *
 * @param {string} migrationsDir
 * @param {readonly string[]} [order]
 */
export async function loadMigrationFiles(migrationsDir, order = MIGRATION_ORDER) {
  const onDisk = await readdir(migrationsDir);
  resolveMigrationRunOrder(onDisk);
  /** @type {Map<string, string>} */
  const files = new Map();
  for (const filename of order) {
    files.set(filename, await readFile(join(migrationsDir, filename), "utf8"));
  }
  return files;
}

/**
 * @param {import('pg').Pool} pool
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
export async function withMigrationAdvisoryLock(pool, fn) {
  const client = await pool.connect();
  let locked = false;
  try {
    await client.query("SELECT pg_advisory_lock($1, $2)", [
      MIGRATION_LOCK_KEY1,
      MIGRATION_LOCK_KEY2,
    ]);
    locked = true;
    return await fn(client);
  } finally {
    if (locked) {
      try {
        await client.query("SELECT pg_advisory_unlock($1, $2)", [
          MIGRATION_LOCK_KEY1,
          MIGRATION_LOCK_KEY2,
        ]);
      } catch {
        // Connection may already be dead; release still runs below.
      }
    }
    client.release();
  }
}

/**
 * Contract used by tests: lock acquire SQL must precede any migration DDL.
 * @param {string[]} statements
 */
export function assertLockAcquiredBeforeApply(statements) {
  const lockIdx = statements.findIndex(
    (s) => /pg_advisory_lock/iu.test(s) && !/pg_advisory_unlock/iu.test(s),
  );
  const applyIdx = statements.findIndex(
    (s) =>
      /^\s*(BEGIN|CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|DO\b)/iu.test(s) &&
      !/schema_migrations/iu.test(s) &&
      !/pg_advisory_/iu.test(s),
  );
  if (lockIdx === -1) {
    throw new Error("Migration apply must acquire pg_advisory_lock");
  }
  if (applyIdx !== -1 && applyIdx < lockIdx) {
    throw new Error("Migration DDL must not run before advisory lock");
  }
  return true;
}

/**
 * @param {string} filename
 * @param {unknown} err
 */
export function classifyUnledgeredApplyError(filename, err) {
  if (isAlreadyExistsError(err)) {
    return new Error(
      `Migration ${filename} is not in schema_migrations but Postgres reported ` +
        `already-exists. Refusing to record a partial/ambiguous apply. Resolve ` +
        `the schema drift manually, then record or repair the ledger.`,
      { cause: err instanceof Error ? err : undefined },
    );
  }
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * Apply one planned file. Transactional when safe; records checksum only after
 * successful SQL in the same transaction (or immediately after for CONCURRENTLY).
 *
 * @param {{ query: (text: string, params?: unknown[]) => Promise<unknown> }} client
 * @param {{ filename: string, sql: string, checksum: string }} item
 */
export async function executeMigrationFile(client, item) {
  const { filename, sql, checksum } = item;
  const transactional = !sqlRequiresNonTransactional(sql);

  if (transactional) {
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await recordAppliedMigration(client, filename, checksum);
      await client.query("COMMIT");
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback failure
      }
      throw classifyUnledgeredApplyError(filename, err);
    }
    return;
  }

  try {
    await client.query(sql);
  } catch (err) {
    throw classifyUnledgeredApplyError(filename, err);
  }
  // Non-transactional: ledger write must still succeed or the run aborts.
  await recordAppliedMigration(client, filename, checksum);
}

/**
 * Full apply path shared by `run-migrations.ts` and `db-init.mjs`.
 *
 * @param {{
 *   pool: import('pg').Pool,
 *   migrationsDir: string,
 *   log?: { log: (...args: unknown[]) => void, warn?: (...args: unknown[]) => void },
 * }} options
 */
export async function applyPendingMigrations({ pool, migrationsDir, log = console }) {
  await ensureMigrationLedger(pool);
  const files = await loadMigrationFiles(migrationsDir);

  return withMigrationAdvisoryLock(pool, async (client) => {
    const applied = await readAppliedMigrations(client);
    const plan = buildMigrationPlan({ applied, files });
    assertPlanExecutable(plan);

    if (plan.toApply.length === 0) {
      log.log("No pending migrations.");
      return plan;
    }

    log.log(`Applying ${plan.toApply.length} pending migration(s):`);
    for (const item of plan.toApply) {
      log.log(`  Running: ${item.filename}`);
      await executeMigrationFile(client, item);
      log.log(`  ✓ ${item.filename}`);
    }
    return plan;
  });
}

/**
 * Pure gate used by scheduled schema-parity when default branch is preview
 * but production code lives on master.
 *
 * GitHub `schedule` always evaluates the workflow file from the repository
 * default branch; `github.ref` for that event is the default branch tip.
 * Manual dispatch must still require master before secrets are used.
 *
 * @param {{ eventName: string, ref: string }} input
 */
export function shouldRunScheduledSchemaParity({ eventName, ref }) {
  if (eventName === "schedule") return true;
  if (eventName === "workflow_dispatch" && ref === "refs/heads/master") return true;
  return false;
}
