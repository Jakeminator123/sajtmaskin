import {
  failVersionVerification,
  failVersionVerificationIfUnleased,
  getRunningVersionLease,
  getVersionById,
} from "@/lib/db/chat-repository-pg";
import type { RepairProvenance } from "@/lib/db/repair-files-payload";
import { holdVersionForIntegrationMigration } from "@/lib/db/chat-repository/version-lifecycle";
import { REPAIR_ABORTED_SUMMARY } from "@/lib/gen/verify/repair-abort-copy";
import {
  isCurrentIntegrationMigrationHold,
  isFreshVersionLease,
  isNonTerminalVerificationState,
} from "@/lib/gen/verify/stale-verification";
import { getVersionFilesSnapshot } from "@/lib/gen/version-manager";
import { emit as emitBusEvent } from "@/lib/logging/event-bus";
// Side-effect imports: wire default subscribers (devLog-mirror + DB
// sink) so every `version.verifier.done`/`version.build.error` emit
// below reaches both the legacy surfaces and the UI projection.
import "@/lib/logging/event-bus-subscribers";
import "@/lib/logging/event-bus-error-log-sink";
import type { RepairLedger } from "@/lib/gen/autofix/llm-repair-gate";
import { readServerRepairBudget } from "@/lib/db/services/server-repair-budget";
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
import {
  evaluateServerOwnedF3Readiness,
  loadServerVerifyF3ReadinessContext,
  persistF3ReadinessHold,
  resolveSnapshotFilesRevision,
} from "./f3-readiness";
import type { HeldVersionVerificationInput, VersionVerificationOutcome } from "./verify-run";

const REVERIFY_CURRENT_CONTEXT = Symbol("reverify-current-context");

/**
 * Resolves whether the post-VM build-error auto-repair loop is enabled
 * for the current runtime. **Default ON everywhere** since 2026-09-11 —
 * production included. It was OFF in production "until we have enough
 * live data"; 40 days of prod (2026-08-02 → 2026-09-11) gave that data:
 * the server repair-loop ran 3 times and repaired 3/3, every run is
 * bounded by `REPAIR_LOOP_BUDGET_MS` + the `RepairLedger` dedupe, and the
 * same `inflight`/lease guards as server-verify prevent parallel repairs
 * of one version. Explicit `SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR=0|1|true|
 * false|on|off|yes|no` always wins over the default — `0` is the
 * production kill-switch.
 */
export function isAutoRepairBuildErrorEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const explicit = env.SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR?.trim().toLowerCase();
  if (explicit === "0" || explicit === "false" || explicit === "off" || explicit === "no") {
    return false;
  }
  return true;
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
 * **Default on in every environment** (Wave 4 of the LLM-flow
 * consolidation flipped dev/preview; 2026-09-11 flipped production after
 * 40 days of 3/3 successful bounded repairs). `SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR=0`
 * is the kill-switch. Same `inflight` dedup as server-verify, so we never
 * run two repair loops on the same version concurrently regardless of
 * which path triggered them.
 */
/**
 * Utfall från `triggerBuildErrorRepair`. `void`-returen behölls tidigare (alla
 * finalize/preview-anropare kör fire-and-forget), men A3:s manuella
 * deploy-repair-endpoint behöver veta om en `repair_available`-version faktiskt
 * producerades för att kunna svara UI:t.
 */
export type BuildErrorRepairOutcome = {
  verification?: VersionVerificationOutcome;
  /** Sant om repair-loopen faktiskt kördes (klarade eligibility + fick lease). */
  started: boolean;
  /** Sant om en repair sparades (`repair_available`) — `onRepairAvailable` fyrade. */
  repairAvailable: boolean;
  /** Varför loopen inte kördes, när `started === false`. */
  skippedReason?:
    | "auto_repair_disabled"
    | "not_eligible"
    | "lease_busy"
    | "lease_unavailable"
    | "not_latest"
    | "no_files"
    | "f3_readiness_hold";
};

export type BuildErrorRepairInput = {
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
  contextRetryUsed?: boolean;
  onRepairAvailable?: (payload: {
    versionId: string;
    summary: string | null;
    repairAvailableAt: string | null;
  }) => void;
  /** SM-003: stamp the saved envelope when this run is a manual deploy-repair. */
  repairProvenance?: RepairProvenance;
};

