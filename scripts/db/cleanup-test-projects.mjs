#!/usr/bin/env node
/**
 * Cleanup test/admin projects: keep N most recent per user, delete the rest.
 *
 * Use cases
 * - Återställ test/super-konton som hit project-cap (100 för paid, 8 för free).
 * - Snabb rensning från Streamlit-backofficen utan att gå via UI:t (som bara
 *   stödjer en delete åt gången).
 *
 * Default mode is DRY-RUN — print what would be deleted but don't touch the DB.
 * Pass `--apply` to actually delete.
 *
 * Selection (mutually exclusive):
 *   --user EMAIL          Only this user
 *   --all-test-users      All test/admin/superadmin emails (default)
 *   --user-id ID          By internal user_id (bypasses email lookup)
 *
 * Tuning:
 *   --keep N              Keep N most recent projects per user (default 4)
 *
 * Cascading delete covers (i ordning):
 * 1. generation_telemetry (FK utan cascade → engine_chats / engine_versions)
 * 2. version_comments + version_approvals (FK utan cascade → engine_chats)
 * 3. engine_chats (FK CASCADE → engine_messages, engine_versions,
 *    engine_generation_logs, engine_version_error_logs)
 * 4. app_projects (FK CASCADE → project_data, project_files, images,
 *    company_profiles, prompt_logs har ingen FK så lämnas som "soft-orphan"
 *    eftersom det är read-only telemetri)
 *
 * Examples:
 *   node scripts/db/cleanup-test-projects.mjs                       # dry-run all test users, keep 4
 *   node scripts/db/cleanup-test-projects.mjs --apply               # apply
 *   node scripts/db/cleanup-test-projects.mjs --user me@x.se --keep 10
 *   node scripts/db/cleanup-test-projects.mjs --user-id user_abc --apply
 */

import { Pool } from "pg";
import { config } from "dotenv";
import { assertSafeWriteTarget, normalizeEnvUrl } from "./db-target-guard.mjs";

config({ path: ".env.local" });

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printUsage();
  process.exit(0);
}

const APPLY = Boolean(args.apply);
const KEEP = Number.isFinite(args.keep) && args.keep >= 0 ? args.keep : 4;
const SCOPE = resolveScope(args);

if (APPLY) {
  // db-target-guard säkerställer att vi inte råkar köra mot fel DB (prod vs dev).
  assertSafeWriteTarget({ commandName: "cleanup-test-projects" });
}

const connectionString = normalizeEnvUrl(
  process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL,
);

if (!connectionString) {
  console.error("Missing database connection URL.");
  console.error("Set POSTGRES_URL or POSTGRES_URL_NON_POOLING in .env.local.");
  process.exit(1);
}

const url = new URL(connectionString);
url.searchParams.delete("sslmode");
url.searchParams.delete("supa");

const pool = new Pool({
  connectionString: url.toString(),
  ssl: {
    rejectUnauthorized:
      process.env.DB_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase() !== "false",
  },
});

const ADMIN_EMAILS_FROM_ENV = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL || "").trim().toLowerCase();
const TEST_USER_EMAIL = (process.env.TEST_USER_EMAIL || "").trim().toLowerCase();

const TEST_EMAILS = Array.from(
  new Set([...ADMIN_EMAILS_FROM_ENV, SUPERADMIN_EMAIL, TEST_USER_EMAIL].filter(Boolean)),
);

