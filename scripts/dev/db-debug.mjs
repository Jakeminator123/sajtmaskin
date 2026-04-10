#!/usr/bin/env node
import pg from "pg";
import { config } from "dotenv";

config({ path: ".env.local" });

const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URL });

async function run() {
  const client = await pool.connect();
  try {
    // 1. Error logs for the version
    console.log("\n=== ERROR LOGS (version 9f29db98) ===");
    const errorLogs = await client.query(
      `SELECT id, level, category, message, meta, created_at 
       FROM engine_version_error_logs 
       WHERE version_id = $1 
       ORDER BY created_at DESC LIMIT 20`,
      ["9f29db98-1fb4-4e93-9706-4c6ac0d22d27"]
    );
    if (errorLogs.rows.length === 0) {
      console.log("No error logs found for this version.");
    }
    for (const row of errorLogs.rows) {
      console.log(`\n[${row.level}] ${row.category || "no-category"}`);
      console.log(`  message: ${row.message?.substring(0, 500)}`);
      if (row.meta) console.log(`  meta: ${JSON.stringify(row.meta).substring(0, 300)}`);
    }

    // 2. Full error log meta (quality gate details)
    console.log("\n=== FULL QUALITY GATE DETAILS ===");
    const qgLogs = await client.query(
      `SELECT level, category, message, meta 
       FROM engine_version_error_logs 
       WHERE version_id = $1 AND category LIKE '%quality-gate%'
       ORDER BY created_at DESC LIMIT 5`,
      ["9f29db98-1fb4-4e93-9706-4c6ac0d22d27"]
    );
    for (const row of qgLogs.rows) {
      console.log(`\n[${row.level}] ${row.category}`);
      console.log(JSON.stringify(row.meta, null, 2));
    }

    // 3. Server repair details
    console.log("\n=== SERVER REPAIR DETAILS ===");
    const repairLogs = await client.query(
      `SELECT level, category, message, meta 
       FROM engine_version_error_logs 
       WHERE version_id = $1 AND category = 'server-repair'
       ORDER BY created_at DESC LIMIT 5`,
      ["9f29db98-1fb4-4e93-9706-4c6ac0d22d27"]
    );
    for (const row of repairLogs.rows) {
      console.log(`\n[${row.level}] ${row.message}`);
      console.log(JSON.stringify(row.meta, null, 2));
    }

    // 4. All versions for this chat
    console.log("\n=== ALL VERSIONS FOR CHAT ===");
    const versions = await client.query(
      `SELECT id, scaffold_id, created_at, preview_blocked, verification_blocked
       FROM engine_versions 
       WHERE chat_id = $1 
       ORDER BY created_at DESC`,
      ["ac0785dd-7e79-4387-bb8e-9a254b725150"]
    );
    console.log(`Found ${versions.rows.length} versions`);
    for (const v of versions.rows) {
      console.log(`  ${v.id} | scaffold=${v.scaffold_id} | preview_blocked=${v.preview_blocked} | verify_blocked=${v.verification_blocked}`);
    }

    // 5. DB table row counts
    console.log("\n=== TABLE ROW COUNTS ===");
    const tables = ["engine_chats", "engine_versions", "engine_version_error_logs", "engine_version_files"];
    for (const table of tables) {
      try {
        const count = await client.query(`SELECT COUNT(*) FROM ${table}`);
        console.log(`  ${table}: ${count.rows[0].count} rows`);
      } catch (e) {
        console.log(`  ${table}: ERROR - ${e.message}`);
      }
    }

    // 6. Scaffold embeddings check
    console.log("\n=== SCAFFOLD EMBEDDINGS ===");
    try {
      const embeddings = await client.query(
        `SELECT COUNT(*) as total, 
                COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embedding
         FROM scaffold_embeddings`
      );
      console.log(`  Total: ${embeddings.rows[0].total}, With embedding: ${embeddings.rows[0].with_embedding}`);
    } catch (e) {
      console.log(`  scaffold_embeddings table: ${e.message}`);
    }

    // 7. Generated files for the version  
    console.log("\n=== GENERATED FILES (version 9f29db98) ===");
    const files = await client.query(
      `SELECT path, length(content) as size_bytes
       FROM engine_version_files 
       WHERE version_id = $1 
       ORDER BY path`,
      ["9f29db98-1fb4-4e93-9706-4c6ac0d22d27"]
    );
    console.log(`Found ${files.rows.length} files`);
    for (const f of files.rows) {
      console.log(`  ${f.path} (${f.size_bytes} bytes)`);
    }

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
