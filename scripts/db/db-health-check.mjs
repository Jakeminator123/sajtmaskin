#!/usr/bin/env node
/**
 * Databashälsa — read-only diagnostics för backofficen.
 *
 * Producerar en JSON-rapport till stdout med:
 *   - target            (host/port/db, redacted för säkerhet)
 *   - connection        (latency_ms + ok)
 *   - tables[]          (för varje förväntad tabell):
 *       name, exists, row_count_estimate, row_count_exact,
 *       has_pk, indexes[], expected_indexes_present, latency_ms
 *   - missing_indexes[] (förväntade men ej skapade — viktigt!)
 *   - extra_indexes[]   (finns i DB men inte deklarerade i schema.ts)
 *   - summary           (counts + samlad latens)
 *
 * Används av backoffice/pages/database_health.py via subprocess.
 *
 * Säkerhet: ENBART SELECT/EXPLAIN. Ingen mutation. Säker att köra mot prod.
 *
 * Användning:
 *   node scripts/db/db-health-check.mjs [--snapshot]
 *
 * --snapshot lägger till en rad i data/observability/db-health-snapshots.ndjson
 * (för historik/grafer i backofficen).
 */
import { Pool } from "pg";
import { config } from "dotenv";
import { mkdir, appendFile } from "fs/promises";
import { dirname, join } from "path";
import { normalizeEnvUrl, warnIfProdLikeReadTarget } from "./db-target-guard.mjs";

config({ path: ".env.local" });

const SNAPSHOT_FLAG = process.argv.includes("--snapshot");
const SNAPSHOT_PATH = join(
  process.cwd(),
  "data/observability/db-health-snapshots.ndjson",
);

// Förväntade tabeller — synkad med src/lib/db/schema.ts. Om en tabell läggs
// till i schemat, lägg till den här också så hälsokollen ser den.
const EXPECTED_TABLES = [
  // Legacy v0 / projekt
  "projects",
  "chats",
  "versions",
  "version_error_logs",
  "deployments",
  // App-tabeller
  "app_projects",
  "prompt_handoffs",
  "prompt_logs",
  "project_data",
  "project_files",
  "images",
  "media_library",
  // Användare & integrations
  "users",
  "user_integrations",
  "transactions",
  "guest_usage",
  "company_profiles",
  "template_cache",
  "registry_cache",
  // Analytics
  "page_views",
  "user_audits",
  // Kostnadsfri
  "kostnadsfri_pages",
  // Engine (own-engine codegen)
  "engine_chats",
  "engine_messages",
  "engine_versions",
  "engine_generation_logs",
  "engine_version_error_logs",
  "engine_version_jobs",
  "generation_telemetry",
  "version_comments",
  "version_approvals",
  // Domains
  "domain_orders",
];

