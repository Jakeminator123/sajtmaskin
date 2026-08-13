/**
 * Read-only aggregate view of `error_log_events` — the cross-run fault/fix
 * matrix ("fel / åtgärd / lyckades?"). Default groups by `fault` with counts, a
 * `result` breakdown, the dominant fixer, and last-seen time. `--by-fixer`
 * groups by `fixer` instead (usages, result buckets, unique chats, top-3
 * faults, first/last seen). Rows without a fixer become «(ingen fixer)».
 *
 * The existing human-facing observability (`npm run faults:report`, the
 * backoffice "Error-log RAG" page) reads only LOCAL NDJSON — so when you test
 * on Vercel *production* the recurring-fault picture there is invisible. This
 * script reads the DURABLE Postgres store instead, and can point at prod.
 *
 *   node scripts/observability/fault-matrix.mjs                 # dev (.env.local)
 *   node scripts/observability/fault-matrix.mjs --prod          # prod snapshot
 *   node scripts/observability/fault-matrix.mjs --prod --json   # machine-readable (backoffice)
 *   node scripts/observability/fault-matrix.mjs --by-fixer --json
 *   node scripts/observability/fault-matrix.mjs --by-fixer --prod --json --limit 200
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
const byFixer = argv.includes("--by-fixer");
const allowInsecureSsl = useProd || argv.includes("--allow-insecure-ssl");
const limitIdx = argv.indexOf("--limit");
const limit =
  limitIdx !== -1 ? Math.max(1, Math.min(Number(argv[limitIdx + 1]) || 25, 200)) : 25;

const PROD_ENV_FILE = ".env.vercel.production.pulled";
const envFile = useProd ? PROD_ENV_FILE : ".env.local";
const MISSING_FIXER = "(ingen fixer)";
const FAILED_RESULTS = new Set(["failed", "still-failing"]);

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

/** Verbatim `result` keys stay in `result_breakdown`; buckets are derived. */
function withResultBuckets(row) {
  const breakdown =
    row.result_breakdown && typeof row.result_breakdown === "object" ? row.result_breakdown : {};
  let fixed = 0;
  let failed = 0;
  let other = 0;
  for (const [key, value] of Object.entries(breakdown)) {
    const n = Number(value) || 0;
    if (key === "fixed") fixed += n;
    else if (FAILED_RESULTS.has(key)) failed += n;
    else other += n;
  }
  return { ...row, fixed, failed, other };
}

function formatIso(value) {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function formatTopFaults(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const fault = item.fault || "?";
      return `${fault}:${item.count ?? 0}`;
    })
    .filter(Boolean)
    .join(" ");
}

