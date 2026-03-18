import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local" });

const url =
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  "";

if (!url) {
  console.error("No POSTGRES_URL configured");
  process.exit(1);
}

const cleanUrl = (() => {
  try {
    const u = new URL(url);
    u.searchParams.delete("sslmode");
    u.searchParams.delete("supa");
    return u.toString();
  } catch {
    return url;
  }
})();

async function main() {
  const pool = new Pool({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });

  const tables = ["generation_telemetry", "version_comments", "version_approvals"];

  console.log("Verifying new DB tables...\n");
  for (const table of tables) {
    try {
      const result = await pool.query(`SELECT count(*) as cnt FROM ${table}`);
      console.log(`  ✓ ${table}: ${result.rows[0]?.cnt ?? 0} rows`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  ✗ ${table}: ${msg}`);
    }
  }

  const cols = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'generation_telemetry'
    ORDER BY ordinal_position
  `);
  console.log(`\ngeneration_telemetry schema: ${cols.rows.length} columns`);
  for (const col of cols.rows) {
    console.log(`  ${col.column_name} (${col.data_type})`);
  }

  await pool.end();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error("Verification failed:", e);
  process.exit(1);
});
