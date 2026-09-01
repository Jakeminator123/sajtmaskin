import { failVersionVerification } from "@/lib/db/chat-repository-pg";
import { getVersionFilesSnapshot } from "@/lib/gen/version-manager";
import { emit as emitBusEvent } from "@/lib/logging/event-bus";
// Side-effect imports: wire default subscribers (devLog-mirror + DB
// sink) so every `version.verifier.done`/`version.build.error` emit
// below reaches both the legacy surfaces and the UI projection.
import "@/lib/logging/event-bus-subscribers";
import "@/lib/logging/event-bus-error-log-sink";
import type { RepairLedger } from "@/lib/gen/autofix/llm-repair-gate";
import { REPAIR_LOOP_BUDGET_MS } from "@/lib/gen/defaults";
import type { ServerVerifyFailedOutput } from "../server-verify-log-meta";
import { resolveBackgroundRepairDeadlineEpochMs } from "../server-repair-policy";
import {
  acquireVerifyLease,
  inflight,
  isLatestVersionForChat,
  isServerVerifyEligible,
  releaseVerifyLease,
} from "./lease";
import { logQualityGateFailuresBestEffort } from "./failures";
import { tryServerRepairLoop } from "./repair-execution";
import { triggerServerVerification } from "./verify-run";

/**
 * Resolves whether the post-VM build-error auto-repair loop is enabled
 * for the current runtime. Defaults to ON in `development` and Vercel
 * `preview` (so the loop is exercised constantly during build), and OFF
 * in `production` until we have enough live data to flip the default
 * there too. Explicit `SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR=0|1|true|false`
 * always wins over the default.
 */
function isAutoRepairBuildErrorEnabled(): boolean {
  const explicit = process.env.SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR?.trim().toLowerCase();
  if (explicit === "1" || explicit === "true" || explicit === "on" || explicit === "yes") {
    return true;
  }
  if (explicit === "0" || explicit === "false" || explicit === "off" || explicit === "no") {
    return false;
  }
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (vercelEnv === "preview" || vercelEnv === "development") return true;
  if (vercelEnv === "production") return false;
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
  if (nodeEnv === "development" || nodeEnv === "test") return true;
  return false;
}

/**
 * Auto-trigger a server-side repair loop when the live preview-VM emits
 * a `build-error` SSE (npm install / next build / dev server crashed).
 *
 * Closes the gap between "the user mental model" — *VM-fel ska åka
 * tillbaka in i repair-kedjan automatiskt* — and the previous reality,
 * where build-error only triggered a UI banner unless the user
 * manually clicked "Repair" or the F2 verification policy happened to
 * also schedule server-verify (which it usually doesn't in design
 * mode, see `resolvePostFinalizeServerVerifyDecision`).
 *
 * **Default on in dev/preview** (Wave 4 of the LLM-flow consolidation).
 * Production still waits for explicit opt-in via
 * `SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR=1` until we have enough field
 * data to flip the production default. Same `inflight` dedup as
 * server-verify, so we never run two repair loops on the same version
 * concurrently regardless of which path triggered them.
 */
/**
 * Utfall från `triggerBuildErrorRepair`. `void`-returen behölls tidigare (alla
 * finalize/preview-anropare kör fire-and-forget), men A3:s manuella
 * deploy-repair-endpoint behöver veta om en `repair_available`-version faktiskt
 * producerades för att kunna svara UI:t.
 */
export type BuildErrorRepairOutcome = {
  /** Sant om repair-loopen faktiskt kördes (klarade eligibility + fick lease). */
  started: boolean;
  /** Sant om en repair sparades (`repair_available`) — `onRepairAvailable` fyrade. */
  repairAvailable: boolean;
  /** Varför loopen inte kördes, när `started === false`. */
  skippedReason?:
    "auto_repair_disabled" | "not_eligible" | "lease_busy" | "not_latest" | "no_files";
};