try {
  if (!(await tableExists("error_log_events"))) {
    if (wantJson) {
      process.stdout.write(
        JSON.stringify({
          ok: true,
          tableMissing: true,
          env: envFile,
          mode: byFixer ? "by-fixer" : "by-fault",
          ...(byFixer ? { fixers: [] } : { faults: [] }),
        }),
      );
    } else {
      console.log(`error_log_events saknas i ${envFile}-databasen.`);
    }
    await pool.end();
    process.exit(0);
  }

  if (byFixer) {
    const totals = await pool.query(
      `select count(*)::int as rows,
              count(distinct coalesce(nullif(btrim(fixer), ''), $1))::int as fixers
       from error_log_events`,
      [MISSING_FIXER],
    );

    // Per-fixer aggregate: total, distinct chats, verbatim result breakdown,
    // top-3 faults, first/last seen. NULL/blank fixer → «(ingen fixer)».
    // Result + fault subqueries are pre-grouped so jsonb_object_agg /
    // jsonb_agg never see duplicate keys (same Bugbot constraint as --by-fault).
    const perFixer = await pool.query(
      `with keyed as (
         select coalesce(nullif(btrim(fixer), ''), $2) as fixer,
                fault,
                coalesce(result, 'unknown') as result_key,
                chat_id,
                created_at
         from error_log_events
       ),
       agg as (
         select fixer,
                count(*)::int as total,
                count(distinct chat_id)::int as chats,
                min(created_at) as first_seen,
                max(created_at) as last_seen
         from keyed
         group by fixer
       ),
       breakdown as (
         select fixer, jsonb_object_agg(result_key, cnt) as result_breakdown
         from (
           select fixer, result_key, count(*)::int as cnt
           from keyed
           group by fixer, result_key
         ) s
         group by fixer
       ),
       top_faults as (
         select fixer,
                jsonb_agg(
                  jsonb_build_object('fault', fault, 'count', cnt)
                  order by cnt desc, fault
                ) as top_faults
         from (
           select fixer, fault, cnt,
                  row_number() over (partition by fixer order by cnt desc, fault) as rn
           from (
             select fixer, fault, count(*)::int as cnt
             from keyed
             group by fixer, fault
           ) f
         ) ranked
         where rn <= 3
         group by fixer
       )
       select a.fixer, a.total, a.chats, a.first_seen, a.last_seen,
              coalesce(b.result_breakdown, '{}'::jsonb) as result_breakdown,
              coalesce(t.top_faults, '[]'::jsonb) as top_faults
       from agg a
       left join breakdown b on b.fixer = a.fixer
       left join top_faults t on t.fixer = a.fixer
       order by a.total desc
       limit $1`,
      [limit, MISSING_FIXER],
    );

    const rows = perFixer.rows.map(withResultBuckets);

    if (wantJson) {
      process.stdout.write(
        JSON.stringify({
          ok: true,
          env: envFile,
          mode: "by-fixer",
          totalRows: totals.rows[0].rows,
          distinctFixers: totals.rows[0].fixers,
          missingFixerLabel: MISSING_FIXER,
          fixers: rows,
        }),
      );
    } else {
      console.log(
        `fault-matrix --by-fixer (${envFile}) — ${totals.rows[0].rows} rader, ${totals.rows[0].fixers} distinkta fixers\n`,
      );
      for (const r of rows) {
        const breakdown = Object.entries(r.result_breakdown || {})
          .map(([k, v]) => `${k}:${v}`)
          .join(" ");
        const faults = formatTopFaults(r.top_faults);
        console.log(
          `${String(r.total).padStart(4)}  ${r.fixer}\n` +
            `        chats=${r.chats}  fixed=${r.fixed} failed=${r.failed} other=${r.other}` +
            `  result=[${breakdown}]\n` +
            `        faults=[${faults || "-"}]  first=${formatIso(r.first_seen)}  last=${formatIso(r.last_seen)}`,
        );
      }
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
  //
  // The result breakdown and top-fixer are built from PRE-GROUPED subqueries
  // (`group by fault, <key>`) so `jsonb_object_agg` only ever receives ONE row
  // per (fault, result) — duplicate keys would otherwise make jsonb_object_agg
  // raise on some Postgres configs (Bugbot).
  const perFault = await pool.query(
    `with agg as (
       select fault,
              count(*)::int as total,
              count(distinct chat_id)::int as chats,
              max(created_at) as last_seen
       from error_log_events
       group by fault
     ),
     breakdown as (
       select fault, jsonb_object_agg(result_key, cnt) as result_breakdown
       from (
         select fault, coalesce(result, 'unknown') as result_key, count(*)::int as cnt
         from error_log_events
         group by fault, coalesce(result, 'unknown')
       ) s
       group by fault
     ),
     fixers as (
       select distinct on (fault) fault, fixer as top_fixer
       from (
         select fault, fixer, count(*)::int as fc
         from error_log_events
         where fixer is not null
         group by fault, fixer
       ) t
       order by fault, fc desc
     )
     select a.fault, a.total, a.chats, a.last_seen,
            coalesce(b.result_breakdown, '{}'::jsonb) as result_breakdown,
            f.top_fixer
     from agg a
     left join breakdown b on b.fault = a.fault
     left join fixers f on f.fault = a.fault
     order by a.total desc
     limit $1`,
    [limit],
  );

  if (wantJson) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        env: envFile,
        mode: "by-fault",
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
