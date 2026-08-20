/**
 * Read-only log dumper for the backoffice "Logg-export"-sida.
 *
 * Lets the backoffice (or a human) pull the latest N rows of selected log
 * kinds from the DB — including the **production** database when pointed at a
 * pulled prod env file. SELECT only; nothing is ever written.
 *
 * Usage:
 *   node scripts/db/dump-logs.mjs --json \
 *     --env=.env.local \
 *     --kinds=prompts,generations,versions,telemetry,errors,chats,oc,ragevents,deploys \
 *     --limit=50 [--chat=<chatId>]
 *
 * Kinds: prompts, generations, versions, telemetry, llmusage, errors, chats,
 *   oc        -> oc_debug_findings      (OpenClaw bug-hunt Mode B findings)
 *   ragevents -> error_log_events       (durable fault/fix RAG telemetry)
 *   deploys   -> deployments            (Vercel deploy row: ids + url + status)
 *   openai    -> openai_webhook_events  (inbound OpenAI platform webhook receipts)
 *   drain     -> vercel_log_drain_events (appens console.warn/error, levererade
 *                av en Vercel Log Drain — finns bara om drainen är konfigurerad)
 *   defects   -> engine_version_error_logs GROUPED BY meta.defect.signature
 *                (felKLASSER med räknare, inte enskilda händelser — svarar på
 *                 "hur ofta, över hur många chattar, sedan när")
 *
 * Env source: pass `--env=<path>` to choose which dotenv file to load. For
 * production logs, pull the prod env first:
 *   vercel env pull .env.vercel.production.pulled --environment=production --yes
 * then pass `--env=.env.vercel.production.pulled`. The connection string is
 * resolved from POSTGRES_URL / POSTGRES_URL_NON_POOLING / STORAGE_* / DATABASE_URL.
 *
 * Mirrors `scripts/db/generation-history.mjs` (dotenv + pg, no Python driver in
 * backoffice) but adds env-file selection, kind selection and `prompt_logs`.
 */
import { config } from "dotenv";
import pg from "pg";
import {
  normalizeEnvUrl,
  inspectDbTarget,
  summarizeTarget,
} from "./db-target-guard.mjs";
import { mergeEnvFileOverProcess } from "./env-merge.mjs";
import { truncateMetaStrings } from "./dump-logs-meta.mjs";
import { formatLogTimestamp, LOG_TIMESTAMP_NOTE } from "./log-timestamp.mjs";
import {
  LATEST_PRODUCT_POSTCHECK_JOIN,
  annotateReportedQualityGate,
} from "./lib/reported-quality-gate.mjs";

const argv = process.argv.slice(2);
const wantJson = argv.includes("--json");
const allowInsecureSsl = argv.includes("--allow-insecure-ssl");

function argValue(name, fallback = null) {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const idx = argv.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < argv.length && !argv[idx + 1].startsWith("--")) {
    return argv[idx + 1];
  }
  return fallback;
}

const envPath = argValue("env", ".env.local");
// `quiet: true` — dotenv v17 otherwise prints an "[dotenv] injecting env" tip
// to STDOUT, which would corrupt the JSON the backoffice parses.
//
// dotenv does NOT overwrite already-set process.env vars, so a `POSTGRES_URL`
// inherited from the parent process (e.g. the backoffice host) would otherwise
// win over the `--env=<file>` the operator picked — silently reading the wrong
// database. `effectiveEnv` makes the selected env file win for DB target
// resolution. We still let dotenv populate process.env for any unrelated
// consumers, but resolve the connection string / target / SSL from effectiveEnv.
const parsedEnvFile = config({ path: envPath, quiet: true }).parsed ?? {};
const effectiveEnv = mergeEnvFileOverProcess(parsedEnvFile, process.env);

const limitRaw = Number.parseInt(argValue("limit", "50"), 10);
const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 50;
const chatId = argValue("chat");
const kindsArg = (argValue("kinds", "prompts,generations,versions,telemetry,errors") || "")
  .split(",")
  .map((k) => k.trim().toLowerCase())
  .filter(Boolean);

function emitError(message) {
  if (wantJson) process.stdout.write(JSON.stringify({ error: message }));
  else console.error(message);
}

