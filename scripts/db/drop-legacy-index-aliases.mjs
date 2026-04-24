/**
 * Drop legacy index aliases — EN-GÅNGS-STÄD (opt-in).
 *
 * Bakgrund: tidigare migrations skapade index med kortare namn
 * (`idx_gen_telemetry_chat`) som senare har dubblerats av Drizzle-/perf-
 * migrationer (`idx_generation_telemetry_chat`). Båda finns nu fysiskt i
 * DB:n och täcker exakt samma kolumner. Det är inte FEL — bara onödigt:
 *   - Postgres måste underhålla båda vid varje INSERT/UPDATE/DELETE
 *   - Backoffice "Databashälsa" listar dem som "extra index" (drift)
 *
 * Detta skript droppar de KÄNDA legacy-aliasen så bara den nya namnsättningen
 * (som `schema.ts` deklarerar) blir kvar. Dedupe-aware health-check fungerar
 * redan utan detta — så det är **rent kosmetiskt** och kan vänta hur länge
 * som helst.
 *
 * Säkerhet:
 *   - Default: dry-run. Visar bara vad som SKULLE droppas.
 *   - `--apply` krävs för att faktiskt köra DROP INDEX.
 *   - Före DROP verifieras att en ekvivalent moderna namn finns
 *     (annars skulle vi tappa sökfunktionalitet).
 *   - Audit-logg till `data/observability/db-drop-aliases-runs.ndjson`.
 *
 * När du ska köra detta:
 *   - Aldrig akut. Helst en lugn lördag.
 *   - Efter att `npm run db:perf-indexes` har körts framgångsrikt mot
 *     målmiljön (så de moderna namnen redan finns).
 *
 * Användning:
 *   node scripts/db/drop-legacy-index-aliases.mjs                 # dry-run
 *   node scripts/db/drop-legacy-index-aliases.mjs --apply         # faktisk drop
 *   node scripts/db/drop-legacy-index-aliases.mjs --apply --reason "..."
 */
import { Pool } from "pg";
import { config } from "dotenv";
import { mkdir, appendFile } from "fs/promises";
import { dirname, join } from "path";
import { assertSafeWriteTarget, normalizeEnvUrl } from "./db-target-guard.mjs";

config({ path: ".env.local" });
assertSafeWriteTarget({ commandName: "db:drop-legacy-aliases" });

const APPLY = process.argv.includes("--apply");
const REASON = (() => {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--reason" && i + 1 < args.length) return args[i + 1];
    const m = args[i].match(/^--reason=(.+)$/);
    if (m) return m[1];
  }
  return null;
})();

const AUDIT_LOG_PATH = join(
  process.cwd(),
  "data/observability/db-drop-aliases-runs.ndjson",
);

const connectionString =
  normalizeEnvUrl(process.env.POSTGRES_URL) ||
  normalizeEnvUrl(process.env.POSTGRES_URL_NON_POOLING) ||
  normalizeEnvUrl(process.env.STORAGE_POSTGRES_URL) ||
  normalizeEnvUrl(process.env.STORAGE_POSTGRES_URL_NON_POOLING) ||
  normalizeEnvUrl(process.env.DATABASE_URL);

if (!connectionString) {
  console.error("[db:drop-legacy-aliases] Missing database connection URL.");
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

/**
 * Kända legacy-alias som täcks av modernare namn på samma kolumner.
 * Källa: granskning 2026-04-24 av `npm run db:health` (extra_indexes).
 *
 * Format: { legacy: "x", modern: "y", table: "...", reason: "..." }
 *   - `legacy` droppas
 *   - `modern` MÅSTE finnas (verifieras före drop) för att skyddet ska gälla
 *   - `table` används för loggning och sanity-check
 */
const LEGACY_ALIASES = [
  {
    legacy: "idx_gen_telemetry_chat",
    modern: "idx_generation_telemetry_chat",
    table: "generation_telemetry",
    reason: "Drift — schema.ts kallar det idx_generation_telemetry_chat",
  },
  {
    legacy: "idx_gen_telemetry_version",
    modern: "idx_generation_telemetry_version",
    table: "generation_telemetry",
    reason: "Drift — schema.ts kallar det idx_generation_telemetry_version",
  },
  {
    legacy: "idx_gen_telemetry_created",
    modern: "idx_generation_telemetry_created",
    table: "generation_telemetry",
    reason: "Drift — schema.ts kallar det idx_generation_telemetry_created",
  },
  {
    legacy: "idx_gen_telemetry_scaffold",
    modern: null, // Det finns ingen modern motsvarighet — INTE droppas automatiskt!
    table: "generation_telemetry",
    reason:
      "Inget motsvarande deklarerat i schema.ts. Detta index täcker scaffold_id " +
      "som kan användas för analytics. Markera som 'KEEP' i loggen, droppa inte.",
  },
];

function redact(connStr) {
  try {
    const u = new URL(connStr);
    return `${u.protocol}//${u.username}:***@${u.host}${u.pathname}`;
  } catch {
    return "(invalid URL)";
  }
}

async function indexExists(name) {
  const { rows } = await pool.query(
    `SELECT 1 FROM pg_indexes WHERE indexname = $1 LIMIT 1`,
    [name],
  );
  return rows.length > 0;
}

async function getIndexColumns(name) {
  const { rows } = await pool.query(
    `SELECT indexdef FROM pg_indexes WHERE indexname = $1 LIMIT 1`,
    [name],
  );
  if (rows.length === 0) return null;
  const m = String(rows[0].indexdef).match(/\(([^)]+)\)/);
  if (!m) return null;
  return m[1]
    .split(",")
    .map((c) =>
      c
        .trim()
        .replace(/\s+(DESC|ASC)\s*$/i, "")
        .replace(/\s+NULLS\s+(FIRST|LAST)\s*$/i, "")
        .replace(/^"(.+)"$/, "$1"),
    )
    .filter(Boolean);
}

