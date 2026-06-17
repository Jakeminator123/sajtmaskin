/**
 * Performance index migration — 2026-04-24 långbänk.
 *
 * Idempotent: alla `CREATE INDEX IF NOT EXISTS` + dedupe-aware (hoppar över
 * index som redan täcks av annat namn på samma kolumner). Säker att köra
 * om-och-om-igen mot dev OCH prod. Använder INTE `CONCURRENTLY` för att
 * fungera i transaktion; tabellerna är små nog (engine_messages: tusentals
 * rader) att kort write-lock är acceptabelt. Om du har miljontals rader:
 * kör manuellt med CONCURRENTLY.
 *
 * Kör:
 *   npm run db:perf-indexes                              # apply
 *   npm run db:perf-indexes:dry                          # dry-run
 *   node scripts/db/add-performance-indexes.mjs --reason "auto: predev"
 *
 * Auto-körning:
 *   - `npm run dev` triggar `predev` som inkluderar denna migration
 *     (samma mönster som `db:init`). Säker eftersom skriptet är idempotent
 *     och dev pekar mot dev-DB:n via `.env.local`.
 *   - I prod: backoffice-sidan "Databashälsa" har en knapp som kräver
 *     skriftlig motivering ("varför kör du detta?") + bekräftelse innan
 *     den triggar denna migration. Audit-logg skrivs till
 *     `data/observability/db-perf-indexes-runs.ndjson`.
 *
 * Bakgrund: `src/lib/db/schema.ts` deklarerar FK-relationer men Postgres
 * skapar INTE automatiskt index på FK-kolumner. Hot-path-queries som
 * `getChat()` (läser engine_messages WHERE chat_id = ?) gör då sequential
 * scans. Med dessa index blir samma query O(log N).
 *
 * Källa: docs/architecture/data-layer-overview.md §"Indexstrategi"
 *        lineage/2026-04-24-långbänk-databas-redis-observability.md
 */
import { Pool } from "pg";
import { config } from "dotenv";
import { mkdir, appendFile } from "fs/promises";
import { dirname, join } from "path";
import { assertSafeWriteTarget, normalizeEnvUrl } from "./db-target-guard.mjs";

config({ path: ".env.local" });

assertSafeWriteTarget({ commandName: "db:perf-indexes" });

const AUDIT_LOG_PATH = join(
  process.cwd(),
  "data/observability/db-perf-indexes-runs.ndjson",
);

// normalizeEnvUrl: trims, fångar uninterpolerade `${VAR}`-värden från env-puller
const connectionString =
  normalizeEnvUrl(process.env.POSTGRES_URL) ||
  normalizeEnvUrl(process.env.POSTGRES_URL_NON_POOLING) ||
  normalizeEnvUrl(process.env.STORAGE_POSTGRES_URL) ||
  normalizeEnvUrl(process.env.STORAGE_POSTGRES_URL_NON_POOLING) ||
  normalizeEnvUrl(process.env.DATABASE_URL);

if (!connectionString) {
  console.error("[db:perf-indexes] Missing database connection URL.");
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
  // Fail fast at dev start: never let predev hang if the DB is slow/unreachable.
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
  query_timeout: 15000,
});

/**
 * Indexen att lägga till. Varje rad: { name, sql, table, why }.
 * - `name` = idx-namn (måste vara unikt globalt i DB:n).
 * - `sql`  = full CREATE INDEX-sats (idempotent med IF NOT EXISTS).
 * - `table`= tabellen indexet sitter på (för rapportering).
 * - `why`  = en mening om VARFÖR indexet behövs (för loggar).
 */
