/**
 * Read-only Redis cache dumper for the /logg flow.
 *
 * Pulls Deep Brief responses, prompt-handoff payloads and preview-session
 * entries from Upstash/Redis — including the **production** instance when
 * pointed at a pulled prod env file. SCAN + GET only; nothing is ever written
 * (no SET / DEL / FLUSH / UNLINK).
 *
 * Usage:
 *   node scripts/db/dump-redis-cache.mjs --json \
 *     --env=.env.vercel.production.pulled \
 *     --kinds=briefs,handoffs,previews \
 *     --limit=50 [--chat=<chatId>] [--prefix=prod:]
 *
 * Kinds:
 *   briefs   -> {prefix}brief:v1:{modelId}:{chatId|anon}:{promptHash}
 *               (TTL 24h). --chat matches only keys that contain that chatId.
 *               Init-briefs cache as `anon` and are excluded (cannot be tied
 *               to the requested chat).
 *   handoffs -> {prefix}prompt_handoff:{id}
 *               Skipped when --chat is set: payload has no chatId (sessionId
 *               is the auth cookie). Scanning the namespace would leak other
 *               users' full prompts.
 *   previews -> {prefix}preview-session:session:{chatId}
 *               plus legacy {prefix}sandbox-preview:session:{chatId}
 *
 * Prefix: prod: / preview: / dev: (REDIS_KEY_PREFIX in src/lib/config.ts).
 * Default: `prod:` when the env file is `.env.vercel.production.pulled`,
 * otherwise `dev:`.
 *
 * Env source: `--env=<path>` (dotenv). The selected file wins over inherited
 * process.env via `mergeEnvFileOverProcess` — same footgun as dump-logs.
 * Connection URL: REDIS_URL, then KV_URL (mirrors resolveRedisUrl()).
 *
 * Never prints the connection URL, password or host. Long string values are
 * truncated with `truncateMetaStrings`.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import Redis from "ioredis";
import { mergeEnvFileOverProcess } from "./env-merge.mjs";
import { formatLogTimestamp, LOG_TIMESTAMP_NOTE } from "./log-timestamp.mjs";
import {
  anonBriefSkipReason,
  briefKeyBelongsToChat,
  chatFlagPresent,
  handoffSkipReason,
  kindPatterns,
  parseCacheValue,
  parseRedisConnect,
  previewExactKeys,
  resolveChatId,
  sortByCachedAtDesc,
} from "./dump-redis-cache-parse.mjs";

const argv = process.argv.slice(2);
const wantJson = argv.includes("--json");

const ALLOWED_PREFIXES = new Set(["prod:", "preview:", "dev:"]);
const ALLOWED_KINDS = ["briefs", "handoffs", "previews"];
const DEFAULT_KINDS = "briefs,handoffs,previews";
const MAX_LIMIT = 1000;
const MAX_SCAN_KEYS = 2000;
const MAX_SCAN_ITERS = 50;
const SCAN_COUNT = 200;
const PROD_ENV_BASENAME = ".env.vercel.production.pulled";

function argValue(name, fallback = null) {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const idx = argv.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < argv.length && !argv[idx + 1].startsWith("--")) {
    return argv[idx + 1];
  }
  return fallback;
}

function emitError(message) {
  if (wantJson) process.stdout.write(JSON.stringify({ error: message }));
  else console.error(message);
}

function defaultKeyPrefix(envFilePath) {
  return path.basename(envFilePath) === PROD_ENV_BASENAME ? "prod:" : "dev:";
}

function normalizeKeyPrefix(raw, envFilePath) {
  if (raw == null || raw === "") return defaultKeyPrefix(envFilePath);
  const withColon = raw.endsWith(":") ? raw : `${raw}:`;
  return ALLOWED_PREFIXES.has(withColon) ? withColon : null;
}

/**
 * Redis / ioredis errors often embed host, port or the connection URL.
 * Keep the error class/code (so a failed connect is reportable) but strip
 * anything that identifies the instance.
 */