// Förväntade index — synkad med src/lib/db/schema.ts + scripts/db/db-init.mjs
// + scripts/db/add-performance-indexes.mjs. Varje index har namn + kolumner;
// `db-health-check` rapporterar "missing" först när NEITHER namnet existerar
// NOR ett annat index täcker exakt samma kolumner (covering-aware).
const EXPECTED_INDEXES_WITH_COLUMNS = {
  engine_messages: [
    { name: "idx_engine_messages_chat_created", columns: ["chat_id", "created_at"] },
  ],
  engine_versions: [
    { name: "engine_versions_chat_version_unique", columns: ["chat_id", "version_number"] },
    { name: "idx_engine_versions_chat_created", columns: ["chat_id", "created_at"] },
  ],
  engine_generation_logs: [
    { name: "idx_engine_generation_logs_chat_created", columns: ["chat_id", "created_at"] },
  ],
  generation_telemetry: [
    { name: "idx_generation_telemetry_chat", columns: ["chat_id"] },
    { name: "idx_generation_telemetry_version", columns: ["version_id"] },
    { name: "idx_generation_telemetry_created", columns: ["created_at"] },
  ],
  version_comments: [
    { name: "idx_version_comments_version", columns: ["version_id"] },
    { name: "idx_version_comments_chat", columns: ["chat_id"] },
  ],
  version_approvals: [
    { name: "idx_version_approvals_version", columns: ["version_id"] },
    { name: "idx_version_approvals_chat", columns: ["chat_id"] },
  ],
  chats: [{ name: "idx_chats_project", columns: ["project_id"] }],
  versions: [
    { name: "idx_versions_chat_id", columns: ["chat_id"] },
    // 2026-04-24: synkad med schema.ts (`idx_versions_chat_v0_version_unique`).
    // Tidigare hette det `versions_chat_version_idx` här men det finns inte
    // i någon runtime-källa.
    {
      name: "idx_versions_chat_v0_version_unique",
      columns: ["chat_id", "v0_version_id"],
    },
  ],
  version_error_logs: [
    { name: "idx_version_error_logs_chat_id", columns: ["chat_id"] },
    { name: "idx_version_error_logs_version_id", columns: ["version_id"] },
  ],
  engine_version_error_logs: [
    { name: "idx_engine_version_error_logs_chat_id", columns: ["chat_id"] },
    { name: "idx_engine_version_error_logs_version_id", columns: ["version_id"] },
  ],
  // Codex P3: declare the lease indexes so migrated DBs don't report them as
  // `extra_indexes`. Both are required by the acquire path: the partial unique
  // index enforces one active lease per version_id; the plain index speeds the
  // per-version lease/precheck lookups.
  //
  // Codex P2 (distinguish the unique partial lock): both indexes cover
  // version_id, so a column-only match would let the plain index "alias" the
  // partial UNIQUE one — hiding a broken migration where `acquireVersionLease`'s
  // `ON CONFLICT (version_id) WHERE status='running'` upsert would silently fail.
  // `unique`/`partial` force the cover candidate to share those properties.
  engine_version_jobs: [
    {
      name: "engine_version_jobs_active_uq",
      columns: ["version_id"],
      unique: true,
      partial: true,
    },
    { name: "idx_engine_version_jobs_version", columns: ["version_id"] },
  ],
  deployments: [
    { name: "idx_deployments_chat_id", columns: ["chat_id"] },
    { name: "idx_deployments_project", columns: ["project_id"] },
    { name: "idx_deployments_version", columns: ["version_id"] },
    { name: "idx_deployments_vercel_deployment_id", columns: ["vercel_deployment_id"] },
  ],
  app_projects: [
    { name: "idx_app_projects_user_id", columns: ["user_id"] },
    { name: "idx_app_projects_session_id", columns: ["session_id"] },
  ],
  prompt_handoffs: [
    { name: "idx_prompt_handoffs_created_at", columns: ["created_at"] },
    { name: "idx_prompt_handoffs_consumed_at", columns: ["consumed_at"] },
    { name: "idx_prompt_handoffs_user", columns: ["user_id"] },
  ],
  prompt_logs: [
    { name: "idx_prompt_logs_created_at", columns: ["created_at"] },
    { name: "idx_prompt_logs_chat", columns: ["chat_id"] },
    { name: "idx_prompt_logs_user_created", columns: ["user_id", "created_at"] },
  ],
  project_files: [{ name: "idx_project_files_project", columns: ["project_id"] }],
  images: [{ name: "idx_images_project", columns: ["project_id"] }],
  media_library: [
    { name: "idx_media_library_user_id", columns: ["user_id"] },
    { name: "idx_media_library_project_id", columns: ["project_id"] },
    { name: "idx_media_library_user_created", columns: ["user_id", "created_at"] },
  ],
  users: [{ name: "users_email_idx", columns: ["email"] }],
  user_integrations: [
    {
      name: "user_integrations_owner_project_type_idx",
      columns: ["user_id", "project_id", "integration_type"],
    },
    { name: "idx_user_integrations_user_id", columns: ["user_id"] },
    { name: "idx_user_integrations_project_id", columns: ["project_id"] },
  ],
  transactions: [
    { name: "transactions_stripe_session_idx", columns: ["stripe_session_id"] },
    { name: "idx_transactions_user_id", columns: ["user_id"] },
    { name: "idx_transactions_user_created", columns: ["user_id", "created_at"] },
  ],
  guest_usage: [{ name: "guest_usage_session_idx", columns: ["session_id"] }],
  company_profiles: [{ name: "idx_company_profiles_project", columns: ["project_id"] }],
  template_cache: [
    { name: "template_cache_template_user_idx", columns: ["template_id", "user_id"] },
  ],
  registry_cache: [
    {
      name: "registry_cache_source_style_idx",
      columns: ["base_url", "style", "source"],
    },
  ],
  page_views: [
    { name: "idx_page_views_created_at", columns: ["created_at"] },
    { name: "idx_page_views_path", columns: ["path"] },
  ],
  user_audits: [
    { name: "idx_user_audits_user_id", columns: ["user_id"] },
    { name: "idx_user_audits_user_created", columns: ["user_id", "created_at"] },
  ],
  domain_orders: [
    { name: "idx_domain_orders_project", columns: ["project_id"] },
    { name: "idx_domain_orders_order", columns: ["order_id"] },
  ],
};