const PERF_INDEXES = [
  // -------------------------------------------------------------------------
  // Engine-tabellerna (own-engine codegen). HOT PATH — varje builder-öppning
  // läser engine_messages WHERE chat_id = ? och engine_versions WHERE chat_id = ?
  // -------------------------------------------------------------------------
  {
    name: "idx_engine_messages_chat_created",
    table: "engine_messages",
    why: "getChat() läser meddelandelistan per chat ordnad på created_at",
    sql: `CREATE INDEX IF NOT EXISTS idx_engine_messages_chat_created
          ON engine_messages(chat_id, created_at)`,
  },
  {
    name: "idx_engine_versions_chat_created",
    table: "engine_versions",
    why: "Versionshistorik per chat (repair-flöden, builder-laddning)",
    sql: `CREATE INDEX IF NOT EXISTS idx_engine_versions_chat_created
          ON engine_versions(chat_id, created_at DESC)`,
  },
  {
    name: "idx_engine_generation_logs_chat_created",
    table: "engine_generation_logs",
    why: "Telemetri/admin-vyer per chat",
    sql: `CREATE INDEX IF NOT EXISTS idx_engine_generation_logs_chat_created
          ON engine_generation_logs(chat_id, created_at DESC)`,
  },
  {
    name: "idx_generation_telemetry_chat",
    table: "generation_telemetry",
    why: "Per-chat telemetri-uppslag (eval, observability)",
    sql: `CREATE INDEX IF NOT EXISTS idx_generation_telemetry_chat
          ON generation_telemetry(chat_id)`,
  },
  {
    name: "idx_generation_telemetry_version",
    table: "generation_telemetry",
    why: "Per-version telemetri-uppslag (post-checks-summary)",
    sql: `CREATE INDEX IF NOT EXISTS idx_generation_telemetry_version
          ON generation_telemetry(version_id)`,
  },
  {
    name: "idx_generation_telemetry_created",
    table: "generation_telemetry",
    why: "Tidsserie-aggregeringar (Observability-page)",
    sql: `CREATE INDEX IF NOT EXISTS idx_generation_telemetry_created
          ON generation_telemetry(created_at DESC)`,
  },

  // -------------------------------------------------------------------------
  // Version-comments / approvals (collaboration UI)
  // -------------------------------------------------------------------------
  {
    name: "idx_version_comments_version",
    table: "version_comments",
    why: "Kommentarer per version i builder",
    sql: `CREATE INDEX IF NOT EXISTS idx_version_comments_version
          ON version_comments(version_id)`,
  },
  {
    name: "idx_version_comments_chat",
    table: "version_comments",
    why: "Alla kommentarer per chat",
    sql: `CREATE INDEX IF NOT EXISTS idx_version_comments_chat
          ON version_comments(chat_id)`,
  },
  {
    name: "idx_version_approvals_version",
    table: "version_approvals",
    why: "Godkännanden per version",
    sql: `CREATE INDEX IF NOT EXISTS idx_version_approvals_version
          ON version_approvals(version_id)`,
  },
  {
    name: "idx_version_approvals_chat",
    table: "version_approvals",
    why: "Godkännanden per chat",
    sql: `CREATE INDEX IF NOT EXISTS idx_version_approvals_chat
          ON version_approvals(chat_id)`,
  },

  // -------------------------------------------------------------------------
  // Legacy v0-tabeller (chats / deployments / project_files / images)
  // -------------------------------------------------------------------------
  {
    name: "idx_chats_project",
    table: "chats",
    why: "Lista chats per projekt (navigation)",
    sql: `CREATE INDEX IF NOT EXISTS idx_chats_project
          ON chats(project_id)`,
  },
  {
    name: "idx_deployments_project",
    table: "deployments",
    why: "Senaste deploys per projekt",
    sql: `CREATE INDEX IF NOT EXISTS idx_deployments_project
          ON deployments(project_id)`,
  },
  {
    name: "idx_deployments_version",
    table: "deployments",
    why: "Hitta deploy för en specifik version",
    sql: `CREATE INDEX IF NOT EXISTS idx_deployments_version
          ON deployments(version_id)`,
  },
  {
    name: "idx_project_files_project",
    table: "project_files",
    why: "Lista filer per projekt (takeover-flöde)",
    sql: `CREATE INDEX IF NOT EXISTS idx_project_files_project
          ON project_files(project_id)`,
  },
  {
    name: "idx_images_project",
    table: "images",
    why: "Bilder per projekt",
    sql: `CREATE INDEX IF NOT EXISTS idx_images_project
          ON images(project_id)`,
  },

  // -------------------------------------------------------------------------
  // Övrigt — användarrelaterade tidsserier
  // -------------------------------------------------------------------------
  {
    name: "idx_transactions_user_created",
    table: "transactions",
    why: "Transaktionshistorik per användare ordnad på datum (pengar/saldo)",
    sql: `CREATE INDEX IF NOT EXISTS idx_transactions_user_created
          ON transactions(user_id, created_at DESC)`,
  },
  {
    name: "idx_user_audits_user_created",
    table: "user_audits",
    why: "Audit-historik per användare",
    sql: `CREATE INDEX IF NOT EXISTS idx_user_audits_user_created
          ON user_audits(user_id, created_at DESC)`,
  },
  {
    name: "idx_media_library_user_created",
    table: "media_library",
    why: "Media-tab listar nya filer först",
    sql: `CREATE INDEX IF NOT EXISTS idx_media_library_user_created
          ON media_library(user_id, created_at DESC)`,
  },
  {
    name: "idx_prompt_logs_chat",
    table: "prompt_logs",
    why: "Prompts per chat (debug & analytics)",
    sql: `CREATE INDEX IF NOT EXISTS idx_prompt_logs_chat
          ON prompt_logs(chat_id)`,
  },
  {
    name: "idx_prompt_logs_user_created",
    table: "prompt_logs",
    why: "Användares promptlogg över tid",
    sql: `CREATE INDEX IF NOT EXISTS idx_prompt_logs_user_created
          ON prompt_logs(user_id, created_at DESC)`,
  },
  {
    name: "idx_prompt_handoffs_user",
    table: "prompt_handoffs",
    why: "Hitta oanvända handoffs per användare (landing → builder)",
    sql: `CREATE INDEX IF NOT EXISTS idx_prompt_handoffs_user
          ON prompt_handoffs(user_id)`,
  },
  {
    name: "idx_company_profiles_project",
    table: "company_profiles",
    why: "Wizard-laddning per projekt",
    sql: `CREATE INDEX IF NOT EXISTS idx_company_profiles_project
          ON company_profiles(project_id)`,
  },
  {
    name: "idx_domain_orders_project",
    table: "domain_orders",
    why: "Domänorder per projekt",
    sql: `CREATE INDEX IF NOT EXISTS idx_domain_orders_project
          ON domain_orders(project_id)`,
  },
  {
    name: "idx_domain_orders_order",
    table: "domain_orders",
    why: "Slå upp domänorder via Vercel order_id (webhook callbacks)",
    sql: `CREATE INDEX IF NOT EXISTS idx_domain_orders_order
          ON domain_orders(order_id)`,
  },
];

