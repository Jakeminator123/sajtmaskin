/** Explicit, DEV-only retirement of the two unowned tables and pending mail migration. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Client } from "pg";
import { config } from "dotenv";
import {
  checkDbEnvTarget,
  describeDbTarget,
  loadDbTargets,
  resolveConfiguredDbUrl,
} from "./check-db-env-target.mjs";
import { connectionStringForPg, resolveSslConfig } from "./db-ssl.mjs";
import { readAppliedMigrations, recordAppliedMigration } from "./migration-ledger.mjs";

export const MAIL_MIGRATION = "add-kostnadsfri-mail-events.sql";
export const ARCHIVE_SCHEMA = "sajtmaskin_dev_archive";
export const RETIRED_DEV_TABLES = Object.freeze([
  "kostnadsfri_pixel_hits",
  "stripe_billing_events",
]);
const migrationPath = fileURLToPath(
  new URL(`../../src/lib/db/migrations/${MAIL_MIGRATION}`, import.meta.url),
);

export function assertDevSessionTarget(url, targets = loadDbTargets()) {
  const check = checkDbEnvTarget({ expect: "dev", urlValue: url, targets });
  const target = describeDbTarget(url);
  if (!check.ok || check.level !== "ok" || !target || target.database !== "postgres") {
    throw new Error("DEV alignment requires the registered DEV Supabase database");
  }
  if (target.port !== "5432") {
    throw new Error(
      "DEV alignment requires direct/session mode on port 5432; transaction pooling is refused",
    );
  }
  return target;
}

export function validateAlignmentPlan(plan) {
  if (!plan.ledgerPresent) throw new Error("Existing DEV migration ledger is required");
  if (plan.mailLedgered !== (plan.mailTable && plan.mailColumn)) {
    throw new Error("Mail schema and ledger disagree; refusing to infer migration history");
  }
  if (!plan.mailLedgered && (plan.mailTable || plan.mailColumn)) {
    throw new Error("Partial/unledgered mail schema; inspect before applying");
  }
  for (const table of plan.legacyTables) {
    if (table.present && table.archived)
      throw new Error(`Both public and archive contain ${table.name}`);
    if (table.present && (table.rows !== 0 || table.dependencies !== 0)) {
      throw new Error(
        `${table.name} contains data or external dependencies; retirement is refused`,
      );
    }
  }
  return plan;
}

export async function inspectAlignment(client) {
  const applied = await readAppliedMigrations(client);
  const mail = await client.query(`SELECT
    to_regclass('public.kostnadsfri_mail_events') IS NOT NULL AS table_present,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='kostnadsfri_campaign_entitlements' AND column_name='mail_message_id') AS column_present`);
  const legacyTables = [];
  for (const name of RETIRED_DEV_TABLES) {
    const found = await client.query(
      "SELECT to_regclass($1) IS NOT NULL AS present, to_regclass($2) IS NOT NULL AS archived",
      [`public.${name}`, `${ARCHIVE_SCHEMA}.${name}`],
    );
    const { present, archived } = found.rows[0];
    let rows = 0;
    let dependencies = 0;
    if (present) {
      // Names are a fixed code-owned allowlist, never caller-controlled SQL.
      rows = Number(
        (await client.query(`SELECT count(*)::text AS rows FROM public.${name}`)).rows[0].rows,
      );
      const refs = await client.query(
        `SELECT (
        (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=$1::regclass AND conrelid<>confrelid) +
        (SELECT count(*) FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal) +
        (SELECT count(*) FROM pg_depend d JOIN pg_rewrite r ON r.oid=d.objid
          WHERE d.refobjid=$1::regclass AND d.classid='pg_rewrite'::regclass AND r.ev_class<>d.refobjid)
      )::int AS dependencies`,
        [`public.${name}`],
      );
      dependencies = refs.rows[0].dependencies;
    }
    legacyTables.push({ name, present, archived, rows, dependencies });
  }
  return validateAlignmentPlan({
    ledgerPresent: applied !== null,
    mailLedgered: applied?.has(MAIL_MIGRATION) ?? false,
    mailTable: mail.rows[0].table_present,
    mailColumn: mail.rows[0].column_present,
    legacyTables,
  });
}

/** Every DDL statement and its ledger write commits or rolls back together. */
export async function applyAlignment(client, migrationSql = readFileSync(migrationPath, "utf8")) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('sajtmaskin:db:dev-preview-align'))");
    await client.query("LOCK TABLE public.schema_migrations IN EXCLUSIVE MODE");
    let plan = await inspectAlignment(client);
    for (const table of plan.legacyTables.filter((entry) => entry.present)) {
      await client.query(`LOCK TABLE public.${table.name} IN ACCESS EXCLUSIVE MODE`);
    }
    // Re-read under table locks: a row arriving after the preflight must block retirement.
    plan = await inspectAlignment(client);
    if (!plan.mailLedgered) {
      await client.query(migrationSql);
      await recordAppliedMigration(client, MAIL_MIGRATION);
    }
    if (plan.legacyTables.some((entry) => entry.present)) {
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${ARCHIVE_SCHEMA}`);
      await client.query(`REVOKE ALL ON SCHEMA ${ARCHIVE_SCHEMA} FROM PUBLIC`);
      await client.query(`DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON SCHEMA ${ARCHIVE_SCHEMA} FROM anon; END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON SCHEMA ${ARCHIVE_SCHEMA} FROM authenticated; END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN REVOKE ALL ON SCHEMA ${ARCHIVE_SCHEMA} FROM service_role; END IF;
      END $$`);
      for (const table of plan.legacyTables.filter((entry) => entry.present)) {
        await client.query(`ALTER TABLE public.${table.name} SET SCHEMA ${ARCHIVE_SCHEMA}`);
      }
    }
    const after = await inspectAlignment(client);
    if (!after.mailLedgered || after.legacyTables.some((entry) => entry.present)) {
      throw new Error("DEV alignment postcondition failed");
    }
    await client.query("COMMIT");
    return after;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  config({ path: ".env.local", quiet: true });
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const reason = args
    .find((arg) => arg.startsWith("--reason="))
    ?.slice("--reason=".length)
    .trim();
  if (apply && !reason) throw new Error("--apply requires --reason=<authorized DEV alignment>");
  const url = resolveConfiguredDbUrl()?.value;
  const target = assertDevSessionTarget(url);
  const client = new Client({
    connectionString: connectionStringForPg(url),
    ssl: resolveSslConfig(url, { allowInsecureSsl: args.includes("--allow-insecure-ssl") }),
    application_name: "sajtmaskin_dev_preview_alignment",
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  try {
    let plan;
    if (apply) {
      plan = await applyAlignment(client);
    } else {
      await client.query("BEGIN READ ONLY");
      try {
        plan = await inspectAlignment(client);
      } finally {
        await client.query("ROLLBACK");
      }
    }
    console.log(
      JSON.stringify(
        { mode: apply ? "applied" : "read-only", target, archiveSchema: ARCHIVE_SCHEMA, plan },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
