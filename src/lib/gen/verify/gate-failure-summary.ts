import type { VersionErrorLog } from "@/lib/db/services/shared";
import { firstGateOutputLine } from "./preview-quality-gate";

const GATE_CHECK_LABELS: Record<string, string> = {
  typecheck: "Typecheck",
  build: "Build",
  lint: "Lint",
};

const CONCRETE_GATE_CHECKS = new Set(Object.keys(GATE_CHECK_LABELS));

function gateCheckLabel(check: string): string {
  return (
    GATE_CHECK_LABELS[check] ?? `${check.charAt(0).toUpperCase()}${check.slice(1)}`
  );
}

function readLogMetaString(meta: unknown, key: string): string | null {
  if (!meta || typeof meta !== "object") return null;
  const value = (meta as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readLogMetaBoolean(meta: unknown, key: string): boolean | null {
  if (!meta || typeof meta !== "object") return null;
  const value = (meta as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : null;
}

function readLogMetaStringArray(meta: unknown, key: string): string[] {
  if (!meta || typeof meta !== "object") return [];
  const value = (meta as Record<string, unknown>)[key];
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.trim().length > 0,
      )
    : [];
}

/**
 * BB#299 / M#vlane2 watchdog reconciliation: whether the version's LATEST
 * `preflight:quality-gate` verdict already concluded the version is launchable
 * (green pass, or an F2 render-first typecheck-advisory). Used by the
 * stale-verification watchdog to avoid terminal-failing a row whose gate
 * actually passed but whose promote-UPDATE died on a transient timeout (the
 * prod false-red profile 2026-07-13), which left the row spinning at
 * `verifying`.
 *
 * `errorLogs` is expected newest-first (created_at desc, as returned by
 * `getEngineVersionErrorLogs`). Returns false when there is no gate verdict at
 * all (nothing proves the version launchable → the watchdog fails it as before).
 *
 * Green/advisory detection (all on the newest `preflight:quality-gate` row):
 *   - `meta.passed === true`          → clean pass.
 *   - `level === "info"`              → any pass verdict (info level is only ever
 *                                       written on a pass/promote).
 *   - `level === "warning"` and NOT a post-repair verdict (`meta.repass !== true`)
 *                                     → F2 render-first typecheck-advisory
 *                                       (launchable). A post-repair "did not pass"
 *                                       warning carries `meta.repass === true` and
 *                                       is NOT treated as green.
 *   - `level === "error"`             → a hard failure → not green.
 */
export function isLatestGateVerdictGreen(errorLogs: VersionErrorLog[]): boolean {
  const latestVerdict = errorLogs.find(
    (log) => log.category === "preflight:quality-gate",
  );
  if (!latestVerdict) return false;
  if (readLogMetaBoolean(latestVerdict.meta, "passed") === true) return true;
  if (latestVerdict.level === "info") return true;
  if (
    latestVerdict.level === "warning" &&
    readLogMetaBoolean(latestVerdict.meta, "repass") !== true
  ) {
    return true;
  }
  return false;
}

/**
 * Whether the version's LATEST `preflight:quality-gate` verdict is an F2
 * render-first typecheck-ADVISORY (a `warning`-level verdict that is green in the
 * launchable sense but NOT a clean pass). This is the `isLatestGateVerdictGreen`
 * "advisory" sub-case, i.e. `green === pass || advisory`.
 *
 * Used by the watchdog reconciliation WIRING (bugbot medium #518): when a stale
 * `verifying` row is reconcile-promoted, an advisory verdict must additionally
 * emit `version.degraded` (mirroring the quality-gate route), so the builder
 * shows "klar med varningar" rather than a false solid-green `done`. A clean
 * pass returns false → no degraded emit.
 *
 * `errorLogs` is expected newest-first. A post-repair "did not pass" warning
 * (`meta.repass === true`) and a clean pass (`level:info` / `meta.passed`) both
 * return false.
 */
export function resolveLatestGateAdvisoryChecks(
  errorLogs: VersionErrorLog[],
): string[] {
  const latestVerdict = errorLogs.find(
    (log) => log.category === "preflight:quality-gate",
  );
  if (!latestVerdict) return [];
  const explicitChecks = readLogMetaStringArray(
    latestVerdict.meta,
    "advisoryChecks",
  );
  if (readLogMetaBoolean(latestVerdict.meta, "advisory") === true) {
    return explicitChecks;
  }
  // Backward compatibility for historic F2 typecheck Advisory rows.
  if (readLogMetaBoolean(latestVerdict.meta, "passed") === true) return [];
  if (latestVerdict.level === "info") return [];
  const legacyF2Advisory =
    latestVerdict.level === "warning" &&
    readLogMetaBoolean(latestVerdict.meta, "repass") !== true;
  return legacyF2Advisory
    ? explicitChecks.length > 0
      ? explicitChecks
      : ["typecheck"]
    : [];
}

export function isLatestGateVerdictAdvisory(errorLogs: VersionErrorLog[]): boolean {
  return resolveLatestGateAdvisoryChecks(errorLogs).length > 0;
}

/** Concrete per-check category (`quality-gate:typecheck|build|lint`) → check name. */
function concreteGateCheck(category: string | null): string | null {
  if (typeof category !== "string" || !category.startsWith("quality-gate:")) {
    return null;
  }
  const check = category.slice("quality-gate:".length);
  return CONCRETE_GATE_CHECKS.has(check) ? check : null;
}

function toEpochMs(value: Date | string | null | undefined): number {
  if (!value) return Number.NaN;
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

/**
 * Build a concrete failure summary from already-logged quality-gate rows so the
 * stale-verification watchdog can report the real cause (e.g. a deterministic
 * typecheck error) instead of a misleading "took too long" timeout that tells
 * the user to "try again".
 *
 * Scoped to the LATEST gate attempt: every gate path (user gate, server-verify,
 * post-repair) writes a `preflight:quality-gate` verdict row, so we anchor on
 * the most recent one. A newer passing/summary verdict must never be overridden
 * by an older failing row, and concrete per-check output is only used when it
 * belongs to that latest attempt (not older).
 *
 * `errorLogs` is expected newest-first (created_at desc, as returned by
 * `getEngineVersionErrorLogs`). Returns null when the latest attempt has no
 * concrete failure, letting the caller fall back to the generic timeout copy.
 */
export function resolveGateFailureSummaryFromLogs(
  errorLogs: VersionErrorLog[],
): string | null {
  const latestVerdict = errorLogs.find(
    (log) => log.category === "preflight:quality-gate",
  );

  // The latest verdict decides. A pass (or any verdict without a named failing
  // check) means there is no current concrete failure to surface, so older
  // failing rows are stale and must be ignored.
  let latestFailureCheck: string | null = null;
  if (latestVerdict) {
    latestFailureCheck = readLogMetaString(latestVerdict.meta, "firstFailureCheck");
    const verdictFailed =
      latestVerdict.level === "error" || latestFailureCheck !== null;
    if (!verdictFailed) {
      return null;
    }
  }

  // Only consider per-check output rows that belong to the latest attempt (i.e.
  // not older than the latest verdict). Without a verdict row, fall back to the
  // newest per-check row.
  const minMs = latestVerdict ? toEpochMs(latestVerdict.created_at) : null;
  for (const log of errorLogs) {
    if (log.level !== "error") continue;
    const check = concreteGateCheck(log.category);
    if (!check) continue;
    if (minMs !== null && Number.isFinite(minMs)) {
      const ms = toEpochMs(log.created_at);
      if (!Number.isFinite(ms) || ms < minMs) continue;
    }
    const line = firstGateOutputLine(readLogMetaString(log.meta, "output"));
    if (line) {
      return `${gateCheckLabel(check)} misslyckades: ${line}`;
    }
  }

  // No concrete per-check output for the latest attempt — name the failing check
  // from the verdict row when available.
  if (latestFailureCheck) {
    return `${gateCheckLabel(latestFailureCheck)} misslyckades under den automatiska verifieringen.`;
  }

  return null;
}
