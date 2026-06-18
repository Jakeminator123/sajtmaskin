#!/usr/bin/env node
/**
 * Wipe ALL Sajtmaskin-generated user sites — keep credentials & business data.
 *
 * Project restart helper: removes every generated site (and its byproducts)
 * while leaving accounts, payments and business records intact.
 *
 * DELETES (generated sites + byproducts):
 *   - engine_chats        → cascades engine_messages, engine_versions,
 *                           engine_generation_logs, engine_version_error_logs,
 *                           generation_telemetry, version_comments,
 *                           version_approvals
 *   - app_projects        → cascades project_data, project_files, images
 *   - projects (legacy v0)→ cascades chats, versions, version_error_logs,
 *                           deployments
 *   - company_profiles    (per-project onboarding; text project_id, no FK)
 *   - user_audits         (per Jake's decision: remove all audits)
 *   - prompt_handoffs     (ephemeral "pass-the-prompt" rows)
 *
 * KEEPS (credentials / business / analytics):
 *   - users (accounts, diamonds/credits, github login + export token)
 *   - transactions (Stripe ledger)
 *   - domain_orders (purchased domains — real money)
 *   - kostnadsfri_pages (lead flow)
 *   - user_integrations (per Jake's decision: keep)
 *   - media_library (user-owned media metadata)
 *   - prompt_logs (analytics; intentionally survives project deletion)
 *
 * OPTIONAL (only with --clear-cache): template_cache, registry_cache,
 *   guest_usage, page_views — all regeneratable.
 *
 * Safety:
 *   - DRY-RUN by default. Pass --apply to actually delete.
 *   - assertSafeWriteTarget() refuses to write to a prod-like target unless
 *     DB_ALLOW_PROD_LIKE_WRITE=1 (compares against .env.vercel.production.pulled).
 *   - All deletes run inside a single transaction (all-or-nothing).
 *
 * Examples:
 *   node scripts/db/wipe-generated-sites.mjs                 # dry-run (counts only)
 *   node scripts/db/wipe-generated-sites.mjs --apply         # wipe current target
 *   node scripts/db/wipe-generated-sites.mjs --apply --clear-cache
 *   DB_ALLOW_PROD_LIKE_WRITE=1 node scripts/db/wipe-generated-sites.mjs --apply   # prod
 */

import { Pool } from "pg";
import { config } from "dotenv";
import { assertSafeWriteTarget, normalizeEnvUrl, inspectDbTarget, summarizeTarget } from "./db-target-guard.mjs";

config({ path: ".env.local" });

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const CLEAR_CACHE = args.has("--clear-cache");
const CLEAR_MEDIA = args.has("--clear-media");

if (APPLY) {
  assertSafeWriteTarget({ commandName: "wipe-generated-sites" });
}

const connectionString = normalizeEnvUrl(
  process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.STORAGE_POSTGRES_URL ||
    process.env.STORAGE_POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL,
);

if (!connectionString) {
  console.error("Missing database connection URL (POSTGRES_URL / STORAGE_POSTGRES_URL / DATABASE_URL).");
  process.exit(1);
}

const url = new URL(connectionString);
const sslMode = url.searchParams.get("sslmode")?.trim().toLowerCase() || null;
url.searchParams.delete("sslmode");
url.searchParams.delete("supa");

let sslConfig;
if (sslMode === "disable") {
  sslConfig = false;
} else {
  sslConfig = {
    rejectUnauthorized:
      process.env.DB_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase() !== "false",
  };
}

const pool = new Pool({
  connectionString: url.toString(),
  ssl: sslConfig,
  connectionTimeoutMillis: 8000,
  statement_timeout: 60000,
  query_timeout: 60000,
});

