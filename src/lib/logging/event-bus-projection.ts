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
 *   5. If the verifier completed successfully (`passed`/`skipped`) and
 *      none of the above blocked/repair/failed gates fired → `phase =
 *      "done"`. This is the terminal-settle for the common case where the
 *      runtime never emits the canonical `version.done` event (only the
 *      legacy `site.done` devLog row) — without it a finished version is
 *      stuck on the non-terminal `verifying` phase forever.
 *   6. Otherwise fall back to the most recent lifecycle phase signalled
 *      by the event stream.
 */

import type {
  EngineEvent,
  VersionBuildErrorEvent,
  VersionDegradedEvent,
  VersionStatus,
  VersionStatusPhase,
  VersionVerifierDoneEvent,
} from "./event-bus-types";

type Degradation = VersionStatus["degradations"][number];

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
      degradations: [],
    };
  }

  let previewBlocked = false;
  let verificationBlocked = false;
  let repairPassIndex = 0;
  let lastBuildError: VersionBuildErrorEvent["error"] | null = null;
  let verifierOutcome: VersionVerifierDoneEvent["outcome"] | null = null;
  let done = false;
  let lastRunId: string | null = null;
  // Use a Map keyed by `kind` so duplicate emissions (same condition
  // observed across multiple passes) collapse to the most recent message.
  // A clean save resets this — see the `version.saved` branch below.
  const degradations = new Map<VersionDegradedEvent["kind"], Degradation>();

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
          // Same logic for degradations: once we commit a clean save,
          // skipped-by-heavy-load notes from earlier passes are stale.
          degradations.clear();
        }
        phaseSignals.push("preflighting");
        break;

      case "version.degraded":
        degradations.set(event.kind, {
          kind: event.kind,
          message: event.message,
          meta: event.meta ?? null,
        });
        // Degradations are observability — they don't move the phase
        // signal stream. The UI surface is the new `degradations` array.
        break;

      case "version.build.error": {
        // plan-02 / STATUS-02: only `error`-severity build events flip
        // the projection into `blocked`/`failed`. `warning`/`info` rows
        // (e.g. `merge:cross-file-stub` stubbings, SEO notes from the
        // quality-gate) live in `engine_version_error_logs` for the
        // diagnostics modal but must not turn the streaming status
        // panel red — the build itself is still shippable. Pre-fix,
        // any subscriber emitting via `emitVersionErrorLogs` with
        // `level: "warning"` silently locked the version into
        // `verificationBlocked = true`, which is exactly the
        // "false-red" failure mode plan 01 was hunting.
        const level = event.level ?? "error";
        if (level === "error") {
          lastBuildError = event.error;
          verificationBlocked = true;
          phaseSignals.push("blocked");
        }
        // Non-error levels are observability only — they don't
        // contribute to the phase signal stream.
        break;
      }

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
    // `done` is true for an explicit `version.done` event AND for a
    // verifier-settled terminal `done` phase (see `deriveFinalPhase`), so
    // the polling client (`useVersionStatus`) stops re-fetching a version
    // that has actually finished rather than polling it forever.
    done: done || phase === "done",
    verifierOutcome,
    degradations: Array.from(degradations.values()),
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

  // Terminal-settle: the canonical `version.done` terminal event is not
  // yet emitted by the runtime — only the legacy `site.done` devLog row
  // is (see the `version.done` cut-over note in event-bus-subscribers.ts).
  // Until that emitter is wired, a *successfully completed* verifier
  // (`passed`/`skipped`, having passed the failed/blocked/repairing gates
  // above) is the authoritative end-of-stream signal. Without this a
  // finished version would be stuck forever on the non-terminal
  // `verifying` phase — which the builder UI renders as a perpetual
  // "Verifierar" spinner and which also masks `promoted` (release-state)
  // from ever surfacing. The false-green guard still applies downstream:
  // a `done` carrying `degradations[]` maps to `degraded`, never solid
  // success.
  if (verifierOutcome === "passed" || verifierOutcome === "skipped") {
    return "done";
  }

  return lastSignal;
}
