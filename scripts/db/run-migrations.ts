import { readdir } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";
import { Pool } from "pg";
import { config } from "dotenv";
import { assertSafeWriteTarget } from "./db-target-guard.mjs";
import {
  MIGRATION_ORDER,
  resolveMigrationRunOrder,
} from "./migration-order.mjs";
import { applyPendingMigrations } from "./migration-plan.mjs";
import { resolveSslConfig } from "./db-ssl.mjs";
import { DB_ENV_VARS, resolveConfiguredDbEnv } from "../../src/lib/db/env";

config({ path: ".env.local" });

export const MIGRATIONS_DIR = join(process.cwd(), "src/lib/db/migrations");

// `MIGRATION_ORDER` and `resolveMigrationRunOrder` live in the shared,
// runtime-agnostic `./migration-order.mjs`. Re-exported here so existing
// importers (e.g. `run-migrations.test.ts`) keep their path.
export { MIGRATION_ORDER, resolveMigrationRunOrder };

// Delegated to the shared resolver in `src/lib/db/env.ts` so this script
// honours the same env-var convention as the runtime app and the read-side
// guards in `db-target-guard.mjs`.
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
    ssl: resolveSslConfig(connStr),
  });

  try {
    // Drift-check the directory up front (same check loadMigrationFiles does)
    // so a missing/extra file fails before we touch the ledger.
    resolveMigrationRunOrder(await readdir(MIGRATIONS_DIR));

    const plan = await applyPendingMigrations({
      pool,
      migrationsDir: MIGRATIONS_DIR,
    });

    if (plan.toApply.length === 0) {
      console.log("\nMigration ledger already up to date.");
    } else {
      console.log(`\nApplied ${plan.toApply.length} migration(s).`);
    }
  } finally {
    await pool.end();
  }
}

// Only run migrations when invoked directly via `npx tsx scripts/db/run-migrations.ts`.
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
