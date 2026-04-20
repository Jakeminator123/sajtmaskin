import { config } from "dotenv";
import { writeFile } from "fs/promises";
import { Pool } from "pg";

config({ path: ".env.local" });

const CHAT_ID = process.argv[2] || "76ae6530-7407-46c9-b8aa-b018fb51cf82";
const VERSION_ID = process.argv[3] || "c419bd00-5c0b-4772-82d3-0a15981d0a40";
const OUT = process.argv[4] || ".tmp-error-log.json";

async function main() {
  const url = process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (!url) throw new Error("Missing POSTGRES_URL");
  const pool = new Pool({
    connectionString: url,
    ssl: url.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
  });
  try {
    const { rows } = await pool.query(
      `SELECT id, chat_id, version_id, level, category, message, meta, created_at
       FROM engine_version_error_logs
       WHERE chat_id = $1 AND version_id = $2
       ORDER BY created_at DESC`,
      [CHAT_ID, VERSION_ID],
    );
    await writeFile(OUT, JSON.stringify({ count: rows.length, rows }, null, 2), "utf8");
    console.log(`Wrote ${rows.length} rows to ${OUT}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