export async function triggerBuildErrorRepair(params: BuildErrorRepairInput): Promise<BuildErrorRepairOutcome> {
  const { force = false } = params;
  if (!force && !isAutoRepairBuildErrorEnabled()) {
    return { started: false, repairAvailable: false, skippedReason: "auto_repair_disabled" };
  }
  const {
    chatId,
    versionId,
    buildError,
  } = params;
  if (!isServerVerifyEligible(versionId)) {
    return { started: false, repairAvailable: false, skippedReason: "not_eligible" };
  }
  // A3: fånga om en repair faktiskt sparades (repair_available) så det manuella
  // endpointet kan svara UI:t, utan att ändra callback-kontraktet för de
  // befintliga fire-and-forget-anroparna.
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
  // C1/C2: a prior isolate-kill can leave `repairing` + a zombie lease.
  // Fail that hung row BEFORE acquiring a new 950s loop. A fresh lease is
  // genuinely busy; a dead one is not. Auto-repair (force=false) stops after
  // the fail so we never silently start another isolate.
  const hung = await getVersionById(versionId).catch(() => null);
  if (hung?.verification_state === "repairing") {
    let runningLease: Awaited<ReturnType<typeof getRunningVersionLease>> = null;
    try {
      runningLease = await getRunningVersionLease(versionId);
    } catch {
      inflight.delete(versionId);
      return { started: false, repairAvailable: false, skippedReason: "lease_unavailable" };
    }
    if (!runningLease || !isFreshVersionLease(runningLease)) {
      await failVersionVerificationIfUnleased(versionId, REPAIR_ABORTED_SUMMARY, {
        verificationState: "repairing",
        filesRevision: hung.files_revision ?? null,
      }).catch(() => null);
      if (!force) {
        inflight.delete(versionId);
        return { started: false, repairAvailable: false };
      }
    }
  }
  const lease = await acquireVerifyLease(versionId, "build_error_repair");
  if (!lease.proceed) {
    // Another live lease, or the distributed lock could not be proven — the
    // build-error event is already emitted above; skip the mutating repair.
    inflight.delete(versionId);
    return {
      started: false,
      repairAvailable: false,
      skippedReason: lease.reason,
    };
  }
  try {
    const snapshot = await getVersionFilesSnapshot(versionId).catch(() => null);
    if (!snapshot?.files.length) return { started: false, repairAvailable: false, skippedReason: "no_files" };
    const held = await repairBuildErrorUnderLease({ ...params, holderRunId: lease.runId, snapshot });
    return { started: held.started, repairAvailable: held.repairAvailable,
      skippedReason: held.skippedReason, verification: held.verification };
  } finally {
    await releaseVerifyLease(versionId, lease.runId);
    inflight.delete(versionId);
  }
}