async function main() {
  const targets = await resolveTargetUsers();
  if (targets.length === 0) {
    console.error("Inga matchande användare hittades. Kontrollera --user / --user-id eller ADMIN_EMAILS/SUPERADMIN_EMAIL/TEST_USER_EMAIL i .env.local.");
    process.exit(2);
  }

  console.log(`Mode: ${APPLY ? "APPLY (rader raderas)" : "DRY-RUN (ingen rad raderas)"}`);
  console.log(`Keep: ${KEEP} senaste projekt per användare`);
  console.log(`Targets (${targets.length}): ${targets.map((u) => `${u.email}#${u.id}`).join(", ")}`);
  console.log("");

  let totalProjects = 0;
  let totalToDelete = 0;
  let totalEngineChats = 0;
  const summary = [];

  for (const user of targets) {
    const projects = await pool.query(
      `SELECT id, name, created_at, updated_at
       FROM app_projects
       WHERE user_id = $1
       ORDER BY updated_at DESC NULLS LAST, created_at DESC`,
      [user.id],
    );

    const keep = projects.rows.slice(0, KEEP);
    const toDelete = projects.rows.slice(KEEP);
    totalProjects += projects.rows.length;
    totalToDelete += toDelete.length;

    console.log(`── ${user.email} (id=${user.id}) ──`);
    console.log(`   Totalt: ${projects.rows.length} projekt | Behåller: ${keep.length} | Tar bort: ${toDelete.length}`);

    if (keep.length > 0) {
      console.log(`   Behålls (senaste ${keep.length}):`);
      for (const row of keep) {
        console.log(`      KEEP   ${row.id.padEnd(36)} ${formatDate(row.updated_at)}  ${row.name ?? ""}`);
      }
    }

    if (toDelete.length === 0) {
      console.log(`   Inget att radera för denna användare.`);
      summary.push({ email: user.email, keep: keep.length, deleted: 0, engineChats: 0 });
      console.log("");
      continue;
    }

    console.log(`   Raderas:`);
    for (const row of toDelete) {
      console.log(`      DEL    ${row.id.padEnd(36)} ${formatDate(row.updated_at)}  ${row.name ?? ""}`);
    }

    const projectIds = toDelete.map((r) => r.id);
    const engineChatRows = await pool.query(
      `SELECT id FROM engine_chats WHERE project_id = ANY($1::text[])`,
      [projectIds],
    );
    totalEngineChats += engineChatRows.rows.length;
    console.log(`   Tillhörande engine_chats: ${engineChatRows.rows.length} (raderas i samma svep)`);

    if (APPLY) {
      await deleteProjectsCascade(projectIds);
      console.log(`   ✓ Raderat ${toDelete.length} projekt + ${engineChatRows.rows.length} engine_chats.`);
    } else {
      console.log(`   (DRY-RUN — ingen rad rörd. Kör med --apply för att verkställa.)`);
    }

    summary.push({
      email: user.email,
      keep: keep.length,
      deleted: toDelete.length,
      engineChats: engineChatRows.rows.length,
    });
    console.log("");
  }

  console.log("══════════════════════════════════════════════════════");
  console.log(`TOTALT: ${totalProjects} projekt | ${totalToDelete} ska raderas | ${totalEngineChats} engine_chats`);
  if (!APPLY) {
    console.log("DRY-RUN klar. Kör om med --apply för att verkställa.");
  } else {
    console.log("APPLY klar.");
  }
  console.log("══════════════════════════════════════════════════════");
  console.log(JSON.stringify({ mode: APPLY ? "apply" : "dry-run", keep: KEEP, summary }));

  await pool.end();
}

/**
 * Cascading delete inom en transaktion. Vissa FK saknar `ON DELETE CASCADE`
 * (generation_telemetry, version_comments, version_approvals) så de måste
 * tömmas manuellt INNAN engine_chats raderas. FK med cascade (engine_messages,
 * engine_versions, engine_generation_logs, engine_version_error_logs,
 * project_data, project_files, images, company_profiles) sköts av Postgres.
 */
async function deleteProjectsCascade(projectIds) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const chatRows = await client.query(
      `SELECT id FROM engine_chats WHERE project_id = ANY($1::text[])`,
      [projectIds],
    );
    const chatIds = chatRows.rows.map((r) => r.id);

    if (chatIds.length > 0) {
      const versionRows = await client.query(
        `SELECT id FROM engine_versions WHERE chat_id = ANY($1::text[])`,
        [chatIds],
      );
      const versionIds = versionRows.rows.map((r) => r.id);

      // Tabeller utan ON DELETE CASCADE måste tömmas explicit.
      await client.query(
        `DELETE FROM generation_telemetry WHERE chat_id = ANY($1::text[])`,
        [chatIds],
      );
      if (versionIds.length > 0) {
        await client.query(
          `DELETE FROM generation_telemetry WHERE version_id = ANY($1::text[])`,
          [versionIds],
        );
        await client.query(
          `DELETE FROM version_comments WHERE version_id = ANY($1::text[])`,
          [versionIds],
        );
        await client.query(
          `DELETE FROM version_approvals WHERE version_id = ANY($1::text[])`,
          [versionIds],
        );
      }
      await client.query(
        `DELETE FROM version_comments WHERE chat_id = ANY($1::text[])`,
        [chatIds],
      );
      await client.query(
        `DELETE FROM version_approvals WHERE chat_id = ANY($1::text[])`,
        [chatIds],
      );

      await client.query(
        `DELETE FROM engine_chats WHERE id = ANY($1::text[])`,
        [chatIds],
      );
    }

    await client.query(
      `DELETE FROM app_projects WHERE id = ANY($1::text[])`,
      [projectIds],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function resolveTargetUsers() {
  if (SCOPE.userId) {
    const rows = await pool.query(
      `SELECT id, email FROM users WHERE id = $1 LIMIT 1`,
      [SCOPE.userId],
    );
    return rows.rows;
  }

  if (SCOPE.email) {
    const rows = await pool.query(
      `SELECT id, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [SCOPE.email],
    );
    return rows.rows;
  }

  if (TEST_EMAILS.length === 0) {
    return [];
  }

  const rows = await pool.query(
    `SELECT id, email FROM users WHERE LOWER(email) = ANY($1::text[]) ORDER BY email`,
    [TEST_EMAILS],
  );
  return rows.rows;
}

function resolveScope(parsed) {
  if (parsed.userId) return { userId: parsed.userId };
  if (parsed.user) return { email: parsed.user };
  return { allTestUsers: true };
}

function parseArgs(argv) {
  const out = { keep: 4 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") out.apply = true;
    else if (arg === "--dry-run") out.apply = false;
    else if (arg === "--all-test-users") out.allTestUsers = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--keep") out.keep = Number(argv[++i]);
    else if (arg.startsWith("--keep=")) out.keep = Number(arg.slice(7));
    else if (arg === "--user") out.user = argv[++i];
    else if (arg.startsWith("--user=")) out.user = arg.slice(7);
    else if (arg === "--user-id") out.userId = argv[++i];
    else if (arg.startsWith("--user-id=")) out.userId = arg.slice(10);
    else {
      console.error(`Okänt argument: ${arg}`);
      out.help = true;
    }
  }
  return out;
}

function printUsage() {
  console.log(`Usage: node scripts/db/cleanup-test-projects.mjs [options]

  --apply               Verkställ raderingen (default är DRY-RUN)
  --keep N              Behåll N senaste projekt per användare (default 4)
  --user EMAIL          Bara den här användaren
  --user-id ID          Bara denna user_id
  --all-test-users      ADMIN_EMAILS + SUPERADMIN_EMAIL + TEST_USER_EMAIL (default)
  -h, --help            Visa detta meddelande
`);
}

function formatDate(value) {
  if (!value) return "-".padEnd(20);
  return new Date(value).toISOString().slice(0, 19).replace("T", " ");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
