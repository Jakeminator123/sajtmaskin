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
  MIGRATION_LOCK_KEY,
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

// In the standard Supabase/Vercel env, POSTGRES_URL is the transaction pooler
// (port 6543) and the *_NON_POOLING aliases are the session/direct URL (5432).
// DDL needs the latter, so migrations prefer them and fall back to the normal
// precedence only when neither is set (local Postgres, CI's throwaway DB).
export const MIGRATION_SESSION_URL_KEYS = [
  "POSTGRES_URL_NON_POOLING",
  "STORAGE_POSTGRES_URL_NON_POOLING",
] as const;

export function resolveMigrationConnectionString(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const sessionOnly = Object.fromEntries(
    MIGRATION_SESSION_URL_KEYS.map((key) => [key, env[key]]),
  ) as NodeJS.ProcessEnv;
  const session = resolveConfiguredDbEnv(sessionOnly, {
    warnOnUninterpolated: env.NODE_ENV === "development",
  });
  return session ? session.connectionString : resolveConnectionString(env);
}

// SSL resolution is shared with the other DB scripts (`./db-ssl.mjs`) so that
// `sslmode=disable` — the documented local-Postgres setup — means the same thing
// everywhere. It used to be ignored here, so `db:migrate` failed on SSL against
// a URL `db:init` connected to fine. Behaviour is unchanged for every other
// sslmode (prod uses `require`).

// Session-level advisory lock that serialises migration runs against one DB
// (shared with align-dev-preview.mjs via migration-ledger.mjs).
export { MIGRATION_LOCK_KEY };

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

/**
 * Applies the pending migrations over one client session and returns the files
 * it applied. Holds the advisory lock for the whole run; each file commits
 * together with its ledger row or not at all. Exported for the postgres-lane
 * test; `main()` wires it to the configured database.
 */
export async function runPendingMigrations({
  client,
  dir = MIGRATIONS_DIR,
  files,
  log = console.log,
}: {
  client: Client;
  dir?: string;
  /** Candidate files in run order. Defaults to the manifest order of `dir`. */
  files?: readonly string[];
  log?: (message: string) => void;
}): Promise<string[]> {
  const lock = await client.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
    [MIGRATION_LOCK_KEY],
  );
  if (!lock.rows[0]?.locked) {
    throw new Error("Another migration run holds the lock on this database; refusing to run.");
  }

  try {
    const applied = await requireExistingMigrationLedger(client);

    const pending = files
      ? files.filter((file) => !applied.has(file))
      : planPendingMigrations(await readdir(dir), applied);
    if (pending.length === 0) {
      log("No pending migrations; the ledger is up to date.");
      return [];
    }

    log(`Pending migration(s): ${pending.length}`);
    for (const file of pending) log(`  - ${file}`);

    for (const file of pending) {
      const sql = await readFile(join(dir, file), "utf-8");
      log(`  Running: ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await recordAppliedMigration(client, file);
        await client.query("COMMIT");
        log(`  ✓ ${file}`);
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

    log(`\nApplied ${pending.length} pending migration(s).`);
    return pending;
  } finally {
    await client
      .query("SELECT pg_advisory_unlock(hashtext($1))", [MIGRATION_LOCK_KEY])
      .catch(() => {});
  }
}

async function main() {
  const connStr = resolveMigrationConnectionString();
  // The write guard must judge the URL this run actually connects to, not the
  // pooled alias it would pick on its own.
  assertSafeWriteTarget({
    commandName: "db:migrate",
    env: { ...process.env, POSTGRES_URL: connStr },
  });
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
    await runPendingMigrations({ client });
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