function colsEqual(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every((c, i) => c === b[i]);
}

async function run() {
  console.info(
    `[db:drop-legacy-aliases] ${APPLY ? "APPLY" : "DRY-RUN"} — kollar ${LEGACY_ALIASES.length} kända alias.`,
  );
  const decisions = [];

  try {
    for (const alias of LEGACY_ALIASES) {
      const decision = {
        legacy: alias.legacy,
        modern: alias.modern,
        table: alias.table,
        action: "skip",
        why: "",
      };

      if (!alias.modern) {
        decision.action = "keep";
        decision.why = "Ingen modern motsvarighet deklarerad → behåll";
        console.info(`  ⊙ ${alias.legacy}: KEEP — ${alias.reason}`);
        decisions.push(decision);
        continue;
      }

      const legacyExists = await indexExists(alias.legacy);
      if (!legacyExists) {
        decision.action = "skip";
        decision.why = "Legacy-namn finns inte i DB:n";
        console.info(`  ✓ ${alias.legacy}: redan borttaget`);
        decisions.push(decision);
        continue;
      }

      const modernExists = await indexExists(alias.modern);
      if (!modernExists) {
        decision.action = "abort";
        decision.why = `Modern motsvarighet "${alias.modern}" saknas — droppar INTE för att inte tappa sökfunktionalitet`;
        console.warn(
          `  ✗ ${alias.legacy}: AVBRYTER drop — ${alias.modern} saknas i DB:n. Kör 'npm run db:perf-indexes' först.`,
        );
        decisions.push(decision);
        continue;
      }

      const legacyCols = await getIndexColumns(alias.legacy);
      const modernCols = await getIndexColumns(alias.modern);
      if (!colsEqual(legacyCols, modernCols)) {
        decision.action = "abort";
        decision.why = `Kolumn-mismatch — legacy=[${legacyCols?.join(",")}] modern=[${modernCols?.join(",")}]`;
        console.warn(
          `  ✗ ${alias.legacy}: AVBRYTER — kolumn-mismatch (${decision.why}). DROPPAS INTE.`,
        );
        decisions.push(decision);
        continue;
      }

      if (!APPLY) {
        decision.action = "would_drop";
        decision.why = `Skulle droppas (täcks av ${alias.modern} på samma kolumner: [${modernCols.join(", ")}])`;
        console.info(`  ⋯ ${alias.legacy}: DRY-RUN skulle DROP INDEX (täcks av ${alias.modern})`);
        decisions.push(decision);
        continue;
      }

      const t0 = Date.now();
      try {
        await pool.query(`DROP INDEX IF EXISTS ${alias.legacy}`);
        decision.action = "dropped";
        decision.why = `Droppad (${Date.now() - t0} ms)`;
        console.info(`  - ${alias.legacy}: DROPPED (${Date.now() - t0} ms)`);
      } catch (err) {
        decision.action = "error";
        decision.why = err.message;
        console.error(`  ✗ ${alias.legacy}: DROP FAILED — ${err.message}`);
      }
      decisions.push(decision);
    }

    const dropped = decisions.filter((d) => d.action === "dropped").length;
    const wouldDrop = decisions.filter((d) => d.action === "would_drop").length;
    const aborted = decisions.filter((d) => d.action === "abort" || d.action === "error").length;
    const kept = decisions.filter((d) => d.action === "keep").length;
    const skipped = decisions.filter((d) => d.action === "skip").length;

    console.info(
      `[db:drop-legacy-aliases] Klart. dropped=${dropped} would_drop=${wouldDrop} aborted=${aborted} kept=${kept} skipped=${skipped}`,
    );

    // BUG-FIX 2026-04-24 (test-agent rapport): tidigare avslutade detta
    // skript alltid med exit 0 även om någon legacy-alias gick till
    // `abort`/`error`-state. CI/cron som förlitade sig på exit-kod kunde
    // inte upptäcka problemen. Nu speglar exit-koden om något oväntat
    // hände.
    if (aborted > 0) {
      process.exitCode = 1;
    }

    // Audit-logg
    try {
      await mkdir(dirname(AUDIT_LOG_PATH), { recursive: true });
      const entry = {
        timestamp: new Date().toISOString(),
        apply: APPLY,
        reason: REASON,
        target_redacted: redact(connectionString),
        process_user: process.env.USER || process.env.USERNAME || null,
        runtime_env:
          process.env.VERCEL_ENV ||
          (process.env.NODE_ENV === "production" ? "production" : "development"),
        summary: { dropped, would_drop: wouldDrop, aborted, kept, skipped },
        decisions,
      };
      await appendFile(AUDIT_LOG_PATH, JSON.stringify(entry) + "\n");
    } catch (auditErr) {
      console.warn(
        `[db:drop-legacy-aliases] Audit-logg kunde inte skrivas (${auditErr.message}); operation lyckades ändå.`,
      );
    }
  } finally {
    await pool.end();
  }
}

run();