export async function triggerBuildErrorRepair(params: {
  chatId: string;
  versionId: string;
  buildError: {
    stage: string;
    message: string;
    failureCode?: string | null;
  };
  /** Fas 3 (RepairGate): finalize's ledger + scope — see triggerServerVerification. */
  repairLedger?: RepairLedger;
  repairScopeId?: string;
  /**
   * A3: kringgå `isAutoRepairBuildErrorEnabled()`-env-gaten. Sätts av den
   * MANUELLA deploy-repair-endpointen ("Publicera om med fix") — knappen ska
   * fungera oavsett auto-repair-flaggan (auto-redeploy förblir av; detta är ett
   * explicit knapptryck, inte auto-trigger).
   */
  force?: boolean;
  /**
   * A3: absolut `Date.now()`-deadline som binder repair-loopen till den anropande
   * route:ns `maxDuration` (deploy-repair-endpointen är synkron, till skillnad
   * från finalize/preview som är fire-and-forget). Trädas ner i `runRepairLoop`.
   * Utelämnad → obundet (dagens bakgrundsbeteende).
   */
  repairDeadlineEpochMs?: number;
  onRepairAvailable?: (payload: {
    versionId: string;
    summary: string | null;
    repairAvailableAt: string | null;
  }) => void;
}): Promise<BuildErrorRepairOutcome> {
  const { force = false, repairDeadlineEpochMs } = params;
  if (!force && !isAutoRepairBuildErrorEnabled()) {
    return { started: false, repairAvailable: false, skippedReason: "auto_repair_disabled" };
  }
  const { chatId, versionId, buildError, onRepairAvailable, repairLedger, repairScopeId } = params;
  if (!isServerVerifyEligible(versionId)) {
    return { started: false, repairAvailable: false, skippedReason: "not_eligible" };
  }
  // A3: fånga om en repair faktiskt sparades (repair_available) så det manuella
  // endpointet kan svara UI:t, utan att ändra callback-kontraktet för de
  // befintliga fire-and-forget-anroparna.
  let repairAvailable = false;
  const trackedOnRepairAvailable = (payload: {
    versionId: string;
    summary: string | null;
    repairAvailableAt: string | null;
  }): void => {
    repairAvailable = true;
    onRepairAvailable?.(payload);
  };
  // OMTAG-06 / Codex P2: surface the preview-VM build error as a first-class bus
  // event BEFORE acquiring the lease, so the signal (and its error-log
  // projection) is never dropped when another job already owns the version —
  // only the mutating repair below is skipped in that case. The projection will
  // flip `phase` to "failed" until a clean repair pass lands and emits
  // `version.saved` without blockers.
  emitBusEvent({
    t: "version.build.error",
    versionId,
    chatId,
    error: {
      stage: buildError.stage,
      message: buildError.message,
      failureCode: buildError.failureCode ?? null,
    },
    level: "error",
    category: "preview-vm",
  });
  inflight.add(versionId);
  const lease = await acquireVerifyLease(versionId, "build_error_repair");
  if (!lease.proceed) {
    // Another live lease already owns this version — the build-error event is
    // already emitted above; skip only the mutating repair to avoid racing it.
    inflight.delete(versionId);
    return { started: false, repairAvailable: false, skippedReason: "lease_busy" };
  }
  const runId = lease.runId;
  // A3-utfall: sätts när loopen faktiskt körs / hoppas över inuti try/finally.
  let started = false;
  let skippedReason: BuildErrorRepairOutcome["skippedReason"];
  let supersededByUserEdit = false;
  // #260 Codex P2: this loop is always build-originated; carry that into the
  // post-supersede re-verify so the current files' gate keeps `build`.
  let reverifyForceBuildCheck = false;
  // #260 Codex P2 / Bugbot (no stuck `repairing` / no fail of B on crash): the
  // exact files_json this run is based on, hoisted so the catch can re-check
  // staleness and schedule a re-verify instead of leaving B stuck in `repairing`.
  let baseFilesJsonForRecovery: string | null = null;
  try {
    if (!(await isLatestVersionForChat(chatId, versionId))) {
      skippedReason = "not_latest";
      return { started, repairAvailable, skippedReason };
    }
    const snapshot = await getVersionFilesSnapshot(versionId);
    if (!snapshot || snapshot.files.length === 0) {
      skippedReason = "no_files";
      return { started, repairAvailable, skippedReason };
    }
    started = true;
    const codeFiles = snapshot.files;
    const baseFilesJson = snapshot.filesJson;
    baseFilesJsonForRecovery = baseFilesJson;
    const failureCodeSuffix = buildError.failureCode ? ` [${buildError.failureCode}]` : "";
    const failedOutput: ServerVerifyFailedOutput = {
      check: "build",
      exitCode: 1,
      output: `[preview-vm:${buildError.stage}]${failureCodeSuffix} ${buildError.message}`,
      durationMs: null,
    };
    logQualityGateFailuresBestEffort({
      chatId,
      versionId,
      failedOutputs: [failedOutput],
    });
    const repairOutcome = await tryServerRepairLoop({
      chatId,
      versionId,
      codeFiles,
      baseFilesJson,
      previewPolicy: snapshot.lifecycleStage === "integrations" ? "fidelity3" : "fidelity2",
      failedOutputs: [failedOutput],
      verifyLaneDurationMs: 0,
      firstFailureCheck: "build",
      jobStartedAt: null,
      jobFinishedAt: null,
      onRepairAvailable: trackedOnRepairAvailable,
      runId,
      // #260 Codex P2 (forced build gate): this path is always build-originated.
      forceBuildGate: true,
      // A3: the synchronous deploy-repair endpoint binds the loop to its route
      // `maxDuration` (explicit `repairDeadlineEpochMs`). The fire-and-forget
      // callers (post-finalize preview build-error) used to pass none → unbounded
      // token burn after the user left; fall back to the background wall-clock
      // ceiling so those runs are bounded too. An explicit caller value wins.
      repairDeadlineEpochMs:
        repairDeadlineEpochMs ??
        resolveBackgroundRepairDeadlineEpochMs({
          nowMs: Date.now(),
          budgetMs: REPAIR_LOOP_BUDGET_MS,
        }),
      repairLedger,
      repairScopeId,
    });
    supersededByUserEdit = repairOutcome.supersededByUserEdit;
    reverifyForceBuildCheck = repairOutcome.buildOriginated;
  } catch (err) {
    console.error("[server-verify] build-error repair failed:", err);
    // #260 Codex P2 / Bugbot: if a concurrent user edit advanced files_json past
    // this run's snapshot, don't leave B stuck in `repairing` with no recovery —
    // schedule the post-finally re-verify of B (build kept in the gate) instead
    // of swallowing the error and stranding the row.
    let staleAfterError = false;
    if (baseFilesJsonForRecovery !== null) {
      const current = await getVersionFilesSnapshot(versionId).catch(() => null);
      if (current && current.filesJson !== baseFilesJsonForRecovery) {
        staleAfterError = true;
      }
    }
    if (staleAfterError) {
      supersededByUserEdit = true;
      reverifyForceBuildCheck = true;
    } else if (started) {
      // `tryServerRepairLoop` already moved the row to `repairing`; the lease is
      // released in `finally` and nothing else settles it, so a non-stale crash
      // left the version stuck there until the readiness watchdog's much later
      // age cutoff. Mirror `triggerServerVerification`'s catch and resolve the
      // row to a terminal state on this run's own lease.
      await failVersionVerification(
        versionId,
        "Server verification could not complete.",
        runId,
      ).catch(() => null);
    }
  } finally {
    await releaseVerifyLease(versionId, runId);
    inflight.delete(versionId);
  }

  // #260 Codex P2 (stale-base re-verify): a concurrent user edit advanced
  // files_json past the repaired-from snapshot, so the repair no-op'd and did
  // NOT fail the version. Re-verify the CURRENT files (B) on a fresh lease (run
  // AFTER releasing this run's lease) so B reaches an honest terminal state
  // instead of lingering in `repairing`. See triggerServerVerification.
  if (supersededByUserEdit) {
    await triggerServerVerification({
      chatId,
      versionId,
      onRepairAvailable: trackedOnRepairAvailable,
      forceBuildCheck: reverifyForceBuildCheck,
      repairLedger,
      repairScopeId,
    });
  }

  return { started, repairAvailable, skippedReason };
}
