/**
 * Error-log producer for the Vector RAG over historical fault/fix events.
 *
 * Writes append-only NDJSON to `logs/llm-segmentts-and-index/error-log.ndjson`
 * (gitignored; per-machine). The schema mirrors the Fault and Fix Index
 * documented in `logs/llm-segmentts-and-index/readme.txt`:
 *
 *   {
 *     time,            // ISO timestamp
 *     phase,           // pre-gen | codegen | post-gen | quality-gate | server
 *     subphase,        // e.g. "verifier-pass", "validate-and-fix", "preflight"
 *     creator,         // who emitted the fault — generator, deterministic-autofix, ...
 *     fixer,           // who attempted the fix — empty when this row is just a fault
 *     severity,        // "error" | "warning" | "info"
 *     fault,           // short slug for the fault category (e.g. "react-import-missing")
 *     faultText,       // the raw error message / detail
 *     fixText,         // optional — short description of the fix that was applied
 *     modelTier,       // resolvedTier when known
 *     model,           // the actual model id when known
 *     provider,        // own-engine | openai | anthropic | ...
 *     passNumber,      // sequential pass number
 *     repairPassIndex, // 0 = init, >=1 = follow-up/repair
 *     result,          // "fixed" | "still-failing" | "noop"
 *     chatId,
 *     versionId,
 *     scaffoldId,
 *     routePath,       // optional structured rerank context
 *     variantId,       // optional structured rerank context
 *     capabilityIds,   // optional structured rerank context
 *     generationMode,  // init | followup | auto_repair | null
 *     lineageHash,
 *   }
 *
 * The retriever (Phase 3.4) reads this file via the indexer to suggest
 * "Lessons from similar past builds" in the system-prompt.
 *
 * SAFETY:
 * - Best-effort. Never throws — wraps fs.appendFile in try/catch.
 * - Skipped entirely when FEATURES.useErrorLogRag is false.
 * - Append-only: rows are never rewritten, so concurrent writers are safe.
 * - Per-row size cap of 8 KB to prevent runaway log explosion.
 */

import fs from "node:fs";
import path from "node:path";
import { FEATURES } from "@/lib/config";

const ERROR_LOG_DIR = path.join(process.cwd(), "logs", "llm-segmentts-and-index");
const ERROR_LOG_NDJSON = path.join(ERROR_LOG_DIR, "error-log.ndjson");
const MAX_ROW_BYTES = 8 * 1024;

export type ErrorLogPhase =
  | "pre-gen"
  | "codegen"
  | "post-gen"
  | "quality-gate"
  | "server";

export type ErrorLogSeverity = "error" | "warning" | "info";

export type ErrorLogResult = "fixed" | "still-failing" | "noop" | null;

export interface ErrorLogEvent {
  phase: ErrorLogPhase;
  subphase: string;
  creator: string;
  fixer?: string | null;
  severity: ErrorLogSeverity;
  fault: string;
  faultText: string;
  fixText?: string | null;
  modelTier?: string | null;
  model?: string | null;
  provider?: string | null;
  passNumber?: number | null;
  repairPassIndex?: number | null;
  result?: ErrorLogResult;
  chatId?: string | null;
  versionId?: string | null;
  scaffoldId?: string | null;
  routePath?: string | null;
  variantId?: string | null;
  capabilityIds?: string[];
  generationMode?: "init" | "followup" | "auto_repair" | null;
  lineageHash?: string | null;
}

function ensureDirSync(): void {
  try {
    fs.mkdirSync(ERROR_LOG_DIR, { recursive: true });
  } catch {
    // intentional swallow — best-effort
  }
}

function clip(value: string, max = 800): string {
  if (typeof value !== "string") return "";
  return value.length > max ? value.slice(0, max) + "…" : value;
}

/**
 * Append a single fault/fix row to the NDJSON producer.
 * Best-effort; never throws.
 */
export function appendErrorLogEvent(event: ErrorLogEvent): void {
  if (!FEATURES.useErrorLogRag) return;
  const row = {
    time: new Date().toISOString(),
    phase: event.phase,
    subphase: clip(event.subphase, 80),
    creator: clip(event.creator, 80),
    fixer: event.fixer ? clip(event.fixer, 80) : null,
    severity: event.severity,
    fault: clip(event.fault, 80),
    faultText: clip(event.faultText, 800),
    fixText: event.fixText ? clip(event.fixText, 400) : null,
    modelTier: event.modelTier ?? null,
    model: event.model ?? null,
    provider: event.provider ?? null,
    passNumber: event.passNumber ?? null,
    repairPassIndex: event.repairPassIndex ?? null,
    result: event.result ?? null,
    chatId: event.chatId ?? null,
    versionId: event.versionId ?? null,
    scaffoldId: event.scaffoldId ?? null,
    routePath: event.routePath ?? null,
    variantId: event.variantId ?? null,
    capabilityIds: event.capabilityIds ?? [],
    generationMode: event.generationMode ?? null,
    lineageHash: event.lineageHash ?? null,
  };
  const line = JSON.stringify(row) + "\n";
  if (Buffer.byteLength(line, "utf8") > MAX_ROW_BYTES) {
    // Drop the row rather than truncate JSON (would break ndjson parser).
    return;
  }

  // 1) Local NDJSON (dev). Best-effort; no-op on serverless read-only fs.
  try {
    ensureDirSync();
    fs.appendFileSync(ERROR_LOG_NDJSON, line, "utf8");
  } catch {
    // intentional swallow — best-effort
  }

  // 2) Durable Postgres (prod, where the fs above no-ops). Fire-and-forget via
  // dynamic import so the db client is only loaded when a row is actually
  // written, and a write failure never blocks/throws on the generation path.
  try {
    void import("./error-log-store")
      .then((m) => m.insertErrorLogEventToDb(row))
      .catch(() => {});
  } catch {
    // intentional swallow — best-effort
  }
}

/**
 * Stream-read the producer NDJSON. Returns an empty array when the file is
 * missing/unreadable. Used by the indexer + backoffice readers.
 */
export function readAllErrorLogRows(maxRows = 5000): unknown[] {
  try {
    if (!fs.existsSync(ERROR_LOG_NDJSON)) return [];
    const raw = fs.readFileSync(ERROR_LOG_NDJSON, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const start = Math.max(0, lines.length - maxRows);
    const out: unknown[] = [];
    for (let i = start; i < lines.length; i += 1) {
      try {
        out.push(JSON.parse(lines[i]));
      } catch {
        /* skip malformed line */
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Mtime of the producer NDJSON (for delta-based reindex). Returns 0 when
 * missing.
 */
export function getErrorLogProducerMtime(): number {
  try {
    if (!fs.existsSync(ERROR_LOG_NDJSON)) return 0;
    return fs.statSync(ERROR_LOG_NDJSON).mtimeMs;
  } catch {
    return 0;
  }
}

export const ERROR_LOG_NDJSON_PATH = ERROR_LOG_NDJSON;
export const ERROR_LOG_DIR_PATH = ERROR_LOG_DIR;