const DRY_RUN = process.argv.includes("--dry-run");

/**
 * Plocka ut värdet från `--reason "..."` eller `--reason=...`. Används för
 * audit-loggen så vi kan svara på "varför kördes denna migration kl 03:14
 * i lördags?". `predev`-anropet skickar `--reason auto:predev`; backoffice-
 * knappen skickar användarens skrivna motivering.
 */
function parseReasonArg() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--reason" && i + 1 < args.length) return args[i + 1];
    const m = args[i].match(/^--reason=(.+)$/);
    if (m) return m[1];
  }
  return null;
}
const REASON = parseReasonArg();

async function tableExists(name) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = $1 LIMIT 1`,
    [name],
  );
  return rows.length > 0;
}

async function indexExists(name) {
  const { rows } = await pool.query(
    `SELECT 1 FROM pg_indexes WHERE indexname = $1 LIMIT 1`,
    [name],
  );
  return rows.length > 0;
}

/**
 * Returnera namnet på ett ev. existerande index som täcker EXAKT samma
 * kolumner i samma ordning på samma tabell — oavsett indexnamn. Förhindrar
 * att vi skapar duplicate-index med "skillnad bara i namnet" mot
 * tidigare manuella migrations (t.ex. `idx_gen_telemetry_chat` vs
 * `idx_generation_telemetry_chat`).
 *
 * Returnerar null om inget täckande index finns.
 */
async function findCoveringIndex(table, columns) {
  // Använd pg_get_indexdef (via pg_indexes-vyn) för att robust hämta
  // kolumnordning per index. Slipper int2vector-quirks.
  const { rows } = await pool.query(
    `SELECT indexname, indexdef FROM pg_indexes
     WHERE tablename = $1 AND schemaname = 'public'`,
    [table],
  );
  for (const r of rows) {
    const m = String(r.indexdef).match(/\(([^)]+)\)/);
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
    if (
      cols.length === columns.length &&
      cols.every((c, idx) => c === columns[idx])
    ) {
      return r.indexname;
    }
  }
  return null;
}

/**
 * Plocka ut kolumnlista från en CREATE INDEX-sats för dedupe-jämförelse.
 * Funkar för enkla "ON tabell(kol1, kol2)"-mönster (DESC/ASC normaliseras bort).
 * Returnerar null om vi inte kan parsa — då hoppar vi covering-checken.
 */
function extractColumns(sql) {
  const m = sql.match(/ON\s+\w+\s*\(([^)]+)\)/i);
  if (!m) return null;
  return m[1]
    .split(",")
    .map((c) => c.trim().replace(/\s+(DESC|ASC)\s*$/i, "").replace(/^"(.+)"$/, "$1"))
    .filter(Boolean);
}

async function run() {
  console.info(
    `[db:perf-indexes] ${DRY_RUN ? "DRY-RUN — " : ""}Lägger till ${PERF_INDEXES.length} index (alla CREATE INDEX IF NOT EXISTS).`,
  );
  let created = 0;
  let already = 0;
  let skipped = 0;
  const failures = [];

  try {
    for (const idx of PERF_INDEXES) {
      const exists = await indexExists(idx.name);
      if (exists) {
        console.info(`  ✓ ${idx.name} (finns redan)`);
        already += 1;
        continue;
      }
      const tblExists = await tableExists(idx.table);
      if (!tblExists) {
        console.warn(`  ⊘ ${idx.name} — tabell ${idx.table} finns inte; skippar`);
        skipped += 1;
        continue;
      }
      // Dedupe-skydd: finns ett *annat* index som täcker EXAKT samma kolumner?
      const cols = extractColumns(idx.sql);
      if (cols) {
        const covering = await findCoveringIndex(idx.table, cols);
        if (covering) {
          console.info(
            `  = ${idx.name} (täcks redan av befintligt index "${covering}" på samma kolumner; hoppar över)`,
          );
          already += 1;
          continue;
        }
      }
      if (DRY_RUN) {
        console.info(`  ⋯ ${idx.name} (skulle skapas på ${idx.table}) — ${idx.why}`);
        continue;
      }
      const t0 = Date.now();
      try {
        await pool.query(idx.sql);
        const ms = Date.now() - t0;
        console.info(`  + ${idx.name} (${ms} ms) — ${idx.why}`);
        created += 1;
      } catch (err) {
        console.error(`  ✗ ${idx.name} FAILED: ${err.message}`);
        failures.push({ name: idx.name, message: err.message });
      }
    }

    console.info(
      `[db:perf-indexes] Klart. created=${created} already=${already} skipped=${skipped} failed=${failures.length}`,
    );

    // Audit-logg — alltid (även dry-run) så vi vet vem som körde vad och varför.
    // Best-effort; en misslyckad write här ska inte misslyckas hela migrationen.
    try {
      await mkdir(dirname(AUDIT_LOG_PATH), { recursive: true });
      const entry = {
        timestamp: new Date().toISOString(),
        dry_run: DRY_RUN,
        reason: REASON,
        target_redacted: redactConnectionString(connectionString),
        created,
        already,
        skipped,
        failed: failures.length,
        failures: failures.length > 0 ? failures : undefined,
        process_user: process.env.USER || process.env.USERNAME || null,
        runtime_env:
          process.env.VERCEL_ENV ||
          (process.env.NODE_ENV === "production" ? "production" : "development"),
      };
      await appendFile(AUDIT_LOG_PATH, JSON.stringify(entry) + "\n");
    } catch (auditErr) {
      console.warn(
        `[db:perf-indexes] Audit-logg kunde inte skrivas (${auditErr.message}); migrationen lyckades ändå.`,
      );
    }

    if (failures.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

function redactConnectionString(connStr) {
  try {
    const url = new URL(connStr);
    return `${url.protocol}//${url.username}:***@${url.host}${url.pathname}`;
  } catch {
    return "(invalid URL)";
  }
}

run();