// Explicit leaf-to-root deletion order. We do NOT rely on ON DELETE CASCADE
// because prod has FK drift (e.g. generation_telemetry.chat_id lacks cascade),
// so children are deleted before their parents to stay FK-safe on any target.
const DELETE_STATEMENTS = [
  // engine tree — leaf tables first
  "DELETE FROM generation_telemetry",
  "DELETE FROM version_comments",
  "DELETE FROM version_approvals",
  "DELETE FROM engine_version_error_logs",
  "DELETE FROM engine_generation_logs",
  "DELETE FROM engine_messages",
  "DELETE FROM engine_versions",
  "DELETE FROM engine_chats",
  // app_projects children, then app_projects (company_profiles before it in case an FK exists)
  "DELETE FROM project_data",
  "DELETE FROM project_files",
  "DELETE FROM images",
  "DELETE FROM company_profiles",
  "DELETE FROM app_projects",
  // legacy v0 tree — children first
  "DELETE FROM version_error_logs",
  "DELETE FROM deployments",
  "DELETE FROM versions",
  "DELETE FROM chats",
  "DELETE FROM projects",
  // standalone (FK to users kept / no FK)
  "DELETE FROM user_audits",
  "DELETE FROM prompt_handoffs",
];

const CACHE_DELETE_STATEMENTS = [
  "DELETE FROM template_cache",
  "DELETE FROM registry_cache",
  "DELETE FROM guest_usage",
  "DELETE FROM page_views",
];

// Opt-in (--clear-media): user-owned media metadata. Orphaned after a full
// site wipe; rows point at blob/local paths that no longer back a project.
const MEDIA_DELETE_STATEMENTS = ["DELETE FROM media_library"];

// Tables to report counts for (deleted-tree + kept), to prove kept data is untouched.
const REPORT_TABLES = {
  "DELETE (sites + byproducts)": [
    "app_projects",
    "engine_chats",
    "engine_versions",
    "engine_messages",
    "projects",
    "chats",
    "versions",
    "deployments",
    "project_data",
    "project_files",
    "images",
    "company_profiles",
    "user_audits",
    "prompt_handoffs",
    "generation_telemetry",
    "version_comments",
    "version_approvals",
  ],
  "KEEP (credentials / business)": [
    "users",
    "transactions",
    "domain_orders",
    "kostnadsfri_pages",
    "user_integrations",
    "media_library",
    "prompt_logs",
  ],
  "CACHE (regeneratable)": ["template_cache", "registry_cache", "guest_usage", "page_views"],
};

async function countTable(client, table) {
  try {
    const r = await client.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
    return r.rows[0].n;
  } catch (e) {
    return `ERR(${e.code ?? "?"})`;
  }
}

async function snapshot(client) {
  const out = {};
  for (const [group, tables] of Object.entries(REPORT_TABLES)) {
    out[group] = {};
    for (const t of tables) out[group][t] = await countTable(client, t);
  }
  return out;
}

function printSnapshot(label, snap) {
  console.log(`\n── ${label} ──`);
  for (const [group, counts] of Object.entries(snap)) {
    console.log(`  ${group}`);
    for (const [t, n] of Object.entries(counts)) {
      console.log(`     ${String(n).padStart(8)}  ${t}`);
    }
  }
}

async function main() {
  const inspection = inspectDbTarget(process.env);
  const client = await pool.connect();
  try {
    console.log("=".repeat(60));
    console.log(`Mode:   ${APPLY ? "APPLY (rows WILL be deleted)" : "DRY-RUN (no rows touched)"}`);
    console.log(`Target: ${summarizeTarget(inspection.current)}${inspection.isProdLike ? "  ⚠ PROD-LIKE" : ""}`);
    console.log(`Cache:  ${CLEAR_CACHE ? "will be cleared" : "kept"}`);
    console.log(`Media:  ${CLEAR_MEDIA ? "media_library will be cleared" : "kept"}`);
    console.log("=".repeat(60));

    const before = await snapshot(client);
    printSnapshot("BEFORE", before);

    if (!APPLY) {
      console.log("\nDRY-RUN complete. Re-run with --apply to delete (add --clear-cache to also clear caches).");
      return;
    }

    const stmts = [
      ...DELETE_STATEMENTS,
      ...(CLEAR_MEDIA ? MEDIA_DELETE_STATEMENTS : []),
      ...(CLEAR_CACHE ? CACHE_DELETE_STATEMENTS : []),
    ];
    await client.query("BEGIN");
    try {
      for (const sql of stmts) {
        const r = await client.query(sql);
        console.log(`  ${sql} → ${r.rowCount} rows`);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    const after = await snapshot(client);
    printSnapshot("AFTER", after);
    console.log("\nAPPLY complete. Run `npm run db:init` to ensure schema is current.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
