/**
 * Inbound Vercel Log Drain deliveries (Drains schema `log` v1).
 *
 * Why this exists: `engine_version_error_logs` only contains what the pipeline
 * deliberately persists. The routes' own `console.warn` / `console.error` lines
 * live ONLY on the Vercel platform, which is why `/logg` has a mandatory
 * "pull `vercel logs --json` and grep" step — six runs in a row once reported a
 * polite `product_postcheck.skipped` while Vercel showed a crashed Chromium.
 * A drain pointed at `POST /api/drains/vercel` puts those lines in Postgres, so
 * `dump-logs.mjs --kinds=drain` can read them next to every other log kind.
 *
 * This is a bounded diagnostic tail, NOT log storage. Two mechanisms keep it
 * bounded, and both matter:
 *
 *  1. `shouldPersistDrainLog()` drops the boring majority (successful requests,
 *     info-level build chatter) and — critically — every line produced by the
 *     ingest route itself. The drain delivers our own request logs back to us,
 *     so without that guard the table would fill with the sound of its own
 *     footsteps.
 *  2. `pruneDrainLogs()` deletes past the retention window. The caller runs it
 *     off the hot path.
 *
 * Volume is best cut at the source though: the drain's dashboard config can
 * restrict sources (`lambda`), environments (`production`) and a sampling rate.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { pool, dbConfigured } from "@/lib/db/client";

/** Route that receives the drain. Logs about this path are never stored. */
export const VERCEL_DRAIN_INGEST_PATH = "/api/drains/vercel";

/** How long a stored line survives. The table is a tail, not an archive. */
export const VERCEL_DRAIN_RETENTION_DAYS = 14;

/** Vercel truncates `message` at 256 KB; we keep far less than that per row. */
export const VERCEL_DRAIN_MESSAGE_MAX_CHARS = 4000;

/** Hard ceiling per delivery so one batch can never blow up a single request. */
export const VERCEL_DRAIN_MAX_ROWS_PER_DELIVERY = 500;

/** Rows per INSERT statement (15 columns each — well inside the param limit). */
const INSERT_CHUNK_SIZE = 100;

/**
 * Substrings that are kept regardless of level, because they are the ones
 * `/logg` step 3c greps for and several of them are logged at `info`.
 * Lowercased — matching is case-insensitive.
 */
export const VERCEL_DRAIN_ALWAYS_KEEP_SUBSTRINGS: readonly string[] = [
  "[product-postcheck] skipped",
  "free space in temporary directory",
  "allocateringbuffer",
  "thumbnail capture failed",
  "stillmissing: [",
  "vercel runtime timeout error",
  "[csp violation]",
  "ai sdk warning",
  "emaxconnsession",
  "timeout exceeded when trying to connect",
];

const KEPT_LEVELS = new Set(["error", "fatal", "warning"]);
const KEPT_TYPES = new Set(["stderr", "fatal"]);

export type VercelDrainVerification = { ok: true } | { ok: false; reason: string };

/**
 * Verify `x-vercel-signature`: HMAC-SHA1 (Vercel's choice, not ours) over the
 * raw body, hex-encoded. Compared in constant time.
 */
export function verifyVercelDrainSignature(params: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
}): VercelDrainVerification {
  const { rawBody, signatureHeader, secret } = params;
  if (!signatureHeader) return { ok: false, reason: "missing x-vercel-signature" };

  const expected = createHmac("sha1", secret).update(rawBody, "utf8").digest("hex");
  const candidate = Buffer.from(signatureHeader, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (candidate.length !== expectedBuf.length) return { ok: false, reason: "signature mismatch" };
  if (!timingSafeEqual(candidate, expectedBuf)) return { ok: false, reason: "signature mismatch" };
  return { ok: true };
}

/**
 * Split a delivery body into raw records. Vercel sends either a JSON array, a
 * single JSON object, or NDJSON depending on the drain's encoding setting —
 * and the docs' own JSON example is actually newline-separated objects, so
 * accepting both shapes is the only way to be right in practice.
 *
 * Returns `null` when nothing parses (malformed body → 400 at the caller).
 */
export function parseVercelDrainBody(rawBody: string): unknown[] | null {
  const trimmed = rawBody.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return [parsed];
    return null;
  } catch {
    // Not a single JSON document — fall through to NDJSON.
  }

  const records: unknown[] = [];
  for (const line of trimmed.split("\n")) {
    const candidate = line.trim();
    if (!candidate) continue;
    try {
      records.push(JSON.parse(candidate));
    } catch {
      return null;
    }
  }
  return records.length > 0 ? records : null;
}

