/**
 * OMTAG-06 — Canonical projection from `EngineEvent[]` → `VersionStatus`.
 *
 * The projection is pure and deterministic so it can run identically on
 * both the server (when persisting final state) and the client (when
 * rendering the preview panel from an SSE / polling stream). It takes
 * precedence over the three parallel status writers this bus replaces:
 * `preflight.summary` devLog entries, `engine_version_error_logs`
 * rows, and the old `resolveEngineVersionDisplayStatus()` that derived
 * status from DB row flags alone.
 *
 * Rules (ordered evaluation against the event stream):
 *
 *   1. If `version.done` is present → `phase = "done"`.
 *   2. If the latest event is a `version.build.error` with no subsequent
 *      clean `version.preflight`, the phase is `failed` / `blocked`.
 *   3. If a repair pass has started and no later `version.saved` →
 *      `phase = "repairing"`.
 *   4. If the latest preflight / verifier shows blockers →
 *      `phase = "blocked"`.
 *   5. Otherwise fall back to the most recent lifecycle phase signalled
 *      by the event stream.
 */

import type {
  EngineEvent,
  VersionBuildErrorEvent,
  VersionStatus,
  VersionStatusPhase,
  VersionVerifierDoneEvent,
} from "./event-bus-types";

export function selectVersionStatus(events: EngineEvent[]): VersionStatus {
  if (events.length === 0) {
    return {
      runId: null,
      phase: "idle",
      previewBlocked: false,
      verificationBlocked: false,
      repairPassIndex: 0,
      lastBuildError: null,
      eventCount: 0,
      done: false,
      verifierOutcome: null,
    };
  }

  let previewBlocked = false;
  let verificationBlocked = false;
  let repairPassIndex = 0;
  let lastBuildError: VersionBuildErrorEvent["error"] | null = null;
  let verifierOutcome: VersionVerifierDoneEvent["outcome"] | null = null;
  let done = false;
  let lastRunId: string | null = null;

  // Track which phases we've seen in order so a reverse-scan can pick
  // the most recent. `phaseSignals` is the ordered history of projected
  // phase states (ignoring terminal/blocked overrides) across events.
  const phaseSignals: VersionStatusPhase[] = [];

  for (const event of events) {
    lastRunId = event.runId;
    switch (event.t) {
      case "version.started":
        phaseSignals.push("streaming");
        break;

      case "version.stream.tokenProgress":
        phaseSignals.push("streaming");
        break;

      case "version.autofix.result":
        phaseSignals.push("autofixing");
        break;

      case "version.syntax.pass":
        phaseSignals.push("validating");
        break;

      case "version.preflight":
        previewBlocked = event.previewBlocked;
        verificationBlocked = event.verificationBlocked;
        phaseSignals.push("preflighting");
        break;

      case "version.verifier.done":
        verifierOutcome = event.outcome;
        if (event.blocked) {
          verificationBlocked = true;
        }
        phaseSignals.push("verifying");
        break;

      case "version.repair.started":
        phaseSignals.push("repairing");
        break;

      case "version.repair.passIndex":
        if (typeof event.passIndex === "number" && Number.isFinite(event.passIndex)) {
          repairPassIndex = Math.max(repairPassIndex, event.passIndex);
        }
        phaseSignals.push("repairing");
        break;

      case "version.saved":
        // A save is authoritative: the DB row reflects whichever
        // blockers the finalize pipeline decided on. That means a
        // clean save clears stale blockers from prior passes (this is
        // how a successful repair pass resets the UI state).
        previewBlocked = event.previewBlocked;
        verificationBlocked = event.verificationBlocked;
        if (!event.previewBlocked && !event.verificationBlocked) {
          lastBuildError = null;
          verifierOutcome = null;
        }
        phaseSignals.push("preflighting");
        break;

      case "version.build.error":
        lastBuildError = event.error;
        verificationBlocked = true;
        phaseSignals.push("blocked");
        break;

      case "version.done":
        done = true;
        phaseSignals.push("done");
        break;

      default:
        // Exhaustiveness guard — EngineEvent is a closed union. If the
        // type-checker reaches here a new event type was added without
        // a projection rule.
        break;
    }
  }

  const phase = deriveFinalPhase({
    phaseSignals,
    done,
    previewBlocked,
    verificationBlocked,
    verifierOutcome,
    lastBuildError,
  });

  return {
    runId: lastRunId,
    phase,
    previewBlocked,
    verificationBlocked,
    repairPassIndex,
    lastBuildError,
    eventCount: events.length,
    done,
    verifierOutcome,
  };
}

function deriveFinalPhase(params: {
  phaseSignals: VersionStatusPhase[];
  done: boolean;
  previewBlocked: boolean;
  verificationBlocked: boolean;
  verifierOutcome: VersionVerifierDoneEvent["outcome"] | null;
  lastBuildError: VersionBuildErrorEvent["error"] | null;
}): VersionStatusPhase {
  const { phaseSignals, done, previewBlocked, verificationBlocked, verifierOutcome, lastBuildError } =
    params;

  if (done) return "done";

  // Build-error trumps everything else when the latest signal IS the
  // error — otherwise a subsequent `version.saved` may have cleared it.
  if (phaseSignals.at(-1) === "blocked" && lastBuildError) {
    return "failed";
  }

  // Active repair flow: the last signal was repair-related and we
  // haven't seen a terminating event.
  const lastSignal = phaseSignals.at(-1) ?? "idle";
  if (lastSignal === "repairing") {
    return "repairing";
  }

  // Verifier failed takes priority over plain "blocked" because the
  // UI surfaces "build/typecheck failed" differently from a preflight
  // issue list.
  if (verifierOutcome === "failed" && (verificationBlocked || lastSignal === "verifying")) {
    return "failed";
  }

  if (verificationBlocked || previewBlocked) {
    // A blocked version that isn't actively being repaired shows up as
    // blocked until something clears it.
    return "blocked";
  }

  return lastSignal;
}
