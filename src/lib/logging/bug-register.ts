import fs from "node:fs";
import path from "node:path";

/**
 * Bug register (Fas 2).
 *
 * A hands-on JSONL mirror of the bug findings that are already persisted in
 * `engine_version_error_logs`. The DB stays the source of truth; this file is a
 * flat, append-only export under `logs/bug-register.jsonl` so you can do simple
 * statistics (frequency per category/check, repair success rate, etc.) without
 * SQL.
 *
 * Only `warning`/`error` rows are mirrored (the bug signal); `info` is dropped
 * to keep the register low-noise. Best-effort: writing is fully guarded and
 * never throws (serverless filesystems are read-only, so this no-ops in prod —
 * the DB still has the data).
 */

const BUG_REGISTER_DIR = path.join(process.cwd(), "logs");
const BUG_REGISTER_FILE = path.join(BUG_REGISTER_DIR, "bug-register.jsonl");

const MESSAGE_MAX = 500;

export interface BugRegisterSourcePayload {
  chatId: string;
  versionId: string;
  level: "info" | "warning" | "error";
  category?: string | null;
  message: string;
  meta?: Record<string, unknown> | null;
}

export interface BugRegisterEntry {
  ts: string;
  chatId: string;
  versionId: string;
  level: string;
  category: string | null;
  message: string;
  firstFailureCheck: string | null;
  failedChecks: string[];
  fixerModelId: string | null;
  repaired: boolean | null;
  llmPasses: number | null;
  earlyStopReason: string | null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function extractFailedChecks(meta: Record<string, unknown>): string[] {
  const checks = meta.checks;
  if (Array.isArray(checks)) {
    return checks
      .filter(
        (check): check is Record<string, unknown> =>
          Boolean(check) && typeof check === "object" &&
          (check as Record<string, unknown>).passed === false,
      )
      .map((check) => asString(check.check))
      .filter((check): check is string => Boolean(check));
  }
  const failedChecks = meta.failedChecks;
  if (Array.isArray(failedChecks)) {
    return failedChecks
      .map((check) => asString(check))
      .filter((check): check is string => Boolean(check));
  }
  return [];
}

/**
 * Pure mapper: turn a persisted finding payload into a flat register entry, or
 * null when the row is not a bug signal (`info` level).
 */
export function bugRegisterEntryFromPayload(
  payload: BugRegisterSourcePayload,
  now: Date = new Date(),
): BugRegisterEntry | null {
  if (payload.level !== "warning" && payload.level !== "error") return null;
  const meta =
    payload.meta && typeof payload.meta === "object" ? payload.meta : {};

  return {
    ts: now.toISOString(),
    chatId: payload.chatId,
    versionId: payload.versionId,
    level: payload.level,
    category: payload.category ?? null,
    message:
      typeof payload.message === "string"
        ? payload.message.slice(0, MESSAGE_MAX)
        : "",
    firstFailureCheck: asString(meta.firstFailureCheck),
    failedChecks: extractFailedChecks(meta),
    fixerModelId: asString(meta.fixerModelId),
    repaired: asBoolean(meta.repaired),
    llmPasses: asNumber(meta.llmPasses),
    earlyStopReason: asString(meta.earlyStopReason),
  };
}

/**
 * Append finding payloads to the JSONL bug register. Filters to bug-level rows,
 * never throws. Synchronous append keeps line ordering and is cheap at the low
 * volume of verify/repair findings.
 */
export function appendBugRegisterEntries(
  payloads: BugRegisterSourcePayload[],
): void {
  try {
    if (payloads.length === 0) return;
    const now = new Date();
    const entries = payloads
      .map((payload) => bugRegisterEntryFromPayload(payload, now))
      .filter((entry): entry is BugRegisterEntry => entry !== null);
    if (entries.length === 0) return;

    fs.mkdirSync(BUG_REGISTER_DIR, { recursive: true });
    const lines = `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
    fs.appendFileSync(BUG_REGISTER_FILE, lines, "utf8");
  } catch {
    // Best-effort telemetry — never let a logging failure break a DB write.
  }
}