export interface VercelDrainLogRow {
  logId: string;
  logTimestamp: Date | null;
  source: string | null;
  level: string | null;
  type: string | null;
  environment: string | null;
  host: string | null;
  path: string | null;
  statusCode: number | null;
  requestId: string | null;
  deploymentId: string | null;
  projectId: string | null;
  executionRegion: string | null;
  message: string | null;
  payload: unknown;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Copy of the record with `proxy.clientIp` removed and `message` truncated.
 * Client IPs are personal data under GDPR and we have no use for them here;
 * Vercel also offers a team-wide "hide IP addresses in Drains" toggle, but this
 * receiver should not depend on a dashboard setting staying flipped.
 */
function sanitizePayload(record: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...record };
  if (typeof copy.message === "string" && copy.message.length > VERCEL_DRAIN_MESSAGE_MAX_CHARS) {
    copy.message = `${copy.message.slice(0, VERCEL_DRAIN_MESSAGE_MAX_CHARS)}…`;
  }
  const proxy = copy.proxy;
  if (proxy && typeof proxy === "object" && !Array.isArray(proxy)) {
    const { clientIp: _clientIp, ...restProxy } = proxy as Record<string, unknown>;
    copy.proxy = restProxy;
  }
  return copy;
}

/** Shape one delivered record into a row, or `null` if it is not a log entry. */
export function normalizeVercelDrainLog(record: unknown): VercelDrainLogRow | null {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const r = record as Record<string, unknown>;

  const logId = str(r.id);
  if (!logId) return null;

  const timestampMs = num(r.timestamp);
  const proxy =
    r.proxy && typeof r.proxy === "object" && !Array.isArray(r.proxy)
      ? (r.proxy as Record<string, unknown>)
      : null;

  const rawMessage = str(r.message);
  return {
    logId,
    logTimestamp: timestampMs !== null ? new Date(timestampMs) : null,
    source: str(r.source),
    level: str(r.level),
    type: str(r.type),
    environment: str(r.environment),
    host: str(r.host),
    path: str(r.path) ?? (proxy ? str(proxy.path) : null),
    statusCode: num(r.statusCode) ?? (proxy ? num(proxy.statusCode) : null),
    requestId: str(r.requestId),
    deploymentId: str(r.deploymentId),
    projectId: str(r.projectId),
    executionRegion: str(r.executionRegion),
    message:
      rawMessage && rawMessage.length > VERCEL_DRAIN_MESSAGE_MAX_CHARS
        ? `${rawMessage.slice(0, VERCEL_DRAIN_MESSAGE_MAX_CHARS)}…`
        : rawMessage,
    payload: sanitizePayload(r),
  };
}

/** True when the line was produced by the ingest route itself (loop guard). */
export function isSelfDrainLog(row: VercelDrainLogRow): boolean {
  const path = row.path;
  if (!path) return false;
  // Query strings and trailing slashes both appear in practice, so compare on
  // the prefix rather than for equality.
  const withoutQuery = path.split("?")[0].replace(/\/+$/, "");
  return withoutQuery === VERCEL_DRAIN_INGEST_PATH;
}

/**
 * Keep only lines worth reading later. Everything a healthy request produces is
 * dropped — the point of the table is the tail of things that went wrong.
 */
