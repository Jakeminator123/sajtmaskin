import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";
import { Client } from "pg";
import { config } from "dotenv";
import { assertSafeWriteTarget } from "./db-target-guard.mjs";
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
import { resolveSslConfig } from "./db-ssl.mjs";
import { DB_ENV_VARS, resolveConfiguredDbEnv } from "../../src/lib/db/env";

config({ path: ".env.local" });

export const MIGRATIONS_DIR = join(process.cwd(), "src/lib/db/migrations");

// `MIGRATION_ORDER` and `resolveMigrationRunOrder` now live in the shared,
// runtime-agnostic `./migration-order.mjs` so this script (run via tsx) and
// `db-init.mjs` (run via plain node) apply migrations in exactly the same
// order — they can no longer drift into two separate orderings. Re-exported
// here so existing importers (e.g. `run-migrations.test.ts`) keep their path.
export { MIGRATION_ORDER, resolveMigrationRunOrder };

// Delegated to the shared resolver in `src/lib/db/env.ts` so this script
// honours the same env-var convention as the runtime app and the read-side
// guards in `db-target-guard.mjs`. That includes `DATABASE_URL` (the
// "standard" Postgres alias used by some hosts and by Drizzle's own docs)
// in addition to the `POSTGRES_URL*` and `STORAGE_POSTGRES_URL*` aliases
// Vercel's Postgres integration emits. Without this, `npm run db:migrate`
// would silently fail with a "no connection configured" error against
// envs that only set `DATABASE_URL`.
export function resolveConnectionString(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const resolved = resolveConfiguredDbEnv(env, {
    warnOnUninterpolated: env.NODE_ENV === "development",
  });
  if (!resolved) {
    throw new Error(
      `No database connection configured (expected one of: ${DB_ENV_VARS.join(", ")}).`,
    );
  }
  return resolved.connectionString;
}

// SSL resolution is shared with the other DB scripts (`./db-ssl.mjs`) so that
// `sslmode=disable` — the documented local-Postgres setup — means the same thing
// everywhere. It used to be ignored here, so `db:migrate` failed on SSL against
// a URL `db:init` connected to fine. Behaviour is unchanged for every other
// sslmode (prod uses `require`).

// Session-level advisory lock that serialises migration runs against one DB.
export const MIGRATION_LOCK_KEY = "sajtmaskin:db:migrate";

// DDL needs a direct or session-mode connection: an advisory lock means nothing
// through transaction pooling (Supabase pooler port 6543), because each
// statement may land on a different backend. See docs/runbooks/db-migrations.md
// § Innan live-apply, point 4.
export function assertSessionModeTarget(connectionString: string): void {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("db:migrate could not parse the database URL; refusing to run.");
  }
  const port = url.port || "5432";
  const supabasePooler = /\.pooler\.supabase\.com$/iu.test(url.hostname);
  if (port === "6543" || (supabasePooler && port !== "5432")) {
    throw new Error(
      `db:migrate refuses ${url.hostname}:${port} (transaction pooling). ` +
        "Use the direct or session-mode URL on port 5432 (POSTGRES_URL_NON_POOLING).",
    );
  }
}

// Only files the ledger has not recorded run. Re-running recorded migrations to
// "get green" is exactly what the runbook forbids.
export function planPendingMigrations(
  filesOnDisk: readonly string[],
  applied: ReadonlySet<string>,
): string[] {
  return resolveMigrationRunOrder([...filesOnDisk]).filter((file: string) => !applied.has(file));
}

export async function requireExistingMigrationLedger(client: Pick<Client, "query">) {
  // Inspect before any DDL: creating an empty ledger loses the distinction
  // between a new database and an existing schema with missing history.
  const applied = await readAppliedMigrations(client);
  if (applied === null) {
    throw new Error(
      "schema_migrations ledger is missing; refusing to run. " +
        "Use db:init only for an empty database; reconcile existing schema/history manually.",
    );
  }
  // Preserve the existing ledger's RLS/ACL hardening, without bootstrapping it.
  await ensureMigrationLedger(client);
  return applied;
}

async function main() {
  assertSafeWriteTarget({ commandName: "db:migrate", env: process.env });
  const connStr = resolveConnectionString();
  assertSessionModeTarget(connStr);
  const cleanUrl = (() => {
    try {
      const u = new URL(connStr);
      u.searchParams.delete("sslmode");
      u.searchParams.delete("supa");
      return u.toString();
    } catch {
      return connStr;
    }
  })();
  // One client = one session, so the advisory lock covers every statement.
  const client = new Client({
    connectionString: cleanUrl,
    ssl: resolveSslConfig(connStr),
  });
  await client.connect();

  try {
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
      [MIGRATION_LOCK_KEY],
    );
    if (!lock.rows[0]?.locked) {
      throw new Error("Another migration run holds the lock on this database; refusing to run.");
    }

    try {
      const applied = await requireExistingMigrationLedger(client);

      const pending = planPendingMigrations(await readdir(MIGRATIONS_DIR), applied);
      if (pending.length === 0) {
        console.log("No pending migrations; the ledger is up to date.");
        return;
      }

      console.log(`Pending migration(s): ${pending.length}`);
      for (const file of pending) console.log(`  - ${file}`);

      for (const file of pending) {
        const sql = await readFile(join(MIGRATIONS_DIR, file), "utf-8");
        console.log(`  Running: ${file}`);
        // The migration and its ledger row commit together or not at all.
        await client.query("BEGIN");
        try {
          await client.query(sql);
          await recordAppliedMigration(client, file);
          await client.query("COMMIT");
          console.log(`  ✓ ${file}`);
        } catch (err) {
          await client.query("ROLLBACK").catch(() => {});
          const message = err instanceof Error ? err.message : String(err);
          if (isAlreadyExistsError(err)) {
            throw new Error(
              `${file}: an object already exists but the ledger has no entry for it. ` +
                "Schema and ledger disagree; inspect the database before recording anything. " +
                `(${message})`,
            );
          }
          console.error(`  ✗ ${file}: ${message}`);
          throw err;
        }
      }

      console.log(`\nApplied ${pending.length} pending migration(s).`);
    } finally {
      await client
        .query("SELECT pg_advisory_unlock(hashtext($1))", [MIGRATION_LOCK_KEY])
        .catch(() => {});
    }
  } finally {
    await client.end();
  }
}

// Only run migrations when invoked directly via `npx tsx scripts/db/run-migrations.ts`.
// Importing this module from a test (or any other tooling) must not trigger a
// real DB connection or call `process.exit`. We compare URL strings (rather
// than filesystem paths) because Windows backslash/forward-slash and casing
// differences make raw path equality unreliable across `tsx` invocations.
function isInvokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isInvokedDirectly()) {
  main().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}
