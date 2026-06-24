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
 *     --kinds=prompts,generations,versions,telemetry,errors,chats \
 *     --limit=50 [--chat=<chatId>]
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
    columns: [
      "id", "chat_id", "version_id", "scaffold_id", "model", "model_tier",
      "build_intent", "retry_count", "autofix_applied", "preflight_error_count",
      "preflight_warning_count", "quality_gate_result", "preview_success",
      "preview_blocking_reason", "duration_ms", "file_count", "created_at",
    ],
  },
  errors: {
    table: "engine_version_error_logs",
    chatColumn: "chat_id",
    columns: ["id", "chat_id", "version_id", "level", "category", "message", "created_at"],
  },
  chats: {
    table: "engine_chats",
    chatColumn: "id",
    columns: ["id", "title", "model", "scaffold_id", "project_id", "created_at", "updated_at"],
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
  for (const kind of kinds) {
    const spec = KIND_SPECS[kind];
    const cols = spec.columns.join(", ");
    let sql;
    let params;
    if (chatId && spec.chatColumn) {
      sql = `SELECT ${cols} FROM ${spec.table} WHERE ${spec.chatColumn} = $1 ORDER BY created_at DESC LIMIT $2`;
      params = [chatId, limit];
    } else {
      sql = `SELECT ${cols} FROM ${spec.table} ORDER BY created_at DESC LIMIT $1`;
      params = [limit];
    }
    const res = await client.query(sql, params);
    data[kind] = res.rows;
    counts[kind] = res.rows.length;
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
    data,
  };
  if (wantJson) process.stdout.write(JSON.stringify(payload));
  else {
    console.log(`Target ${targetLabel}${inspection.isProdLike ? " (PROD-LIKE)" : ""} — limit ${limit}`);
    for (const kind of kinds) console.log(`  ${kind}: ${counts[kind]} rader`);
  }
  process.exit(0);
} catch (err) {
  emitError(err instanceof Error ? err.message : String(err));
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
