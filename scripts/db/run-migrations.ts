import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";
import { Pool } from "pg";
import { config } from "dotenv";
import { assertSafeWriteTarget } from "./db-target-guard.mjs";
import { DB_ENV_VARS, resolveConfiguredDbEnv } from "../../src/lib/db/env";

config({ path: ".env.local" });

export const MIGRATIONS_DIR = join(process.cwd(), "src/lib/db/migrations");

/**
 * Explicit apply order for the hand-written SQL migrations.
 *
 * Previously this script applied `readdir(...).sort()` — plain alphabetical
 * order, which is NOT dependency-aware. The filenames carry no numeric/timestamp
 * prefix, so e.g. `add-generation-telemetry-scaffold-selection.sql` (an
 * `ALTER TABLE generation_telemetry`) sorts BEFORE `add-generation-telemetry.sql`
 * (its `CREATE TABLE`) because '-' (0x2D) < '.' (0x2E). On a database where the
 * table is not already present that ordering throws "relation does not exist".
 *
 * This manifest fixes the order once (base creates before alters; FK-cascade
 * rewrites last) and `resolveMigrationRunOrder` enforces that it stays in sync
 * with the directory, so a newly added migration cannot silently fall back to
 * fragile alphabetical order. Statements stay idempotent (`IF NOT EXISTS` /
 * `ADD COLUMN IF NOT EXISTS`), so re-running in this order is safe.
 */
export const MIGRATION_ORDER: readonly string[] = [
  "add-collaboration-tables.sql",
  "add-generation-telemetry.sql",
  "add-generation-telemetry-scaffold-selection.sql",
  "add-error-log-events.sql",
  "add-engine-chat-orchestration-snapshot.sql",
  "add-engine-message-thinking.sql",
  "add-engine-version-lifecycle-stage.sql",
  "add-engine-version-edit-kind.sql",
  "add-engine-version-repair-state.sql",
  "add-engine-versions-chat-version-unique.sql",
  "add-engine-version-jobs.sql",
  "add-transactions-stripe-session-unique.sql",
  "rename-engine-version-preview-url.sql",
  "add-cascade-engine-chats-project.sql",
  "add-cascade-to-engine-fks.sql",
];

/**
 * Returns the `.sql` migrations from `filesOnDisk` in canonical apply order.
 *
 * Throws when the manifest and the directory drift apart in either direction:
 *  - a `.sql` file on disk that is missing from {@link MIGRATION_ORDER}
 *    (forces every new migration to be slotted in at a deliberate position), or
 *  - a manifest entry with no matching file on disk.
 *
 * Pure (no IO) so it is unit-testable against the real directory listing.
 */
export function resolveMigrationRunOrder(filesOnDisk: string[]): string[] {
  const sqlOnDisk = filesOnDisk.filter((f) => f.endsWith(".sql"));
  const listed = new Set(MIGRATION_ORDER);
  const onDisk = new Set(sqlOnDisk);

  const unlisted = sqlOnDisk.filter((f) => !listed.has(f));
  if (unlisted.length > 0) {
    throw new Error(
      `Migration file(s) not registered in MIGRATION_ORDER — add them at the ` +
        `correct dependency position in scripts/db/run-migrations.ts: ${unlisted.join(", ")}`,
    );
  }

  const missing = MIGRATION_ORDER.filter((f) => !onDisk.has(f));
  if (missing.length > 0) {
    throw new Error(
      `MIGRATION_ORDER lists migration(s) not found on disk: ${missing.join(", ")}`,
    );
  }

  return [...MIGRATION_ORDER];
}

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
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("already exists")) {
          console.log(`  ⊘ ${file} (already applied)`);
        } else {
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