function sanitizeError(err) {
  const code =
    err && typeof err === "object" && "code" in err && err.code
      ? String(err.code)
      : null;
  let msg = err instanceof Error ? err.message : String(err);
  msg = msg.replace(/rediss?:\/\/[^\s)'"`]+/gi, "[redacted-url]");
  msg = msg.replace(/\b[^:\s]+:[^@\s]+@/g, "[redacted-auth]@");
  msg = msg.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[redacted-host]");
  msg = msg.replace(/\[[0-9a-f:]+\]/gi, "[redacted-host]");
  msg = msg.replace(
    /\b[a-z0-9][a-z0-9.-]+\.(?:upstash\.io|redis\.cloud|redislabs\.com|redis\.com|cache\.amazonaws\.com)\b/gi,
    "[redacted-host]",
  );
  msg = msg.replace(/\b[A-Za-z0-9._-]{3,}\.[A-Za-z0-9._-]+\.[A-Za-z]{2,}\b/g, "[redacted-host]");
  return code ? `${code}: ${msg}` : msg;
}

function resolveRedisUrl(env) {
  let schemeError = null;
  for (const key of ["REDIS_URL", "KV_URL"]) {
    const value = env[key];
    if (!value) continue;
    if (/^\$\{[A-Z0-9_]+\}$/.test(value) || /^\$[A-Z0-9_]+$/.test(value)) continue;
    if (!/^rediss?:\/\//i.test(value)) {
      schemeError = `${key} must start with redis:// or rediss://.`;
      continue;
    }
    return { url: value };
  }
  return { error: schemeError || "REDIS_URL / KV_URL missing in the selected env file." };
}

function createRedis(connect) {
  return new Redis({
    host: connect.host,
    port: connect.port,
    username: connect.username,
    password: connect.password,
    ...(connect.db ? { db: connect.db } : {}),
    ...(connect.useTls ? { tls: {} } : {}),
    maxRetriesPerRequest: 2,
    connectTimeout: 10000,
    commandTimeout: 15000,
    enableOfflineQueue: false,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 2) return null;
      return 200;
    },
  });
}

async function scanKeys(redis, pattern, maxKeys) {
  let cursor = "0";
  const keys = [];
  let iterations = 0;
  let truncated = false;
  do {
    const [next, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", SCAN_COUNT);
    cursor = String(next);
    for (const key of batch) {
      keys.push(key);
      if (keys.length >= maxKeys) {
        truncated = true;
        return { keys, truncated };
      }
    }
    iterations += 1;
    if (iterations >= MAX_SCAN_ITERS) {
      truncated = cursor !== "0";
      break;
    }
  } while (cursor !== "0");
  return { keys, truncated };
}

async function getEntries(redis, keys) {
  const entries = [];
  for (const key of keys) {
    const raw = await redis.get(key);
    if (raw == null) continue;
    const parsed = parseCacheValue(raw);
    entries.push({ key, cachedAt: parsed.cachedAt, value: parsed.value });
  }
  return entries;
}

function formatCell(key, value) {
  if (value === null || value === undefined) return "";
  if (key === "cachedAt") return formatLogTimestamp(value);
  const s = typeof value === "string" ? value : JSON.stringify(value);
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

const envPath = argValue("env", ".env.local");
const parsedEnvFile = config({ path: envPath, quiet: true }).parsed ?? {};
const effectiveEnv = mergeEnvFileOverProcess(parsedEnvFile, process.env);

const limitRaw = Number.parseInt(argValue("limit", "50"), 10);
const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), MAX_LIMIT) : 50;
const chatResolved = resolveChatId(argValue("chat"), chatFlagPresent(argv));
if (chatResolved.error) {
  emitError(chatResolved.error);
  process.exit(1);
}
const chatId = chatResolved.chatId;
const kindsArg = (argValue("kinds", DEFAULT_KINDS) || "")
  .split(",")
  .map((k) => k.trim().toLowerCase())
  .filter(Boolean);

