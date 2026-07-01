/**
 * OMTAG-06 / område 6-1 — Display mapper for the canonical event-bus
 * `VersionStatus` projection.
 *
 * This is the pure, source-of-truth-from-the-bus replacement for the
 * shell/preview-empty-state slice of the now-removed legacy DB resolver
 * (the former `resolveEngineVersionDisplayStatus` in
 * `src/lib/db/engine-version-lifecycle.ts`). It takes the projected
 * `VersionStatus` (from `selectVersionStatus`, read client-side via
 * `useVersionStatus`) plus the small amount of context the bus stream
 * does not carry — whether the version is the latest in the chat, and the
 * DB release-state — and produces a single display token the UI branches
 * on.
 *
 * Two states are *derived* here because the event bus does not model them:
 *
 *   - `retrying` — a newer version exists for the chat AND this version is
 *     still mid-flight (non-terminal phase). Mirrors the legacy
 *     "superseded but not finished" handoff signal.
 *   - `promoted` — read from `releaseState` (`engine_versions.release_state`);
 *     the bus stream has no promotion event.
 *
 * False-green guard (område 7 invariant): a completed run that carries
 * `degradations[]` (verifier skipped, product-postcheck skipped, stubs,
 * placeholders, …) is NEVER mapped to a clean success token. A degraded
 * `done`/`promoted` collapses to `degraded` so the UI surfaces
 * "green but missing X" instead of solid green.
 *
 * Scope note: as of område 6-2 `VersionHistory.tsx` also consumes this
 * mapper — via the server-enriched `busStatus` field on the `/versions`
 * route plus the `version-history-status-labels` presentation layer — so
 * the builder's status surfaces no longer read the legacy DB resolver.
 * The S3 single-writer invariant flips to assert-empty in område 6-3.
 */

import type { VersionStatus } from "@/lib/logging/event-bus-types";

/**
 * Display token consumed by the preview empty-state copy and (område 6-2)
 * version-history badges. A superset of the event-bus phases plus the two
 * derived states (`retrying`, `promoted`) and the false-green `degraded`
 * sentinel.
 */
export type VersionDisplayStatus =
  | "idle"
  | "generating"
  | "autofixing"
  | "validating"
  | "preflighting"
  | "verifying"
  | "repairing"
  | "retrying"
  | "blocked"
  | "failed"
  | "degraded"
  | "promoted"
  | "ready";

export interface VersionDisplayContext {
  /**
   * Whether this is the latest version in the chat. When `false`
   * (a newer version exists) a still-running version is shown as
   * `retrying` rather than its raw phase.
   */
  isLatest: boolean;
  /** `engine_versions.release_state` for this version (`"promoted"` ⇒ promoted). */
  releaseState?: string | null;
}

export interface VersionStatusDisplay {
  /** Token the UI branches on for copy / badge variant. */
  status: VersionDisplayStatus;
  /**
   * True whenever the run accumulated any "works but degraded" notes.
   * Carries information beyond `status` (a `verifying` version can already
   * be degraded), so consumers can flag it independently of the phase.
   */
  degraded: boolean;
  /** Pass-through of the projection's degradation notes for UI surfacing. */
  degradations: VersionStatus["degradations"];
  /**
   * Latest repair pass index (0 when not repairing / never repaired). Lets the
   * UI show bounded "Reparerar X/2" progress so a running repair never reads as
   * an infinite spinner.
   */
  repairPassIndex: number;
}

/**
 * Client-safe upper bound for server repair passes, used as the denominator in
 * the "Reparerar X/2" progress label so a running repair reads as bounded. Must
 * mirror the server `SERVER_REPAIR_MAX_PASSES` (manifest
 * `repairPolicies.serverRepairPasses`); a parity test asserts they stay in sync.
 * Kept as a plain client constant so UI code never imports the server-only
 * env/manifest-reading `defaults.ts` into the browser bundle.
 */
export const MAX_REPAIR_PASSES_DISPLAY = 2;

/**
 * Format repair-pass progress as `current/max` (e.g. `"1/2"`), or `null` when
 * there is no active pass to show. Clamps to the max so a runaway index can
 * never render `"3/2"`.
 */
export function formatRepairPassProgress(repairPassIndex: number): string | null {
  if (!Number.isFinite(repairPassIndex) || repairPassIndex <= 0) return null;
  const current = Math.min(Math.floor(repairPassIndex), MAX_REPAIR_PASSES_DISPLAY);
  return `${current}/${MAX_REPAIR_PASSES_DISPLAY}`;
}

function makeDisplay(
  status: VersionDisplayStatus,
  degraded: boolean,
  degradations: VersionStatus["degradations"],
  repairPassIndex = 0,
): VersionStatusDisplay {
  return { status, degraded, degradations, repairPassIndex };
}

/**
 * Map the bus-projected `VersionStatus` (+ chat context) to a single
 * display token. `status` may be `null` while the client hook is loading
 * or the bus stream is empty — callers get a neutral `idle` (or `promoted`
 * when the DB release-state already says so).
 */
export function mapVersionStatusToDisplay(
  status: VersionStatus | null,
  context: VersionDisplayContext,
): VersionStatusDisplay {
  const degradations: VersionStatus["degradations"] = status?.degradations ?? [];
  // False-green-vakt (defense-in-depth): en skippad verifierare är aldrig
  // ren success även om projektionen/emittern inte gav en degradering.
  const degraded = degradations.length > 0 || status?.verifierOutcome === "skipped";
  const isPromoted = context.releaseState === "promoted";

  // No bus data yet (hook loading / empty stream). The empty-state copy
  // for these moments is driven by other props (previewPending /
  // externalLoading), not this token — but `promoted` is a DB-truth
  // release signal independent of the stream, so honor it (false-green
  // guard still applies).
  if (!status || status.phase === "idle") {
    if (isPromoted) {
      return makeDisplay(degraded ? "degraded" : "promoted", degraded, degradations);
    }
    return makeDisplay("idle", degraded, degradations);
  }

  const phase = status.phase;
  const isTerminal = phase === "done" || phase === "failed";

  // Derived `retrying`: a newer version exists and this one is still
  // mid-flight. Terminal phases keep their own token (a failed/done
  // superseded version is not "retrying").
  if (!context.isLatest && !isTerminal) {
    return makeDisplay("retrying", degraded, degradations);
  }

  switch (phase) {
    case "verifying":
      return makeDisplay("verifying", degraded, degradations);
    case "repairing":
      return makeDisplay("repairing", degraded, degradations, status.repairPassIndex);
    case "blocked":
      return makeDisplay("blocked", degraded, degradations);
    case "failed":
      return makeDisplay("failed", degraded, degradations);
    case "streaming":
      return makeDisplay("generating", degraded, degradations);
    case "autofixing":
      return makeDisplay("autofixing", degraded, degradations);
    case "validating":
      return makeDisplay("validating", degraded, degradations);
    case "preflighting":
      return makeDisplay("preflighting", degraded, degradations);
    case "done":
      // False-green guard: a completed run with silent skips / stubs is
      // never a clean success token, even when promoted.
      if (degraded) return makeDisplay("degraded", true, degradations);
      if (isPromoted) return makeDisplay("promoted", false, degradations);
      return makeDisplay("ready", false, degradations);
    default:
      return makeDisplay("idle", degraded, degradations);
  }
}