function formatCell(key, value) {
  if (value === null || value === undefined) return "";
  if (key === "created_at" || key === "updated_at") return formatLogTimestamp(value);
  const s = value instanceof Date ? value.toISOString() : String(value);
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}

function printHumanRows(kind, rows) {
  for (const row of rows) {
    const parts = Object.entries(row)
      .map(([k, v]) => {
        const cell = formatCell(k, v);
        return cell ? `${k}=${cell}` : null;
      })
      .filter(Boolean);
    console.log(`    ${parts.join("  ")}`);
  }
}

// kind -> { table, chatColumn, columns[] }. `chatColumn` is the column used to
// filter by --chat (null = the kind cannot be chat-filtered). Column lists are
// fixed allow-lists (no user input reaches the SQL identifier positions).
const KIND_SPECS = {
  prompts: {
    table: "prompt_logs",
    chatColumn: "chat_id",
    columns: [
      "id", "event", "chat_id", "app_project_id", "build_intent", "build_method",
      "model_tier", "thinking", "image_generations", "attachments_count",
      "prompt_original", "prompt_formatted", "created_at",
    ],
  },
  generations: {
    table: "engine_generation_logs",
    chatColumn: "chat_id",
    columns: [
      "id", "chat_id", "model", "prompt_tokens", "completion_tokens",
      "duration_ms", "success", "error_message", "created_at",
    ],
  },
  versions: {
    table: "engine_versions",
    chatColumn: "chat_id",
    columns: [
      "id", "chat_id", "version_number", "lifecycle_stage", "release_state",
      "verification_state", "verification_summary", "edit_kind", "preview_url", "created_at",
    ],
  },
  telemetry: {
    table: "generation_telemetry",
    chatColumn: "chat_id",
    // `meta` carries postStreamSteps / streamMs / buildSpec so /logg can show
    // phase timings without a one-off SQL script. Same truncate path as errors.
    columns: [
      "id", "chat_id", "version_id", "scaffold_id", "model", "model_tier",
      "build_intent", "retry_count", "autofix_applied", "preflight_error_count",
      "preflight_warning_count", "quality_gate_result", "preview_success",
      "preview_blocking_reason", "duration_ms", "file_count",
      // Tokenkolumnerna: enda stället där en tokenvolym bär `version_id`, alltså
      // det som gör kostnad per KÖRNING möjlig (engine_generation_logs är per chat).
      "prompt_tokens", "completion_tokens", "meta", "created_at",
    ],
    buildQuery: ({ chatId: chat, limit: max }) => {
      const colSql = KIND_SPECS.telemetry.columns.map((c) => `gt.${c}`).join(", ");
      const where = [];
      const params = [];
      if (chat) {
        params.push(chat);
        where.push(`gt.chat_id = $${params.length}`);
      }
      params.push(max);
      return {
        sql: `
          SELECT ${colSql}, pps.product_blocked
          FROM generation_telemetry gt
          ${LATEST_PRODUCT_POSTCHECK_JOIN.trim()}
          ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
          ORDER BY gt.created_at DESC
          LIMIT $${params.length}
        `,
        params,
      };
    },
    sanitizeRow: (row) =>
      annotateReportedQualityGate({ ...row, meta: truncateMetaStrings(row.meta) }),
  },
  errors: {
    table: "engine_version_error_logs",
    chatColumn: "chat_id",
    // `meta` carries structured payloads (R7: f3-readiness:missing-env →
    // missingByIntegration) so /logg can reconstruct the requirements surface.
    // The column is shared, so long strings are truncated on the way out — see
    // `dump-logs-meta.mjs` for why.
    columns: ["id", "chat_id", "version_id", "level", "category", "message", "meta", "created_at"],
    sanitizeRow: (row) => ({ ...row, meta: truncateMetaStrings(row.meta) }),
  },
  chats: {
    table: "engine_chats",
    chatColumn: "id",
    columns: ["id", "title", "model", "scaffold_id", "project_id", "created_at", "updated_at"],
  },
  llmusage: {
    table: "llm_usage",
    chatColumn: "chat_id",
    columns: [
      "id", "run_id", "chat_id", "version_id", "user_id", "phase", "workload",
      "provider", "model", "model_tier", "input_tokens", "cached_input_tokens",
      "output_tokens", "reasoning_tokens", "duration_ms", "ok", "error_code",
      "created_at",
    ],
  },
  oc: {
    table: "oc_debug_findings",
    chatColumn: "chat_id",
    columns: [
      "id", "run_id", "chat_id", "version_id", "scenario", "severity", "category",
      "file", "line", "message", "build_result", "repair_outcome", "created_at",
    ],
  },
  ragevents: {
    table: "error_log_events",
    chatColumn: "chat_id",
    columns: [
      "id", "phase", "subphase", "severity", "fault", "fault_text", "fix_text",
      "model", "model_tier", "result", "chat_id", "version_id", "scaffold_id",
      "generation_mode", "created_at",
    ],
  },
  deploys: {
    table: "deployments",
    chatColumn: "chat_id",
    columns: [
      "id", "chat_id", "version_id", "vercel_deployment_id", "vercel_project_id",
      "inspector_url", "url", "domain", "status", "created_at", "updated_at",
    ],
  },
  // Aggregat, inte rader: grupperar `engine_version_error_logs` på
  // `meta.defect.signature` (satt av `src/lib/logging/version-defect-signature.ts`
  // på den kanoniska skrivvägen). Det är den enda vyn som svarar på "hur ofta
  // händer det här, och över hur många chattar" — `errors` visar händelser,
  // den här visar felKLASSER. Utan `--chat` är den repo-bred, vilket är
  // poängen: ett fel som återkommer i tio chattar är ett plattformsfel, inte
  // otur i en generering.
  defects: {
    table: "engine_version_error_logs",
    chatColumn: "chat_id",
    columns: [],
    buildQuery: ({ chatId: chat, limit: max }) => {
      const where = ["meta -> 'defect' ->> 'signature' IS NOT NULL"];
      const params = [];
      if (chat) {
        params.push(chat);
        where.push(`chat_id = $${params.length}`);
      }
      params.push(max);
      return {
        sql: `
          SELECT
            meta -> 'defect' ->> 'signature'                       AS signature,
            meta -> 'defect' ->> 'kind'                            AS kind,
            meta -> 'defect' ->> 'file'                            AS file,
            count(*)::int                                          AS occurrences,
            count(DISTINCT chat_id)::int                           AS chats,
            count(*) FILTER (WHERE level = 'error')::int           AS errors,
            min(created_at)                                        AS first_seen,
            max(created_at)                                        AS last_seen,
            (array_agg(category ORDER BY created_at DESC))[1]      AS latest_category,
            (array_agg(message  ORDER BY created_at DESC))[1]      AS latest_message
          FROM engine_version_error_logs
          WHERE ${where.join(" AND ")}
          GROUP BY 1, 2, 3
          ORDER BY occurrences DESC, last_seen DESC
          LIMIT $${params.length}
        `,
        params,
      };
    },
    sanitizeRow: (row) => ({
      ...row,
      latest_message:
        typeof row.latest_message === "string" && row.latest_message.length > 300
          ? `${row.latest_message.slice(0, 297)}…`
          : row.latest_message,
    }),
  },
  // Appens egna console.warn/console.error från Vercel, levererade av en Log
  // Drain till POST /api/drains/vercel. Enda kinden som INTE skrivs av appens
  // egen kod — den kommer utifrån, och finns bara om drainen är konfigurerad
  // (`VERCEL_LOG_DRAIN_SECRET`). Tom lista betyder alltså antingen "inga fel"
  // eller "ingen drain": kontrollera vilket innan du drar en slutsats.
  //
  // Mottagaren sparar bara error/warning/fatal, 5xx och de mönster /logg
  // steg 3c letar efter — resten kastas vid ingest. `--chat` finns inte:
  // plattformsloggar bär ingen chatId. Korrelera på tid (`log_timestamp`)
  // eller `request_id`.
  drain: {
    table: "vercel_log_drain_events",
    chatColumn: null,
    columns: [
      "id", "log_timestamp", "source", "level", "type", "environment", "host",
      "path", "status_code", "request_id", "deployment_id", "execution_region",
      "message", "created_at",
    ],
    sanitizeRow: (row) => ({
      ...row,
      message:
        typeof row.message === "string" && row.message.length > 600
          ? `${row.message.slice(0, 597)}…`
          : row.message,
    }),
  },
  openai: {
    table: "openai_webhook_events",
    // OpenAI events carry no chatId — correlation goes via object_id
    // (resp_…/batch_…) once a caller runs jobs in background mode.
    chatColumn: null,
    columns: [
      "id", "event_id", "event_type", "object_id", "event_created_at",
      "payload", "created_at",
    ],
    sanitizeRow: (row) => ({ ...row, payload: truncateMetaStrings(row.payload) }),
  },
};