const kinds = kindsArg.filter((k) => ALLOWED_KINDS.includes(k));
if (kinds.length === 0) {
  emitError(`No valid --kinds. Allowed: ${ALLOWED_KINDS.join(", ")}`);
  process.exit(1);
}

const prefix = normalizeKeyPrefix(argValue("prefix"), envPath);
if (!prefix) {
  emitError(`Invalid --prefix. Allowed: ${[...ALLOWED_PREFIXES].join(", ")}`);
  process.exit(1);
}

if (!existsSync(envPath)) {
  emitError(`Env file not found: ${envPath}`);
  process.exit(1);
}

const resolved = resolveRedisUrl(effectiveEnv);
if (resolved.error) {
  emitError(resolved.error);
  process.exit(1);
}

const connect = parseRedisConnect(resolved.url);
if (connect.error) {
  emitError(connect.error);
  process.exit(1);
}

const redis = createRedis(connect);
// Swallow ioredis' default error-event (it can echo host/port), but keep
// the last code so a failed connect reports ETIMEDOUT instead of the
// generic "Connection is closed." that ioredis throws afterwards.
let lastRedisError = null;
redis.on("error", (err) => {
  lastRedisError = err;
});

try {
  await redis.connect();
  const data = {};
  const counts = {};
  const skipped = {};
  const truncated = {};

  for (const kind of kinds) {
    try {
      const handoffSkip = kind === "handoffs" ? handoffSkipReason(chatId) : null;
      if (handoffSkip) {
        data[kind] = [];
        counts[kind] = 0;
        skipped[kind] = handoffSkip;
        continue;
      }

      const anonSkip = kind === "briefs" ? anonBriefSkipReason(chatId) : null;
      if (anonSkip) skipped.anonBriefs = anonSkip;

      const found = new Set();
      let scanTruncated = false;

      if (kind === "previews" && chatId) {
        for (const key of previewExactKeys(prefix, chatId)) found.add(key);
      } else {
        for (const pattern of kindPatterns(kind, prefix, chatId)) {
          const scanned = await scanKeys(redis, pattern, MAX_SCAN_KEYS);
          for (const key of scanned.keys) {
            if (kind === "briefs" && !briefKeyBelongsToChat(key, chatId)) continue;
            found.add(key);
          }
          if (scanned.truncated) scanTruncated = true;
        }
      }

      const entries = sortByCachedAtDesc(await getEntries(redis, [...found])).slice(0, limit);
      data[kind] = entries;
      counts[kind] = entries.length;
      if (scanTruncated) truncated[kind] = true;
    } catch (kindErr) {
      data[kind] = [];
      counts[kind] = 0;
      skipped[kind] = sanitizeError(kindErr);
    }
  }

  const payload = {
    ok: true,
    generatedAt: new Date().toISOString(),
    envPath,
    prefix,
    limit,
    chatId,
    kinds,
    counts,
    skipped,
    truncated,
    data,
  };
  if (wantJson) process.stdout.write(JSON.stringify(payload));
  else {
    console.log(`Redis prefix=${prefix} — limit ${limit}${chatId ? ` chat=${chatId}` : ""}`);
    console.log(LOG_TIMESTAMP_NOTE);
    for (const kind of kinds) {
      const extras = [];
      if (skipped[kind]) extras.push(`skipped: ${skipped[kind]}`);
      if (kind === "briefs" && skipped.anonBriefs) extras.push(`uteslutna: ${skipped.anonBriefs}`);
      if (truncated[kind]) extras.push("scan truncated");
      const note = extras.length ? ` (${extras.join("; ")})` : "";
      console.log(`\n[${kind}] ${counts[kind]} nycklar${note}`);
      if (counts[kind] > 0) printHumanRows(kind, data[kind]);
    }
  }
  process.exit(0);
} catch (err) {
  emitError(sanitizeError(lastRedisError || err));
  process.exit(1);
} finally {
  redis.disconnect();
}