/** Preview/build-error path under an existing lease; no fresh paid scope or re-entry. */
export async function repairBuildErrorUnderLease(
  params: BuildErrorRepairInput & Pick<HeldVersionVerificationInput, "holderRunId" | "snapshot">,
): Promise<BuildErrorRepairOutcome & { verification: VersionVerificationOutcome }> {
  const { chatId, versionId, buildError, repairLedger, repairScopeId, repairProvenance,
    force = false, repairDeadlineEpochMs } = params;
  const runId = params.holderRunId;
  let verification: VersionVerificationOutcome = { kind: "stop", reason: "repair_settled", retryable: false };
  if (!runId?.trim() || !params.snapshot.filesRevision?.trim()) return {
    started: false, repairAvailable: false, verification: { kind: "stop", reason: "snapshot_unavailable", retryable: true },
  };
  if (!force && !isAutoRepairBuildErrorEnabled()) return {
    started: false, repairAvailable: false, skippedReason: "auto_repair_disabled",
    verification: { kind: "stop", reason: "auto_repair_disabled", retryable: false },
  };
  let repairAvailable = false;
  const trackedOnRepairAvailable = (payload: Parameters<NonNullable<BuildErrorRepairInput["onRepairAvailable"]>>[0]) => {
    repairAvailable = true;
    params.onRepairAvailable?.(payload);
  };
  // A3-utfall: sätts när loopen faktiskt körs / hoppas över inuti try/finally.
  let started = false;
  let skippedReason: BuildErrorRepairOutcome["skippedReason"];
  let reverifyCurrent = false;
  let reverifyFromContextCasMiss = false;
  // #260 Codex P2: this loop is always build-originated; carry that into the
  // post-supersede re-verify so the current files' gate keeps `build`.
  // #260 Codex P2 / Bugbot (no stuck `repairing` / no fail of B on crash): the
  // exact files_json this run is based on, hoisted so the catch can re-check
  // staleness and schedule a re-verify instead of leaving B stuck in `repairing`.
  let baseFilesJsonForRecovery: string | null = null;
  const execute = async (): Promise<BuildErrorRepairOutcome> => {
  try {
    if (!(await isLatestVersionForChat(chatId, versionId))) {
      skippedReason = "not_latest";
      return { started, repairAvailable, skippedReason };
    }
    const snapshot = params.snapshot;
    if (!snapshot || snapshot.files.length === 0) {
      skippedReason = "no_files";
      return { started, repairAvailable, skippedReason };
    }
    if (!force && snapshot.filesRevision) {
      await readServerRepairBudget({ chatId, versionId, runId, filesRevision: snapshot.filesRevision });
    }
    started = true;
    const codeFiles = snapshot.files;
    const baseFilesJson = snapshot.filesJson;
    baseFilesJsonForRecovery = baseFilesJson;
    const previewPolicy =
      snapshot.lifecycleStage === "integrations" ? "fidelity3" : "fidelity2";
    const actualFilesRevision = snapshot.filesRevision;
    const filesRevision = resolveSnapshotFilesRevision({
      filesRevision: snapshot.filesRevision,
      filesJson: baseFilesJson,
    });
    const parentVersionId = snapshot.parentVersionId ?? null;
    let f3Readiness: {
      parentVersionId: string | null;
      orchestrationSnapshot: unknown;
      projectId: string | null;
    } | null = null;
    if (previewPolicy === "fidelity3") {
      const loaded = await loadServerVerifyF3ReadinessContext(chatId);
      if ("error" in loaded) {
        await persistF3ReadinessHold({
          chatId,
          versionId,
          filesRevision,
          result: { ready: false, ok: false, reason: "readiness_unavailable", retryable: true },
          at: "before_first_gate",
        });
        skippedReason = "f3_readiness_hold";
        verification = { kind: "stop", reason: "readiness_unavailable", retryable: true };
        started = false;
        return { started, repairAvailable, skippedReason };
      }
      const readiness = await evaluateServerOwnedF3Readiness({
        chatId,
        versionId,
        parentVersionId,
        filesRevision,
        preloadedFiles: codeFiles,
        orchestrationSnapshot: loaded.orchestrationSnapshot,
        projectId: loaded.projectId,
      });
      if (!readiness.ready) {
        verification = { kind: "stop", reason: readiness.reason, retryable: readiness.retryable === true };
        if (readiness.reason === "integration_migration_required") {
          const holdResult = await holdVersionForIntegrationMigration(
            versionId,
            {
              verificationState: snapshot.verificationState,
              filesRevision: actualFilesRevision,
              filesJson: baseFilesJson,
              editKind: snapshot.editKind,
              orchestrationSnapshot: loaded.orchestrationSnapshot,
            },
            runId,
          );
          if (holdResult === "applied") {
            await persistF3ReadinessHold({
              chatId,
              versionId,
              filesRevision,
              result: readiness,
              at: "before_first_gate",
            });
          } else if (holdResult === "cas_miss") {
            const current = await getVersionById(versionId).catch(() => null);
            reverifyCurrent = Boolean(
              current &&
                !isCurrentIntegrationMigrationHold(current) &&
                isNonTerminalVerificationState(current.verification_state),
            );
            reverifyFromContextCasMiss = reverifyCurrent;
            if (reverifyCurrent) throw REVERIFY_CURRENT_CONTEXT;
          }
        } else {
          await persistF3ReadinessHold({
            chatId,
            versionId,
            filesRevision,
            result: readiness,
            at: "before_first_gate",
          });
        }
        skippedReason = "f3_readiness_hold";
        started = false;
        return { started, repairAvailable, skippedReason };
      }
      f3Readiness = {
        parentVersionId,
        orchestrationSnapshot: loaded.orchestrationSnapshot,
        projectId: loaded.projectId,
      };
    }
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
      baseFilesRevision: actualFilesRevision,
      baseEditKind: snapshot.editKind,
      previewPolicy,
      f3Readiness,
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
      repairProvenance,
      repairAuthority: force ? "manual" : "automatic",
      contextRetryUsed: params.contextRetryUsed,
    });
    if (repairOutcome.stop) {
      verification = { kind: "stop", ...repairOutcome.stop };
      return { started, repairAvailable, skippedReason };
    }
    reverifyCurrent = repairOutcome.reverifyCurrent;
    reverifyFromContextCasMiss = repairOutcome.contextCasMiss === true;
    if (repairOutcome.integrationMigrationStop && !repairOutcome.reverifyCurrent) {
      verification = { kind: "stop", reason: "integration_migration_required",
        retryable: repairOutcome.integrationMigrationStop !== "applied" };
      skippedReason = "f3_readiness_hold";
      started = false;
    }
  } catch (err) {
    if (err === REVERIFY_CURRENT_CONTEXT) {
      // Report context supersession to the caller; no fresh lease is acquired here.
    } else {
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
        reverifyCurrent = true;
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
    }
  }
  return { started, repairAvailable, skippedReason };
  };
  const result = await execute();
  if (reverifyCurrent) verification = { kind: "superseded",
    cause: reverifyFromContextCasMiss ? "context" : "files", forceBuildCheck: true,
    contextRetryUsed: params.contextRetryUsed === true || reverifyFromContextCasMiss };
  else if (result.skippedReason === "not_latest") verification = {
    kind: "superseded", cause: "newer_version", forceBuildCheck: true, contextRetryUsed: false };
  else if (result.skippedReason && result.skippedReason !== "f3_readiness_hold") verification = { kind: "stop", reason: result.skippedReason,
    retryable: false };
  return { ...result, verification };
}