export function shouldPersistDrainLog(row: VercelDrainLogRow): boolean {
  if (isSelfDrainLog(row)) return false;

  const level = row.level?.toLowerCase();
  if (level && KEPT_LEVELS.has(level)) return true;

  const type = row.type?.toLowerCase();
  if (type && KEPT_TYPES.has(type)) return true;

  // -1 means the function crashed without returning a response.
  if (row.statusCode !== null && (row.statusCode >= 500 || row.statusCode === -1)) return true;

  const message = row.message?.toLowerCase();
  if (message && VERCEL_DRAIN_ALWAYS_KEEP_SUBSTRINGS.some((needle) => message.includes(needle))) {
    return true;
  }

  return false;
}

/**
 * Normalize + filter + de-duplicate one delivery. De-duplication matters
 * because a single batch can legitimately repeat a log id after a retry, and
 * `ON CONFLICT` should not have to arbitrate inside one statement.
 */
export function selectDrainRowsToStore(records: unknown[]): VercelDrainLogRow[] {
  const seen = new Set<string>();
  const rows: VercelDrainLogRow[] = [];
  for (const record of records) {
    const row = normalizeVercelDrainLog(record);
    if (!row || !shouldPersistDrainLog(row)) continue;
    if (seen.has(row.logId)) continue;
    seen.add(row.logId);
    rows.push(row);
    if (rows.length >= VERCEL_DRAIN_MAX_ROWS_PER_DELIVERY) break;
  }
  return rows;
}

export type DrainInsertResult = { stored: number } | { stored: null; reason: "db_unconfigured" };

/**
 * Store the selected rows. Throws on DB failure so the route can answer non-2xx
 * and let Vercel redeliver instead of silently losing the batch.
 */
export async function insertDrainLogs(rows: VercelDrainLogRow[]): Promise<DrainInsertResult> {
  if (!dbConfigured || !pool) return { stored: null, reason: "db_unconfigured" };
  if (rows.length === 0) return { stored: 0 };

  let stored = 0;
  for (let offset = 0; offset < rows.length; offset += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(offset, offset + INSERT_CHUNK_SIZE);
    const values: unknown[] = [];
    const placeholders = chunk.map((row) => {
      const base = values.length;
      values.push(
        row.logId,
        row.logTimestamp,
        row.source,
        row.level,
        row.type,
        row.environment,
        row.host,
        row.path,
        row.statusCode,
        row.requestId,
        row.deploymentId,
        row.projectId,
        row.executionRegion,
        row.message,
        JSON.stringify(row.payload),
      );
      const slots = Array.from({ length: 15 }, (_, i) => `$${base + i + 1}`);
      return `(${slots.join(", ")})`;
    });

    const res = await pool.query(
      `INSERT INTO vercel_log_drain_events (
         log_id, log_timestamp, source, level, type, environment, host, path,
         status_code, request_id, deployment_id, project_id, execution_region,
         message, payload
       ) VALUES ${placeholders.join(", ")}
       ON CONFLICT (log_id) DO NOTHING`,
      values,
    );
    stored += res.rowCount ?? 0;
  }
  return { stored };
}

/**
 * Delete rows past the retention window. Best-effort: the caller runs it after
 * the response, and a failed prune must never fail an ingest.
 */
export async function pruneDrainLogs(
  retentionDays: number = VERCEL_DRAIN_RETENTION_DAYS,
): Promise<number> {
  if (!dbConfigured || !pool) return 0;
  const res = await pool.query(
    `DELETE FROM vercel_log_drain_events
     WHERE created_at < NOW() - ($1 || ' days')::interval`,
    [String(retentionDays)],
  );
  return res.rowCount ?? 0;
}

/** At most one prune per instance per hour — a DELETE on every delivery would
 *  cost more than the rows it removes. */
export const PRUNE_MIN_INTERVAL_MS = 60 * 60 * 1000;

let lastPruneAtMs = 0;

/**
 * True when this instance is due for a prune, and claims the slot so two
 * concurrent invocations on the same instance do not both run the DELETE.
 * Exported for tests via {@link resetPruneScheduleForTests}.
 */
export function claimPruneSlot(nowMs: number = Date.now()): boolean {
  if (nowMs - lastPruneAtMs < PRUNE_MIN_INTERVAL_MS) return false;
  lastPruneAtMs = nowMs;
  return true;
}

export function resetPruneScheduleForTests(): void {
  lastPruneAtMs = 0;
}