const ENABLE_EXACT_COUNT = process.argv.includes("--exact-count");

function redactConnectionString(connStr) {
  try {
    const url = new URL(connStr);
    return `${url.protocol}//${url.username}:***@${url.host}${url.pathname}`;
  } catch {
    return "(invalid URL)";
  }
}

const connectionString = normalizeEnvUrl(
  process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.STORAGE_POSTGRES_URL ||
    process.env.STORAGE_POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL,
);

if (!connectionString) {
  // BUG-FIX 2026-04-24 (review-agent): tidigare console.error gjorde att
  // backoffice (som läser stdout via subprocess.run) bara såg tomt svar
  // och tappade konfig-fail-grenens schema. Skicka JSON till stdout så
  // database_health.py kan rendera felet meningsfullt.
  console.log(
    JSON.stringify({ ok: false, error: "Missing database connection URL." }),
  );
  process.exit(1);
}

const inspection = warnIfProdLikeReadTarget({ commandName: "db:health" });

const url = new URL(connectionString);
url.searchParams.delete("sslmode");
url.searchParams.delete("supa");

const pool = new Pool({
  connectionString: url.toString(),
  ssl: {
    rejectUnauthorized:
      process.env.DB_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase() !== "false",
  },
  max: 2,
  connectionTimeoutMillis: 10_000,
});

async function timed(fn) {
  const t0 = Date.now();
  try {
    const result = await fn();
    return { result, latency_ms: Date.now() - t0, error: null };
  } catch (err) {
    return { result: null, latency_ms: Date.now() - t0, error: err.message };
  }
}

