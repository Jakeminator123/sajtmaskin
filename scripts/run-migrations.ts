import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { Pool } from "pg";
import { config } from "dotenv";
import { assertSafeWriteTarget } from "./db-target-guard.mjs";

config({ path: ".env.local" });

const MIGRATIONS_DIR = join(process.cwd(), "src/lib/db/migrations");

function resolveConnectionString(): string {
  const url =
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    "";
  if (!url) throw new Error("No POSTGRES_URL configured");
  return url;
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