const kinds = kindsArg.filter((k) => k in KIND_SPECS);
if (kinds.length === 0) {
  emitError(`No valid --kinds. Allowed: ${Object.keys(KIND_SPECS).join(", ")}`);
  process.exit(1);
}

const cs = normalizeEnvUrl(
  effectiveEnv.POSTGRES_URL ||
    effectiveEnv.POSTGRES_URL_NON_POOLING ||
    effectiveEnv.STORAGE_POSTGRES_URL ||
    effectiveEnv.STORAGE_POSTGRES_URL_NON_POOLING ||
    effectiveEnv.DATABASE_URL,
);
if (!cs) {
  emitError(`Database URL missing in ${envPath} (POSTGRES_URL / DATABASE_URL).`);
  process.exit(1);
}

const inspection = inspectDbTarget(effectiveEnv);
const targetLabel = summarizeTarget(inspection.current);

const url = new URL(cs);
url.searchParams.delete("sslmode");
url.searchParams.delete("supa");

function resolveSsl() {
  const raw = effectiveEnv.DB_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase();
  if (raw === "false" || allowInsecureSsl) return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
}

const client = new pg.Client({ connectionString: url.toString(), ssl: resolveSsl() });

try {
  await client.connect();
  const data = {};
  const counts = {};
  const skipped = {};
  for (const kind of kinds) {
    const spec = KIND_SPECS[kind];
    const cols = spec.columns.join(", ");
    let sql;
    let params;
    if (spec.buildQuery) {
      // Aggregatkinds bygger sin egen SQL (GROUP BY / egen ORDER BY) men går
      // genom samma felhantering och samma sanering som radkinds.
      ({ sql, params } = spec.buildQuery({ chatId, limit }));
    } else if (chatId && spec.chatColumn) {
      sql = `SELECT ${cols} FROM ${spec.table} WHERE ${spec.chatColumn} = $1 ORDER BY created_at DESC LIMIT $2`;
      params = [chatId, limit];
    } else {
      sql = `SELECT ${cols} FROM ${spec.table} ORDER BY created_at DESC LIMIT $1`;
      params = [limit];
    }
    // Per-kind resilience: a missing table (e.g. this kind not present in the
    // target DB) or a bad column should skip that kind, not abort the whole
    // dump. Matters for multi-kind pulls (e.g. /logg) that span optional tables.
    try {
      const res = await client.query(sql, params);
      data[kind] = spec.sanitizeRow ? res.rows.map(spec.sanitizeRow) : res.rows;
      counts[kind] = res.rows.length;
    } catch (kindErr) {
      data[kind] = [];
      counts[kind] = 0;
      skipped[kind] = kindErr instanceof Error ? kindErr.message : String(kindErr);
    }
  }

  const payload = {
    ok: true,
    generatedAt: new Date().toISOString(),
    envPath,
    target: targetLabel,
    isProdLike: inspection.isProdLike,
    limit,
    chatId: chatId || null,
    kinds,
    counts,
    skipped,
    data,
  };
  if (wantJson) process.stdout.write(JSON.stringify(payload));
  else {
    console.log(`Target ${targetLabel}${inspection.isProdLike ? " (PROD-LIKE)" : ""} — limit ${limit}`);
    console.log(LOG_TIMESTAMP_NOTE);
    for (const kind of kinds) {
      const note = skipped[kind] ? ` (skipped: ${skipped[kind]})` : "";
      console.log(`\n[${kind}] ${counts[kind]} rader${note}`);
      if (counts[kind] > 0) printHumanRows(kind, data[kind]);
    }
  }
  process.exit(0);
} catch (err) {
  emitError(err instanceof Error ? err.message : String(err));
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