async function getTableInfo(name) {
  const exists = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public' LIMIT 1`,
    [name],
  );
  if (exists.rows.length === 0) {
    return { name, exists: false };
  }

  const idxRows = await pool.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = $1 AND schemaname = 'public' ORDER BY indexname`,
    [name],
  );
  const indexes = idxRows.rows.map((r) => r.indexname);

  // Hämta faktiska kolumner per index via pg_get_indexdef. Robustare än
  // att joina pg_index/pg_attribute (slipper int2vector-quirks).
  const idxDefRows = await pool.query(
    `SELECT indexname, indexdef FROM pg_indexes
     WHERE tablename = $1 AND schemaname = 'public'`,
    [name],
  );
  const indexMeta = new Map();
  for (const r of idxDefRows.rows) {
    // indexdef är t.ex.:
    //   CREATE INDEX foo ON public.bar USING btree (col1, col2 DESC)
    //   CREATE UNIQUE INDEX foo ON public.bar USING btree (col1)
    //   CREATE UNIQUE INDEX foo ON public.bar USING btree (col1) WHERE (status = 'running')
    const def = String(r.indexdef);
    const m = def.match(/\(([^)]+)\)/);
    if (!m) continue;
    const cols = m[1]
      .split(",")
      .map((c) =>
        c
          .trim()
          .replace(/\s+(DESC|ASC)\s*$/i, "")
          .replace(/\s+NULLS\s+(FIRST|LAST)\s*$/i, "")
          .replace(/^"(.+)"$/, "$1"),
      )
      .filter(Boolean);
    const unique = /CREATE\s+UNIQUE\s+INDEX/i.test(def);
    // A partial index has a trailing WHERE predicate (after the column list).
    const partial = /\)\s+WHERE\s+/i.test(def);
    indexMeta.set(r.indexname, { cols, unique, partial });
  }

  const pkRows = await pool.query(
    `SELECT 1 FROM information_schema.table_constraints
     WHERE table_name = $1 AND constraint_type = 'PRIMARY KEY' LIMIT 1`,
    [name],
  );
  const has_pk = pkRows.rows.length > 0;

  // Snabb estimate via pg_class.reltuples (ej låsande, snabb även på stora tabeller)
  const estRows = await pool.query(
    `SELECT reltuples::bigint AS estimate FROM pg_class WHERE relname = $1 AND relkind = 'r' LIMIT 1`,
    [name],
  );
  const row_count_estimate = Number(estRows.rows[0]?.estimate ?? 0);

  let row_count_exact = null;
  let exact_count_latency_ms = null;
  if (ENABLE_EXACT_COUNT) {
    const t = await timed(() => pool.query(`SELECT COUNT(*)::bigint AS n FROM ${name}`));
    row_count_exact = t.error ? null : Number(t.result.rows[0].n);
    exact_count_latency_ms = t.latency_ms;
  }

  // Test queryable: gör en SELECT 1 LIMIT 1 (ska gå snabbt)
  const probe = await timed(() => pool.query(`SELECT 1 FROM ${name} LIMIT 1`));

  // Hitta saknade index. Ett index räknas som "närvarande" om antingen
  // (a) namnet finns, eller (b) ett annat index täcker EXAKT samma
  // kolumner i samma ordning (covering). Det senare hindrar falska
  // "missing"-larm när tidigare migrations skapat samma index med
  // alternativt namn (t.ex. `idx_gen_telemetry_chat`).
  const expected = EXPECTED_INDEXES_WITH_COLUMNS[name] || [];
  const present = new Set(indexes);
  const missing = [];
  const aliasedFor = {};
  for (const e of expected) {
    if (present.has(e.name)) continue;
    let coveredBy = null;
    if (e.columns) {
      for (const [iname, meta] of indexMeta.entries()) {
        const icols = meta.cols;
        if (
          icols.length === e.columns.length &&
          icols.every((c, idx) => c === e.columns[idx]) &&
          // A cover for a UNIQUE/partial expected index must share those
          // properties — otherwise a plain index would mask a missing partial
          // unique lock index (Codex P2).
          (!e.unique || meta.unique) &&
          (!e.partial || meta.partial)
        ) {
          coveredBy = iname;
          break;
        }
      }
    }
    if (coveredBy) {
      aliasedFor[e.name] = coveredBy;
    } else {
      missing.push(e.name);
    }
  }

  return {
    name,
    exists: true,
    has_pk,
    indexes,
    expected_indexes: expected.map((e) => e.name),
    missing_indexes: missing,
    aliased_indexes: aliasedFor, // {expected_name: actual_alias_in_db}
    row_count_estimate,
    row_count_exact,
    exact_count_latency_ms,
    probe_latency_ms: probe.latency_ms,
    probe_error: probe.error,
  };
}

async function run() {
  const startedAt = new Date().toISOString();
  const connTest = await timed(() => pool.query(`SELECT 1 AS ok`));

  if (connTest.error) {
    const out = {
      ok: false,
      timestamp: startedAt,
      target: redactConnectionString(connectionString),
      connection: { ok: false, latency_ms: connTest.latency_ms, error: connTest.error },
      tables: [],
    };
    console.log(JSON.stringify(out));
    await pool.end();
    process.exit(1);
  }

  const tables = [];
  const allMissingIndexes = [];

  for (const name of EXPECTED_TABLES) {
    const info = await getTableInfo(name);
    tables.push(info);
    if (info.exists && info.missing_indexes && info.missing_indexes.length > 0) {
      for (const idxName of info.missing_indexes) {
        allMissingIndexes.push({ table: name, index: idxName });
      }
    }
  }

  // Hitta extra index i DB:n som INTE deklarerats i schema.ts/perf-script
  // (kan tyda på drift eller manuell index-skapelse)
  const allDeclared = new Set();
  for (const idxs of Object.values(EXPECTED_INDEXES_WITH_COLUMNS)) {
    for (const i of idxs) allDeclared.add(i.name);
  }
  // PK-index har Postgres-genererade namn (foo_pkey) — exkludera dem.
  // _key-suffix kommer från UNIQUE-constraints (autonames) — också benigna.
  const extraRows = await pool.query(
    `SELECT tablename, indexname FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname NOT LIKE '%_pkey'
       AND indexname NOT LIKE '%_key'
       AND tablename = ANY($1::text[])
     ORDER BY tablename, indexname`,
    [EXPECTED_TABLES],
  );
  // Samla även in alla indexnamn som finns "aliased for" — alltså ett annat
  // namn än det förväntade men som täcker exakt samma kolumner. Dessa SKA
  // INTE rapporteras som "extra" (de uppfyller en förväntad funktion).
  const aliasedSet = new Set();
  for (const t of tables) {
    if (!t.aliased_indexes) continue;
    for (const aliasName of Object.values(t.aliased_indexes)) {
      aliasedSet.add(aliasName);
    }
  }
  const extraIndexes = extraRows.rows
    .filter((r) => !allDeclared.has(r.indexname) && !aliasedSet.has(r.indexname))
    .map((r) => ({ table: r.tablename, index: r.indexname }));

  const totalRows = tables
    .filter((t) => t.exists)
    .reduce((sum, t) => sum + (t.row_count_estimate || 0), 0);

  const totalTablesMissing = tables.filter((t) => !t.exists).length;
  const tableProbeFailures = tables.filter(
    (t) => t.exists && t.probe_error,
  ).length;

  const out = {
    // BUG-FIX 2026-04-24: tidigare ignorerades saknade tabeller helt — `ok`
    // kunde vara `true` även när hälften av tabellerna saknades. Nu räknas
    // saknade tabeller OCH probe-fel (kunde inte göra SELECT 1 LIMIT 1) som
    // hälsoproblem. Index-saknande är fortsatt en del av `ok` för att
    // backoffice-knappen "Applicera index" ska göras synligt aktuell.
    ok:
      connTest.error === null &&
      totalTablesMissing === 0 &&
      tableProbeFailures === 0 &&
      allMissingIndexes.length === 0,
    timestamp: startedAt,
    target: redactConnectionString(connectionString),
    is_prod_like: inspection.isProdLike,
    connection: { ok: true, latency_ms: connTest.latency_ms, error: null },
    summary: {
      total_tables_expected: EXPECTED_TABLES.length,
      total_tables_present: tables.filter((t) => t.exists).length,
      total_tables_missing: totalTablesMissing,
      total_table_probe_failures: tableProbeFailures,
      total_rows_estimate: totalRows,
      total_indexes_missing: allMissingIndexes.length,
      total_indexes_extra: extraIndexes.length,
    },
    tables,
    missing_indexes: allMissingIndexes,
    extra_indexes: extraIndexes,
  };

  if (SNAPSHOT_FLAG) {
    try {
      await mkdir(dirname(SNAPSHOT_PATH), { recursive: true });
      const snapshot = {
        timestamp: out.timestamp,
        connection_latency_ms: out.connection.latency_ms,
        total_rows_estimate: out.summary.total_rows_estimate,
        total_tables_present: out.summary.total_tables_present,
        total_indexes_missing: out.summary.total_indexes_missing,
        per_table: tables
          .filter((t) => t.exists)
          .map((t) => ({
            name: t.name,
            row_count_estimate: t.row_count_estimate,
            probe_latency_ms: t.probe_latency_ms,
          })),
      };
      await appendFile(SNAPSHOT_PATH, JSON.stringify(snapshot) + "\n");
    } catch (err) {
      // Non-fatal — snapshot är best-effort
      out.snapshot_error = err.message;
    }
  }

  console.log(JSON.stringify(out));
  await pool.end();
  // Exit-kod speglar `out.ok` så CI-pipelines / cron-jobb / health-monitorer
  // kan upptäcka när något är fel (saknat index, connection error, etc).
  // Backoffice-sidan parser stdout oavsett exit-kod så denna ändring
  // bryter inte database_health.py. För användning där exit alltid ska
  // vara 0 (t.ex. info-only logging), kör med `|| true` i shell.
  process.exit(out.ok ? 0 : 1);
}

run().catch(async (err) => {
  // BUG-FIX 2026-04-24: stdout (inte stderr) så backoffice ser fatal-payload.
  // Speglar fatalErrorReport-grenen i strict schema (kräver stack).
  console.log(JSON.stringify({ ok: false, error: err.message, stack: err.stack }));
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
