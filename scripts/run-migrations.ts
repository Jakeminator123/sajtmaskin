import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { Pool } from "pg";
import { config } from "dotenv";
import { resolveMigrationsDbEnv } from "../src/lib/db/env";

config({ path: ".env.local" });

const MIGRATIONS_DIR = join(process.cwd(), "src/lib/db/migrations");

function resolveConnectionString(): string {
  const resolved = resolveMigrationsDbEnv(process.env);
  if (!resolved?.connectionString) {
    throw new Error(
      "No database URL configured. Set POSTGRES_URL_NON_POOLING (recommended for migrations) or POSTGRES_URL.",
    );
  }
  return resolved.connectionString;
}

async function main() {
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
    ssl: { rejectUnauthorized: false },
  });

  try {
    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort();

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

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
