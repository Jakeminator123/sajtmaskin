import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";
import { Pool } from "pg";
import { config } from "dotenv";
import { assertSafeWriteTarget } from "./db-target-guard.mjs";
import {
  MIGRATION_ORDER,
  resolveMigrationRunOrder,
  isAlreadyExistsError,
} from "./migration-order.mjs";
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

function resolveSsl() {
  const raw = process.env.DB_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase();
  if (raw === "false") {
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: true };
}

async function main() {
  assertSafeWriteTarget({ commandName: "db:migrate", env: process.env });
  const connStr = resolveConnectionString();
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
  const pool = new Pool({
    connectionString: cleanUrl,
    ssl: resolveSsl(),
  });

  try {
    const files = resolveMigrationRunOrder(await readdir(MIGRATIONS_DIR));

    if (files.length === 0) {
      console.log("No migration files found.");
      return;
    }

    console.log(`Found ${files.length} migration(s):`);

    for (const file of files) {
      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf-8");
      console.log(`  Running: ${file}`);
      try {
        await pool.query(sql);
        console.log(`  ✓ ${file}`);
      } catch (err) {
        if (isAlreadyExistsError(err)) {
          console.log(`  ⊘ ${file} (already applied)`);
        } else {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`  ✗ ${file}: ${message}`);
          throw err;
        }
      }
    }

    console.log("\nAll migrations applied.");
  } finally {
    await pool.end();
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
