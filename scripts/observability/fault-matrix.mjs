/**
 * Read-only aggregate view of `error_log_events` — the cross-run fault/fix
 * matrix ("fel / åtgärd / lyckades?"). Groups by `fault` with counts, a
 * `result` breakdown, the dominant fixer, and last-seen time.
 *
 * The existing human-facing observability (`npm run faults:report`, the
 * backoffice "Error-log RAG" page) reads only LOCAL NDJSON — so when you test
 * on Vercel *production* the recurring-fault picture there is invisible. This
 * script reads the DURABLE Postgres store instead, and can point at prod.
 *
 *   node scripts/observability/fault-matrix.mjs                 # dev (.env.local)
 *   node scripts/observability/fault-matrix.mjs --prod          # prod snapshot
 *   node scripts/observability/fault-matrix.mjs --prod --json   # machine-readable (backoffice)
 *   node scripts/observability/fault-matrix.mjs --limit 30
 *
 * Read-only: SELECT only, never writes. `--prod` reads
 * `.env.vercel.production.pulled` (pull it first with
 * `vercel env pull .env.vercel.production.pulled --environment=production --yes`)
 * and allows the self-signed prod cert automatically.
 */
import fs from "node:fs";
import { config } from "dotenv";
import pg from "pg";
import { normalizeEnvUrl, warnIfProdLikeReadTarget } from "../db/db-target-guard.mjs";

const argv = process.argv.slice(2);
const useProd = argv.includes("--prod");
const wantJson = argv.includes("--json");
const allowInsecureSsl = useProd || argv.includes("--allow-insecure-ssl");
const limitIdx = argv.indexOf("--limit");
const limit =
  limitIdx !== -1 ? Math.max(1, Math.min(Number(argv[limitIdx + 1]) || 25, 200)) : 25;

const PROD_ENV_FILE = ".env.vercel.production.pulled";
const envFile = useProd ? PROD_ENV_FILE : ".env.local";

function fail(message) {
  if (wantJson) process.stdout.write(JSON.stringify({ ok: false, error: message }));
  else console.error(message);
  process.exit(1);
}

if (useProd && !fs.existsSync(PROD_ENV_FILE)) {
  fail(
    `--prod requires ${PROD_ENV_FILE}. Pull it first:\n` +
      `  vercel env pull ${PROD_ENV_FILE} --environment=production --yes`,
  );
}

// `override: useProd` so the pulled prod file wins over any POSTGRES_URL already
// present in the shell (the dev/prod footgun `latest-site.mjs` documents).
config({ path: envFile, override: useProd, quiet: true });
if (!wantJson) warnIfProdLikeReadTarget({ commandName: "faults:matrix" });

const cs = normalizeEnvUrl(
  process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.STORAGE_POSTGRES_URL ||
    process.env.STORAGE_POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL,
);
if (!cs) fail(`Database URL missing in ${envFile} (POSTGRES_URL / DATABASE_URL).`);

const url = new URL(cs);
url.searchParams.delete("sslmode");
url.searchParams.delete("supa");

function resolveSsl() {
  const raw = process.env.DB_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase();
  if (raw === "false" || allowInsecureSsl) return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
}

const pool = new pg.Pool({ connectionString: url.toString(), ssl: resolveSsl() });

async function tableExists(name) {
  const r = await pool.query(
    "select 1 from information_schema.tables where table_schema='public' and table_name=$1 limit 1",
    [name],
  );
  return r.rowCount === 1;
}

try {
  if (!(await tableExists("error_log_events"))) {
    if (wantJson) {
      process.stdout.write(JSON.stringify({ ok: true, tableMissing: true, faults: [] }));
    } else {
      console.log(`error_log_events saknas i ${envFile}-databasen.`);
    }
    await pool.end();
    process.exit(0);
  }

  const totals = await pool.query(
    "select count(*)::int as rows, count(distinct fault)::int as faults from error_log_events",
  );

  // Per-fault aggregate: total, distinct chats, result breakdown, dominant
  // fixer, last-seen. `result` values are surfaced verbatim (no hardcoded
  // success label) so the matrix stays honest across schema evolution.
  const perFault = await pool.query(
    `select fault,
            count(*)::int as total,
            count(distinct chat_id)::int as chats,
            max(created_at) as last_seen,
            jsonb_object_agg(coalesce(result, 'unknown'), rc) as result_breakdown,
            (array_agg(fixer order by fc desc) filter (where fixer is not null))[1] as top_fixer
     from (
       select fault, chat_id, result, fixer, created_at,
              count(*) over (partition by fault, result) as rc,
              count(*) over (partition by fault, fixer) as fc
       from error_log_events
     ) t
     group by fault
     order by total desc
     limit $1`,
    [limit],
  );

  if (wantJson) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        env: envFile,
        totalRows: totals.rows[0].rows,
        distinctFaults: totals.rows[0].faults,
        faults: perFault.rows,
      }),
    );
  } else {
    console.log(
      `fault-matrix (${envFile}) — ${totals.rows[0].rows} rader, ${totals.rows[0].faults} distinkta fel\n`,
    );
    for (const r of perFault.rows) {
      const breakdown = Object.entries(r.result_breakdown || {})
        .map(([k, v]) => `${k}:${v}`)
        .join(" ");
      console.log(
        `${String(r.total).padStart(4)}  ${r.fault}\n` +
          `        chats=${r.chats}  fixer=${r.top_fixer ?? "-"}  result=[${breakdown}]  last=${new Date(r.last_seen).toISOString()}`,
      );
    }
  }
  await pool.end();
} catch (e) {
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  fail(`fault_matrix_error: ${e instanceof Error ? e.message : String(e)}`);
}
