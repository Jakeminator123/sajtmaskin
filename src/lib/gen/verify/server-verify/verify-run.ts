import { dbConfigured } from "@/lib/db/client";
import { recordPreviewRuntimeOutcomeForVersion } from "@/lib/db/services/generation-telemetry";
import { warnLog } from "@/lib/utils/debug";
import { QualityGateNotConfiguredError, QualityGateUnavailableError, isQualityGateConfigured } from "../preview-quality-gate";
import {
  markVersionVerifying,
  failVersionVerification,
  markVersionSupersededByRepair,
  resetVersionVerificationToPending,
  updateVersionFiles,
  getServerPostcheckTarget,
  renewVersionLease,
} from "@/lib/db/chat-repository-pg";
import { completeServerPostchecks, readServerRepairBudget, readServerResumeControl, recordServerResumeHold,
  reserveServerResumeAttempt, settleServerResumeAttempt, type ServerResumeHold, type ServerRepairBudgetSnapshot } from "@/lib/db/services/server-repair-budget";
import { settleExistingGenerationBillingIfPresent } from "@/lib/db/services/generation-billing";
import { flushPendingUsageWrites, runWithLlmUsageContext } from "@/lib/observability/llm-usage";
import { prepareVersionImages } from "../version-image-validation";
import { ensureVersionPreview, persistVersionPreviewOutcome, type VersionPreviewReceipt } from "@/lib/gen/preview/ensure-version-preview";
import type { PreviewSessionError } from "@/lib/gen/preview/preview-session";
import { runHeldVersionProductPostcheck, runVersionProductPostcheck } from "../version-product-postcheck";
import { readProductPostcheckPreviewProbe, waitForProductPostcheckPreviewRunning, PRODUCT_POSTCHECK_PREVIEW_WAIT_MS,
  type ProductPostcheckPreviewProbe } from "../product-postcheck-preview-wait";
import { classifyReadinessFailure, isUnverifiedReadinessFailure } from "@/lib/gen/preview/readiness-failure";
import { getActivePreviewSessionAsync } from "@/lib/gen/preview/session-store";
import { isTier2PreviewConfigured } from "@/lib/gen/preview/tier2-config";
import { verdictFromProductPostcheckResult } from "../product-postcheck-verdict";
import { lookupProductPostcheckRun, normalizeProductPostcheckMutationRevision } from "@/lib/db/services/product-postcheck-runs";
import { repairBuildErrorUnderLease } from "./build-error-trigger";
import { holdVersionForIntegrationMigration } from "@/lib/db/chat-repository/version-lifecycle";
import { parseCodeProject, serializeCodeProject } from "@/lib/gen/parser";
import type { BuildSpecPreviewPolicy } from "@/lib/gen/build-spec";
import {
  fullProjectProtectedDroppedPaths,
  missingProtectedPathsPersistBlock,
  partitionGeneratedFilesForProtectedPaths,
  reinjectProtectedPathsFromFallback,
} from "@/lib/gen/scaffolds/protected-paths";
import { runDeterministicRepairPrepass } from "../repair-loop";
import { getVersionFilesSnapshot } from "@/lib/gen/version-manager";
import {
  isCurrentIntegrationMigrationHold,
  isNonTerminalVerificationState,
} from "../stale-verification";
import {
  buildExportableProject,
  chatUsesVerbatimRepo,
} from "@/lib/gen/export/build-exportable-project";
import { createEngineVersionErrorLogs, reopenFailedProductPostcheckRun } from "@/lib/db/services/version-errors";
import { emit as emitBusEvent } from "@/lib/logging/event-bus";
// Side-effect imports: wire default subscribers (devLog-mirror + DB
// sink) so every `version.verifier.done`/`version.build.error` emit
// below reaches both the legacy surfaces and the UI projection.
import "@/lib/logging/event-bus-subscribers";
import "@/lib/logging/event-bus-error-log-sink";
import type { RepairLedger } from "@/lib/gen/autofix/llm-repair-gate";
import { REPAIR_LOOP_BUDGET_MS } from "@/lib/gen/defaults";
import {
  buildServerVerifyQualityGateMeta,
  collectLintAdvisories,
  compactVisualQAForQualityGateLog,
} from "../server-verify-log-meta";
import { resolveBackgroundRepairDeadlineEpochMs } from "../server-repair-policy";
import {
  acquireVerifyLease,
  inflight,
  isLatestVersionForChat,
  isServerVerifyEligible,
  releaseVerifyLease,
} from "./lease";
import { logQualityGateFailuresBestEffort, partitionServerVerifyFailures } from "./failures";
import { tryServerRepairLoop } from "./repair-execution";
import {
  evaluateServerOwnedF3Readiness,
  loadServerVerifyF3ReadinessContext,
  persistF3ReadinessHold,
  resolveSnapshotFilesRevision,
  type ServerVerifyF3ReadinessContext,
} from "./f3-readiness";
import {
  checkVerificationDeadline,
  evaluateVersionGateSnapshot,
  promoteVersionWithRetry,
  VerificationDeadlineExceeded,
  type VersionFilesSnapshot,
} from "./gate-steps";
import { qualityGateHttpResponse } from "./quality-gate-http";
import { verificationOutcomeFromQualityGate } from "./quality-gate-outcome";
import { runVersionQualityGateUnderLease } from "./quality-gate-run";

const REVERIFY_CURRENT_CONTEXT = Symbol("reverify-current-context");

/**
 * Host verdict for a boot that started and then failed, when it names a real
 * build failure. An empty-body verdict only means a JS-less probe saw no text,
 * and a failure without a message gives the repair loop nothing to act on.
 */
function repairableReadinessError(probe: ProductPostcheckPreviewProbe | null | undefined): string | null {
  if (probe?.readinessState !== "failed") return null;
  const message = probe.readinessError?.trim();
  if (!message || isUnverifiedReadinessFailure(classifyReadinessFailure(message))) return null;
  return message;
}

function snapshotIsTerminalOrMigrationHeld(snapshot: VersionFilesSnapshot): boolean {
  return (
    isCurrentIntegrationMigrationHold({
      release_state: snapshot.releaseState,
      verification_state: snapshot.verificationState,
      verification_summary: snapshot.verificationSummary,
      files_revision: snapshot.filesRevision,
    }) || !isNonTerminalVerificationState(snapshot.verificationState)
  );
}

async function settleExhaustedContextRetry(params: {
  versionId: string;
  runId: string;
  snapshot: VersionFilesSnapshot;
  preserveRepairPayload: boolean;
}): Promise<void> {
  const { versionId, runId, snapshot, preserveRepairPayload } = params;
  if (snapshot.verificationState !== "verifying" && snapshot.verificationState !== "repairing") {
    return;
  }
  await resetVersionVerificationToPending(
    versionId,
    "Provider decision context changed during verification; retry the current version.",
    runId,
    {
      expected: {
        filesJson: snapshot.filesJson,
        filesRevision: snapshot.filesRevision,
        editKind: snapshot.editKind,
        verificationState: snapshot.verificationState,
        releaseState: "draft",
        verificationSummary: snapshot.verificationSummary,
      },
      preserveRepairPayload,
    },
  );
}

/**
 * Fire-and-forget server-side verification + capped repair loop.
 * Called from generation stream after finalize. Does NOT block the SSE response.
 *
 * `diagnosticOnly` (default false) skips auto-promotion and LLM repair.
 * When the gate has repairable code failures, the mechanical deterministic
 * prepass still runs and may persist `files_json` improvements (SM-024);
 * terminal state remains failed because verifier blockers forbid promotion.
 */
export type ServerVerificationInput = {
  chatId: string;
  versionId: string;
  diagnosticOnly?: boolean;
  /**
   * Force `build` into the initial verify gate (#260 Codex P2). Set by the
   * post-supersede re-verify when the abandoned repair was build-originated, so
   * the current files (B) are not false-greened by the typecheck-only lane while
   * a Next build failure still lingers. Defaults to off for the normal F2 path.
   */
  forceBuildCheck?: boolean;
  /** Original absolute chain deadline; re-entry must not mint a new window. */
  verifyDeadlineEpochMs?: number;
  /**
   * Fas 3 (RepairGate): finalize's `RepairLedger`, handed over so a repair in
   * THIS lane dedupes against content+diagnostics already LLM-repaired during
   * finalize (same process — server-verify is fired from post-finalize).
   * Automatic restarts hydrate durable history; absence never mints a fresh budget.
   */
  repairLedger?: RepairLedger;
  /** Fas 3: finalize's `repairScopeId` — must accompany `repairLedger` so ledger keys collide across lanes. */
  repairScopeId?: string;
  repairAuthority?: "automatic" | "manual";
  onRepairAvailable?: (payload: {
    versionId: string;
    summary: string | null;
    repairAvailableAt: string | null;
  }) => void;
  /** Internal bound: at most one fresh re-entry after a decision-context CAS miss. */
  contextRetryUsed?: boolean;
};

export type VersionVerificationOutcome =
  | { kind: "continue"; filesRevision: string; vmGatePassed: boolean; promoted: boolean; advisory: boolean }
  | { kind: "stop"; reason: string; retryable: boolean; vmGatePassed?: boolean; promoted?: false }
  | { kind: "superseded"; cause: "files" | "context" | "newer_version"; forceBuildCheck: boolean; contextRetryUsed: boolean };

export type HeldVersionVerificationInput = ServerVerificationInput & {
  holderRunId: string;
  snapshot: VersionFilesSnapshot;
};

export async function triggerServerVerification(params: ServerVerificationInput): Promise<VersionVerificationOutcome | void> {
  if (!isServerVerifyEligible(params.versionId)) return { kind: "stop", reason: "not_eligible", retryable: false };
  inflight.add(params.versionId);
  const lease = await acquireVerifyLease(params.versionId, "server_verify");
  if (!lease.proceed) {
    inflight.delete(params.versionId);
    return { kind: "stop", reason: lease.reason, retryable: true };
  }
  try {
    const snapshot = await getVersionFilesSnapshot(params.versionId);
    if (!snapshot?.files.length) return { kind: "stop", reason: "no_files", retryable: false };
    return await verifyVersionUnderLease({ ...params, holderRunId: lease.runId, snapshot });
  } finally {
    await releaseVerifyLease(params.versionId, lease.runId);
    inflight.delete(params.versionId);
  }
}

/** Same post-lease raw snapshot throughout. No lease ownership or re-entry here. */
export type VersionPostchecksInput = {
  chatId: string; versionId: string; entry: "initial" | "resume"; deadlineEpochMs: number;
  /** Notifications carry no policy, ownership or billing authority. */
  notifications?: {
    policy?: (policy: ServerRepairBudgetSnapshot["startPolicy"]) => void;
    previewReady?: (receipt: VersionPreviewReceipt) => void;
    buildError?: (error: PreviewSessionError) => void;
    repairAvailable?: ServerVerificationInput["onRepairAvailable"];
  };
};

/** One server chain for generation and cron. Never accepts a caller's files/policy/owner snapshot. */
export async function runVersionPostchecks(input: VersionPostchecksInput): Promise<VersionVerificationOutcome> {
  const stop = (reason: string, retryable = true): VersionVerificationOutcome => ({ kind: "stop", reason, retryable });
  const expired = () => !Number.isFinite(input.deadlineEpochMs) || Date.now() >= input.deadlineEpochMs;
  if (!dbConfigured || expired()) return stop("postchecks_deadline");
  if (!isTier2PreviewConfigured()) return stop("preview_unconfigured");
  if (inflight.has(input.versionId)) return stop("lease_busy");
  inflight.add(input.versionId);
  const lease = await acquireVerifyLease(input.versionId, "server_verify");
  if (!lease.proceed) { inflight.delete(input.versionId); return stop(lease.reason); }
  const runId = lease.runId;
  let attemptId: number | undefined;
  let failedProductClaim: Parameters<typeof reopenFailedProductPostcheckRun>[0] | null = null;
  let revision: string | null = null;
  const budgetTarget = () => ({ chatId: input.chatId, versionId: input.versionId, runId, filesRevision: revision! });
  const notify = <T>(callback: ((value: T) => void) | undefined, value: T) => {
    try { callback?.(value); } catch (error) { warnLog("engine", "Postcheck notification failed", { error: String(error) }); }
  };
  const hold = async (reason: ServerResumeHold) => {
    if (input.entry === "resume" && revision) {
      const recorded = attemptId === undefined ? await recordServerResumeHold(budgetTarget(), reason)
        : await settleServerResumeAttempt(budgetTarget(), attemptId, reason);
      if (!["resume_held", "resume_settled"].includes(recorded.status)) return stop("resume_receipt_unavailable");
      attemptId = undefined;
    }
    return stop(reason);
  };
  try {
    const target = await getServerPostcheckTarget(input.chatId, input.versionId);
    if (expired()) return stop("postchecks_deadline");
    if (!target) return stop("stored_owner_unavailable", false);
    if (!target.latest) return stop("newer_version", false);
    if (!target.imported && !target.hasBilling) return stop("billing_marker_missing", false);
    if (target.version.edit_kind !== null && target.version.edit_kind !== "imported_repo") return stop("edit_provenance", false);
    let snapshot = await getVersionFilesSnapshot(input.versionId);
    if (!snapshot?.filesRevision || !snapshot.files.length || snapshotIsTerminalOrMigrationHeld(snapshot)) return stop("snapshot_ineligible", false);
    if (target.version.repaired_files_json) return stop("repair_requires_decision", false);
    if (input.entry === "resume" && snapshot.lifecycleStage === "design" &&
        (snapshot.verificationState === "verifying" || snapshot.verificationState === "repairing")) {
      if (expired()) return stop("postchecks_deadline");
      // Takeover changes verification status only, never paid/history/age counters or repair payload.
      await resetVersionVerificationToPending(input.versionId, "Interrupted server postchecks; resume under the current holder.", runId, {
        expected: { filesJson: snapshot.filesJson, filesRevision: snapshot.filesRevision, editKind: snapshot.editKind,
          verificationState: snapshot.verificationState, releaseState: "draft", verificationSummary: snapshot.verificationSummary },
        preserveRepairPayload: true,
      });
      const refreshed = await getVersionFilesSnapshot(input.versionId);
      if (expired() || refreshed?.verificationState !== "pending" || refreshed.filesRevision !== snapshot.filesRevision ||
          refreshed.filesJson !== snapshot.filesJson || refreshed.editKind !== snapshot.editKind) return stop("takeover_reset_unconfirmed");
      snapshot = refreshed;
    }
    revision = snapshot.filesRevision;
    const paid = await readServerRepairBudget(budgetTarget());
    if (expired()) return stop("postchecks_deadline");
    if (!target.imported && paid.status !== "ready") return stop("history_unknown", true);
    // Import has a separate, non-paid, non-mutating F2 control contract.
    if (target.imported && snapshot.lifecycleStage !== "design") return stop("import_stage", false);
    const policy = target.imported ? {
      previewPolicy: "fidelity2" as const, verificationPolicy: "strict" as const,
      preview: { canStartPreview: true, hasBuildBreakingFindings: false },
      postChecks: { materializeImages: false, willRunQualityGate: true, qualityGatePlanned: true },
      serverVerify: { run: false, reason: "import_postchecks_resume", diagnosticOnly: false },
    } : paid.status === "ready" ? paid.snapshot.startPolicy : null;
    if (!policy) return stop("history_unknown", true);
    const savedPreviewBlocks = !policy.preview.canStartPreview || policy.preview.hasBuildBreakingFindings;
    if (savedPreviewBlocks && (target.imported || (paid.status === "ready" && paid.snapshot.filesRevision === revision))) {
      return stop("preview_blocked", false);
    }
    const canRepairPreviewBuild = !target.imported && policy.serverVerify.diagnosticOnly !== true && isQualityGateConfigured();
    const current = async (): Promise<boolean> => {
      if (expired() || !(await renewVersionLease(input.versionId, runId)) || expired()) return false;
      const fresh = await getServerPostcheckTarget(input.chatId, input.versionId);
      return !expired() && !!fresh?.latest && fresh.imported === target.imported &&
        fresh.userId === target.userId && fresh.sessionId === target.sessionId && (target.imported || fresh.hasBilling) &&
        fresh.chat.project_id === target.chat.project_id && fresh.version.files_revision === revision &&
        fresh.version.edit_kind === target.version.edit_kind && !isCurrentIntegrationMigrationHold(fresh.version);
    };
    if (!(await current())) return stop("lease_or_context_lost");
    return await runWithLlmUsageContext({ chatId: input.chatId, versionId: input.versionId, runId,
      userId: target.userId, sessionId: target.sessionId }, async () => {
      try {
        if (input.entry === "resume") {
          const control = await readServerResumeControl(budgetTarget());
          if (control.status !== "resume_control" || control.snapshot.disposition !== "eligible") return stop(`resume_${control.status}`, false);
          // Pure runtime/claim replay precedes reservation: no paid work or attempt on a wait tick.
          const probe = await readProductPostcheckPreviewProbe({ chatId: input.chatId,
            expectedVersionId: input.versionId, deadlineEpochMs: input.deadlineEpochMs });
          if (!(await current())) return stop("lease_or_context_lost");
          // A dead boot with a real build error goes on to a reserved attempt, where
          // the restarted preview reaches the repair loop instead of holding forever.
          if (probe.versionId === input.versionId && probe.filesRevision === revision && !probe.running && probe.readinessState &&
              !(canRepairPreviewBuild && repairableReadinessError(probe))) {
            return await hold(probe.readinessState === "starting" ? "starting" : "runtime_hold");
          }
          if (probe.versionId === input.versionId && probe.filesRevision === revision && probe.previewSessionId) {
            const lookup = await lookupProductPostcheckRun({ chatId: input.chatId, key: {
              versionId: input.versionId, filesRevision: revision!, previewSession: probe.previewSessionId,
              lifecycleToken: probe.lifecycleToken, mutationRevision: normalizeProductPostcheckMutationRevision(probe.mutationRevision),
            } });
            if (!(await current())) return stop("lease_or_context_lost");
            if (lookup.kind === "busy") return await hold("claim_busy");
            if (lookup.kind === "unavailable") return stop("claim_unavailable");
            if (lookup.kind === "settled") {
              const replay = await runVersionProductPostcheck({ chatId: input.chatId, versionId: input.versionId,
                userId: target.userId, filesRevision: revision!, deadlineAt: input.deadlineEpochMs });
              if (!(await current())) return stop("lease_or_context_lost");
              if (replay.kind !== "result") return stop("product_replay_pending");
              if (verdictFromProductPostcheckResult(replay.result) === "pending") {
                if (lookup.status !== "failed") return stop("product_replay_pending");
                failedProductClaim = { held: { chatId: input.chatId, versionId: input.versionId, filesRevision: revision!, holderRunId: runId },
                  key: { versionId: input.versionId, filesRevision: revision!, previewSession: probe.previewSessionId,
                    lifecycleToken: probe.lifecycleToken, mutationRevision: normalizeProductPostcheckMutationRevision(probe.mutationRevision) },
                  claim: { runId: lookup.runId, claimGeneration: lookup.claimGeneration }, deadlineAt: input.deadlineEpochMs };
              }
            }
          }
          const reserved = await reserveServerResumeAttempt(budgetTarget());
          if (reserved.status !== "resume_reserved" || reserved.attemptId === undefined) return stop(`resume_${reserved.status}`, false);
          attemptId = reserved.attemptId;
        }
        let forceBuildCheck = false;
        let contextRetryUsed = false;
        let outcome: VersionVerificationOutcome = stop("postchecks_stopped");
        for (let restart = 0; restart < 2; restart++) {
          if (!(await current())) { outcome = stop("lease_or_context_lost"); break; }
          if (failedProductClaim) {
            const reopened = await reopenFailedProductPostcheckRun(failedProductClaim).catch(() => false);
            failedProductClaim = null;
            if (!reopened) { outcome = stop("product_retry_unconfirmed"); break; }
          }
          if (restart === 0) notify(input.notifications?.policy, policy);
          if (!target.imported) {
            const prepared = await prepareVersionImages({ chatId: input.chatId, versionId: input.versionId,
              holderRunId: runId, expectedFilesRevision: revision!, materialize: policy.postChecks.materializeImages === true,
              deadlineEpochMs: input.deadlineEpochMs });
            if (!prepared.persisted || !prepared.filesRevision || prepared.kind === "stopped") { outcome = stop("image_preparation_stopped"); break; }
            revision = prepared.filesRevision;
          }
          snapshot = await getVersionFilesSnapshot(input.versionId);
          if (snapshot?.filesRevision !== revision || !snapshot.files.length || !(await current())) { outcome = stop("revision_readback_failed"); break; }
          const version = { ...target.version, files_json: snapshot.filesJson, files_revision: revision };
          const preview = await ensureVersionPreview({ chat: target.chat, version, policy,
            forceRestart: false, holderRunId: runId, expectedFilesRevision: revision!, previewDeadlineEpochMs: input.deadlineEpochMs });
          if (!(await current())) { outcome = stop("lease_or_context_lost"); break; }
          if (!preview.ok) {
            if (preview.reason === "start_failed") {
              notify(input.notifications?.buildError, preview.error);
              await recordPreviewRuntimeOutcomeForVersion(input.versionId, false, { bootedFilesRevision: revision! });
              if (!(await current())) { outcome = stop("lease_or_context_lost"); break; }
              if (!target.imported && policy.serverVerify.diagnosticOnly !== true && isQualityGateConfigured()) {
                const repaired = await repairBuildErrorUnderLease({ chatId: input.chatId, versionId: input.versionId,
                  holderRunId: runId, snapshot, buildError: preview.error, repairDeadlineEpochMs: input.deadlineEpochMs,
                  onRepairAvailable: payload => notify(input.notifications?.repairAvailable, payload) });
                outcome = repaired.verification;
              } else outcome = stop("preview_start_failed");
            } else outcome = stop(preview.reason, preview.reason === "version_changed");
          } else if (!(await persistVersionPreviewOutcome({ receipt: preview.result, holderRunId: runId, expectedFilesRevision: revision! })) || !(await current())) {
            outcome = stop("preview_persist_failed");
          } else {
            notify(input.notifications?.previewReady, preview.result);
            const session = await getActivePreviewSessionAsync(input.chatId);
            if (!(await current())) { outcome = stop("lease_or_context_lost"); break; }
            if (session?.versionId !== input.versionId || session.filesRevision !== revision ||
                session.previewSessionId !== preview.result.previewSessionId || session.lifecycleToken !== preview.result.lifecycleToken) {
              outcome = { kind: "superseded", cause: "context", forceBuildCheck, contextRetryUsed: true };
            } else {
            const expectedPreview = { previewSessionId: preview.result.previewSessionId, lifecycleToken: preview.result.lifecycleToken,
              filesRevision: revision!, mutationRevision: normalizeProductPostcheckMutationRevision(session.mutationRevision) };
            // Await the existing pure readiness owner under this holder, not a second after-poller.
            // Unlike applyPreviewReadinessOutcome this cannot reconcile/mutate an imported lockfile.
            const ready = await waitForProductPostcheckPreviewRunning({ expectedVersionId: input.versionId,
              expectedFilesRevision: revision!, expectedPreviewSessionId: expectedPreview.previewSessionId,
              expectedLifecycleToken: expectedPreview.lifecycleToken, expectedMutationRevision: expectedPreview.mutationRevision,
              timeoutMs: Math.max(0, Math.min(PRODUCT_POSTCHECK_PREVIEW_WAIT_MS, input.deadlineEpochMs - Date.now())),
              probe: async () => {
                if (!(await current())) throw new Error("postchecks fence lost");
                const probe = await readProductPostcheckPreviewProbe({ chatId: input.chatId, expectedVersionId: input.versionId, deadlineEpochMs: input.deadlineEpochMs });
                if (!(await current())) throw new Error("postchecks fence lost");
                return probe;
              },
            });
            if (!(await current())) { outcome = stop("lease_or_context_lost"); break; }
            if (!ready.ok && ready.reason === "preview_superseded") {
              outcome = { kind: "superseded", cause: "context", forceBuildCheck, contextRetryUsed: true };
            } else if (!ready.ok || ready.probe.readinessState !== "ready" || ready.probe.httpReady === false) {
              const observed = ready.ok ? ready.probe : ready.lastProbe;
              if (observed?.readinessState === "starting") return await hold("starting");
              const lateBuildError = repairableReadinessError(observed);
              if (lateBuildError && canRepairPreviewBuild) {
                // Same repair as an immediate start failure: the boot was accepted, then compilation failed.
                const buildError = { stage: "preview-start" as const, message: lateBuildError };
                notify(input.notifications?.buildError, buildError);
                await recordPreviewRuntimeOutcomeForVersion(input.versionId, false, { bootedFilesRevision: revision! });
                if (!(await current())) { outcome = stop("lease_or_context_lost"); break; }
                const repaired = await repairBuildErrorUnderLease({ chatId: input.chatId, versionId: input.versionId,
                  holderRunId: runId, snapshot, buildError, repairDeadlineEpochMs: input.deadlineEpochMs,
                  onRepairAvailable: payload => notify(input.notifications?.repairAvailable, payload) });
                outcome = repaired.verification;
              } else if (observed?.readinessState === "failed" || (observed?.readinessState === "ready" && observed.httpReady === false)) {
                return await hold("runtime_hold");
              } else {
                // An unavailable/legacy-unknown probe is not a confirmed refundable hold.
                outcome = stop("runtime_unconfirmed"); break;
              }
            } else {
            if (!preview.result.runtimeReady) {
              await recordPreviewRuntimeOutcomeForVersion(input.versionId, true, { bootedFilesRevision: revision! });
              if (!(await current())) { outcome = stop("lease_or_context_lost"); break; }
              notify(input.notifications?.previewReady, { ...preview.result, runtimeReady: true });
            }
            const product = await runHeldVersionProductPostcheck({ chatId: input.chatId, versionId: input.versionId,
              userId: target.userId, previewUrl: preview.result.previewUrl, filesRevision: revision!, deadlineAt: input.deadlineEpochMs,
              held: { chatId: input.chatId, versionId: input.versionId, filesRevision: revision!, holderRunId: runId },
              liveReviewPolicy: target.imported ? "disabled" : "default", expectedPreview });
            if (!(await current())) { outcome = stop("lease_or_context_lost"); break; }
            if (product.kind !== "result") { outcome = stop(product.kind === "unavailable" ? product.code : "product_not_found"); break; }
            if (product.result.skippedReason === "preview_superseded") {
              outcome = { kind: "superseded", cause: "files", forceBuildCheck, contextRetryUsed };
            } else if (["preview_not_ready", "preview_not_running", "claim_busy"].includes(product.result.skippedReason ?? "")) {
              return await hold(product.result.skippedReason === "claim_busy" ? "claim_busy" : "runtime_hold");
            } else if (!["passed", "blocked", "allowed_skip"].includes(verdictFromProductPostcheckResult(product.result))) {
              outcome = stop("product_result_unattested"); break;
            } else if (policy.serverVerify.run) {
              outcome = await verifyVersionUnderLease({ chatId: input.chatId, versionId: input.versionId,
                holderRunId: runId, snapshot, diagnosticOnly: policy.serverVerify.diagnosticOnly === true,
                forceBuildCheck, contextRetryUsed, verifyDeadlineEpochMs: input.deadlineEpochMs,
                onRepairAvailable: payload => notify(input.notifications?.repairAvailable, payload) });
            } else if (policy.serverVerify.diagnosticOnly === true) {
              outcome = stop("diagnostic_only_policy", false);
            } else if (policy.postChecks.willRunQualityGate || policy.postChecks.qualityGatePlanned) {
              const gate = await runVersionQualityGateUnderLease({ chatId: input.chatId, versionId: input.versionId,
                holderRunId: runId, snapshot, verifyDeadlineEpochMs: input.deadlineEpochMs });
              // The HTTP projection rides along unread: `GET /api/engine/postchecks`
              // serializes this object into `results[].outcome` and that shape is
              // kept as is until its removal is decided (postchecks.test.ts).
              outcome = { ...qualityGateHttpResponse(gate), ...verificationOutcomeFromQualityGate(gate) };
            } else outcome = { kind: "continue", filesRevision: revision!, vmGatePassed: false, promoted: false, advisory: false };
            }
            }
          }
          if (outcome.kind !== "superseded" || outcome.cause === "newer_version" || restart === 1 || expired()) break;
          const refreshed = await getVersionFilesSnapshot(input.versionId);
          if (!refreshed?.filesRevision || snapshotIsTerminalOrMigrationHeld(refreshed)) break;
          snapshot = refreshed; revision = refreshed.filesRevision;
          forceBuildCheck = outcome.forceBuildCheck; contextRetryUsed = outcome.contextRetryUsed;
        }
        if (attemptId !== undefined) {
          const result = await settleServerResumeAttempt(budgetTarget(), attemptId,
            outcome.kind === "superseded" ? "superseded" : outcome.kind === "continue" ? "completed" : outcome.retryable ? "retryable_failure" : "terminal");
          attemptId = undefined;
          if (result.status !== "resume_settled") return stop("resume_receipt_unavailable");
        } else if (input.entry === "initial" && outcome.kind === "continue" && snapshot?.lifecycleStage === "design") {
          const result = await completeServerPostchecks(budgetTarget());
          if (result.status !== "resume_settled") return stop("resume_receipt_unavailable");
        }
        return outcome;
      } finally {
        await flushPendingUsageWrites();
        if (target.hasBilling) await settleExistingGenerationBillingIfPresent({ chatId: input.chatId, versionId: input.versionId, userId: target.userId }).catch(error => {
          warnLog("engine", "Postchecks billing settlement deferred", { error: String(error) });
        });
      }
    });
  } catch (error) {
    warnLog("engine", "Postchecks stopped", { versionId: input.versionId, error: String(error) });
    // Unknown crashes never refund the durable reservation.
    return stop("postchecks_unavailable");
  } finally {
    await releaseVerifyLease(input.versionId, runId);
    inflight.delete(input.versionId);
  }
}


export async function verifyVersionUnderLease(params: HeldVersionVerificationInput): Promise<VersionVerificationOutcome> {
  const {
    chatId,
    versionId,
    onRepairAvailable,
    diagnosticOnly = false,
    forceBuildCheck = false,
    contextRetryUsed = false,
    repairLedger,
    repairScopeId,
  } = params;
  const runId = params.holderRunId;
  if (!runId?.trim() || !params.snapshot.filesRevision?.trim()) return { kind: "stop", reason: "snapshot_unavailable", retryable: true };
  let outcome: VersionVerificationOutcome = { kind: "stop", reason: "verification_stopped", retryable: false };
  // #260 Codex P2 (stale-base re-verify): set when the repair no-op'd because a
  // concurrent user edit advanced files_json past the repaired-from snapshot.
  let reverifyCurrent = false;
  let reverifyFromContextCasMiss = false;
  // #260 Codex P2 (build-origin false-green): carry the abandoned repair's
  // build-origin into the post-supersede re-verify so B's gate keeps `build`.
  let reverifyForceBuildCheck = false;
  // #260 Codex P2 / Bugbot (no fail of B from a stale repair on crash): the
  // exact files_json this run is based on, hoisted so the catch can re-check
  // staleness before failing (staleBaseNoOp lives inside tryServerRepairLoop and
  // is lost when it throws).
  let baseFilesJsonForRecovery: string | null = null;

  const execute = async (): Promise<void> => {
  try {
    checkVerificationDeadline(params.verifyDeadlineEpochMs);
    if (!(await isLatestVersionForChat(chatId, versionId))) {
      const superseded = await markVersionSupersededByRepair(versionId, null, runId).catch(() => null);
      if (!superseded) {
        outcome = { kind: "stop", reason: "supersede_persist_failed", retryable: true };
        return;
      }
      outcome = { kind: "superseded", cause: "newer_version", forceBuildCheck, contextRetryUsed };
      await createEngineVersionErrorLogs([
        {
          chatId,
          versionId,
          level: "warning",
          category: "server-verify:superseded",
          message: "Background verification skipped because a newer version already exists.",
          meta: { serverOwned: true },
        },
      ]).catch(() => null);
      return;
    }
    const snapshot = params.snapshot;
    if (!snapshot || snapshot.files.length === 0) return;
    // Read only the atomic creation receipt. Missing history is never seeded here.
    if (params.repairAuthority !== "manual" && snapshot.filesRevision) {
      await readServerRepairBudget({ chatId, versionId, runId, filesRevision: snapshot.filesRevision });
    }
    const codeFiles = snapshot.files;
    // #260 / P2 #5: carry the exact files_json the repair will be based on so a
    // concurrent user edit can't be silently overwritten by saveRepairedFiles.
    const baseFilesJson = snapshot.filesJson;
    baseFilesJsonForRecovery = baseFilesJson;
    // F2/F3 policy derived from the version lifecycle. Threaded into BOTH the
    // initial verify gate (below) AND the repair loop so an F3/integrations
    // version is always gated on the full integrations lane (typecheck + build
    // + lint) and is never green-lit on the F2/design (typecheck-only) lane
    // (#291 Codex P1 — the first gate can `promoteVersion` before the repair
    // branch is ever reached).
    const previewPolicy: BuildSpecPreviewPolicy =
      snapshot.lifecycleStage === "integrations" ? "fidelity3" : "fidelity2";
    const actualFilesRevision = snapshot.filesRevision;
    const filesRevision = resolveSnapshotFilesRevision({
      filesRevision: snapshot.filesRevision,
      filesJson: baseFilesJson,
    });
    const parentVersionId = snapshot.parentVersionId ?? null;
    let f3ReadinessContext: ServerVerifyF3ReadinessContext | null = null;
    if (previewPolicy === "fidelity3") {
      {
        const loaded = await loadServerVerifyF3ReadinessContext(chatId);
        if ("error" in loaded) {
          outcome = { kind: "stop", reason: loaded.error, retryable: true };
          await persistF3ReadinessHold({
            chatId,
            versionId,
            filesRevision,
            result: { ready: false, ok: false, reason: "readiness_unavailable", retryable: true },
            at: "before_first_gate",
          });
          return;
        }
        f3ReadinessContext = loaded;
        const readiness = await evaluateServerOwnedF3Readiness({
          chatId,
          versionId,
          parentVersionId,
          filesRevision,
          preloadedFiles: codeFiles,
          orchestrationSnapshot: f3ReadinessContext.orchestrationSnapshot,
          projectId: f3ReadinessContext.projectId,
        });
        if (!readiness.ready) {
        outcome = { kind: "stop", reason: readiness.reason, retryable: readiness.retryable === true };
        if (readiness.reason === "integration_migration_required") {
          const migrationHold = await holdVersionForIntegrationMigration(
            versionId,
            {
              verificationState: snapshot.verificationState ?? "pending",
              filesRevision: actualFilesRevision,
              filesJson: baseFilesJson,
              editKind: snapshot.editKind,
              orchestrationSnapshot: f3ReadinessContext.orchestrationSnapshot,
            },
            runId,
          );
          if (migrationHold === "cas_miss" && contextRetryUsed) {
            await settleExhaustedContextRetry({
              versionId,
              runId,
              snapshot,
              preserveRepairPayload: snapshot.verificationState === "repairing",
            });
            return;
          }
          if (migrationHold === "cas_miss") {
            reverifyCurrent = true;
            reverifyFromContextCasMiss = true;
            return;
          }
          if (migrationHold === "applied") {
            await persistF3ReadinessHold({
              chatId,
              versionId,
              filesRevision,
              result: readiness,
              at: "before_first_gate",
            });
          }
          return;
        }
        await persistF3ReadinessHold({
          chatId,
          versionId,
          filesRevision,
          result: readiness,
          at: "before_first_gate",
        });
        return;
        }
      }
    }

    await markVersionVerifying(versionId, undefined, runId).catch(() => null);

    // Imported repos (v0-templates / ZIP imports) verify verbatim so the gate
    // tests the SAME project the preview VM runs — never a scaffold-merged
    // variant with force-pinned baseline dependency versions.
    const evaluation = await evaluateVersionGateSnapshot({ chatId, versionId, snapshot, forceBuildCheck,
      verifyDeadlineEpochMs: params.verifyDeadlineEpochMs });
    if (!evaluation) {
      outcome = { kind: "stop", reason: "quality_gate_disabled", retryable: false };
      await resetVersionVerificationToPending(versionId, undefined, runId).catch(() => null);
      return;
    }
    const { gateResult, passed, visualQA, advisory: f2TypecheckAdvisory } = evaluation;
    const lintAdvisories = collectLintAdvisories(gateResult.results);
    const advisoryPromote = f2TypecheckAdvisory && !diagnosticOnly;

    // For the advisory case, ATTEMPT the promotion before emitting the outcome
    // so the bus signal reflects reality. `promoteVersion` is lease-conditioned:
    // a no-op (null) means a takeover/lease-loss or a guard/DB refusal.
    const persistPromotionMigrationHold = async () => {
      outcome = { kind: "stop", reason: "integration_migration_required", retryable: false };
      await persistF3ReadinessHold({
        chatId,
        versionId,
        filesRevision,
        result: {
          ready: false,
          ok: false,
          reason: "integration_migration_required",
          retryable: false,
        },
        at: "before_promotion",
      });
    };
    const advisoryPromotion = advisoryPromote
      ? await promoteVersionWithRetry(
          versionId,
          "Designläge: previewen renderar. Typecheck-varningar kvarstår (advisory, ej blockerande).",
          runId,
          params.verifyDeadlineEpochMs,
        )
      : null;
    if (advisoryPromotion === "integration_migration_required") {
      await persistPromotionMigrationHold();
      return;
    }
    const advisoryPromoted = advisoryPromotion !== null;

    // Advisory promote that did NOT take (lease takeover / guard / transient DB
    // write). Emit NO terminal bus event: a terminal bus `failed` is sticky in
    // `reconcileTerminalDbState` (a later DB `passed` from the client
    // quality-gate route or a takeover run cannot upgrade a bus already
    // `failed`), so a `failed` here would pin a false-red even after the version
    // is promoted elsewhere. Leaving the bus spinning lets the authoritative DB
    // `passed` upgrade it to `done`, and the stale-verification watchdog is the
    // backstop if nothing promotes. Failing the row here would also clobber the
    // owning run on a lease takeover.
    if (advisoryPromote && !advisoryPromoted) {
      outcome = { kind: "stop", reason: "promotion_deferred", retryable: true, vmGatePassed: passed, promoted: false };
      await createEngineVersionErrorLogs([
        {
          chatId,
          versionId,
          level: "info",
          category: "quality-gate:typecheck-advisory",
          message:
            "Designläge: advisory-promotering utfördes inte (lease/guard/DB) — lämnar terminalstatus till DB/route/watchdog.",
          meta: { serverOwned: true, advisory: true, advisoryPromoted: false },
        },
      ]).catch(() => null);
      return;
    }

    // L1: F3 before_promotion must run BEFORE the passed bus + green
    // `preflight:quality-gate` log. Otherwise UI (`reconcileTerminalDbState`)
    // treats bus `done` as klar, and the stale watchdog
    // (`isLatestGateVerdictGreen` → `promoteVersionIfUnleased`) can promote
    // without this grind.
    if (
      passed &&
      !advisoryPromoted &&
      !diagnosticOnly &&
      previewPolicy === "fidelity3" &&
      f3ReadinessContext
    ) {
      const readiness = await evaluateServerOwnedF3Readiness({
        chatId,
        versionId,
        parentVersionId,
        filesRevision,
        preloadedFiles: codeFiles,
        orchestrationSnapshot: f3ReadinessContext.orchestrationSnapshot,
        projectId: f3ReadinessContext.projectId,
      });
      if (!readiness.ready) {
        outcome = { kind: "stop", reason: readiness.reason, retryable: readiness.retryable === true, vmGatePassed: passed };
        if (readiness.reason === "integration_migration_required") {
          const held = await holdVersionForIntegrationMigration(
            versionId,
            {
              verificationState: "verifying",
              filesRevision: actualFilesRevision,
              filesJson: baseFilesJson,
              editKind: snapshot.editKind,
              orchestrationSnapshot: f3ReadinessContext.orchestrationSnapshot,
            },
            runId,
          );
          if (held === "applied") {
            await persistF3ReadinessHold({
              chatId,
              versionId,
              filesRevision,
              result: readiness,
              at: "before_promotion",
            });
          } else if (held === "cas_miss") {
            const current = await getVersionFilesSnapshot(versionId).catch(() => null);
            if (!current || current.files.length === 0 || snapshotIsTerminalOrMigrationHeld(current)) {
              return;
            }
            if (contextRetryUsed) {
              await settleExhaustedContextRetry({
                versionId,
                runId,
                snapshot: current,
                preserveRepairPayload: current.verificationState === "repairing",
              });
            } else if (isNonTerminalVerificationState(current.verificationState)) {
              reverifyCurrent = true;
              reverifyFromContextCasMiss = true;
              throw REVERIFY_CURRENT_CONTEXT;
            }
          }
        } else {
          await persistF3ReadinessHold({
            chatId,
            versionId,
            filesRevision,
            result: readiness,
            at: "before_promotion",
          });
          await resetVersionVerificationToPending(
            versionId,
            `F3 readiness blocked (${readiness.reason}) at before_promotion.`,
            runId,
          ).catch(() => null);
        }
        return;
      }
    }

    if (passed && diagnosticOnly) {
      outcome = { kind: "stop", reason: "diagnostic_only", retryable: false, vmGatePassed: true, promoted: false };
      // Diagnostics-only mode: even a passing gate must NOT publish a green
      // outcome before promotion, because verifier blockers still disallow
      // promotion regardless of build/typecheck status.
      await createEngineVersionErrorLogs([
        {
          chatId,
          versionId,
          level: "info",
          category: "server-verify:diagnostic",
          message:
            "Server verify gate passed but promotion is suppressed (verifier blockers exist).",
          meta: { serverOwned: true, diagnosticOnly: true },
        },
      ]).catch(() => null);
      await failVersionVerification(
        versionId,
        "Verifier-LLM flagged blocking findings; server-verify gate passed. Manual review or repair required.",
        runId,
      ).catch(() => null);
      return;
    }

    let normalPromoted = false;
    if (passed && !advisoryPromoted) {
      const promotion = await promoteVersionWithRetry(
        versionId,
        lintAdvisories.length > 0
          ? "Automatic server verification passed with lint warnings (advisory)."
          : "Automatic server verification passed.",
        runId,
        params.verifyDeadlineEpochMs,
      );
      if (promotion === "integration_migration_required") {
        await persistPromotionMigrationHold();
        return;
      }
      if (promotion === null) {
        outcome = { kind: "stop", reason: "promotion_deferred", retryable: true, vmGatePassed: passed, promoted: false };
        await createEngineVersionErrorLogs([
          {
            chatId,
            versionId,
            level: "info",
            category: "preflight:quality-gate",
            message:
              "Server verify passed, but promotion was not applied (lease/guard/DB); terminal status remains authoritative in DB/watchdog.",
            meta: { serverOwned: true, promoted: false },
          },
        ]).catch(() => null);
        return;
      }
      normalPromoted = true;
    }

    // Green only after a real promotion took. A passing gate is evidence for
    // promotion, not itself a published terminal success.
    const outcomeIsGreen = advisoryPromoted || normalPromoted;
    if (outcomeIsGreen) outcome = { kind: "continue", filesRevision,
      vmGatePassed: passed, promoted: true, advisory: f2TypecheckAdvisory || lintAdvisories.length > 0 };

    // OMTAG-06: emit `version.verifier.done` as the canonical outcome
    // signal. The DB sink subscriber (see `event-bus-error-log-sink.ts`)
    // still persists the legacy `engine_version_error_logs` row via the
    // same payload, so no downstream reader breaks.
    const qualityGateMeta = buildServerVerifyQualityGateMeta({
      passed,
      advisory: f2TypecheckAdvisory || lintAdvisories.length > 0,
      advisoryChecks: f2TypecheckAdvisory
        ? ["typecheck"]
        : lintAdvisories.length > 0
          ? ["lint"]
          : [],
      results: gateResult.results,
      verifyLaneDurationMs: gateResult.verifyLaneDurationMs,
      firstFailureCheck: gateResult.firstFailureCheck,
      jobStartedAt: gateResult.jobStartedAt,
      jobFinishedAt: gateResult.jobFinishedAt,
      visualQA: visualQA ? compactVisualQAForQualityGateLog(visualQA) : undefined,
    });
    emitBusEvent({
      t: "version.verifier.done",
      versionId,
      chatId,
      outcome: outcomeIsGreen ? "passed" : "failed",
      blocked: !outcomeIsGreen,
      findings: outcomeIsGreen
        ? []
        : gateResult.results
            .filter((r) => !r.passed)
            .map((r) => ({ id: r.check, detail: r.output?.slice(0, 200) ?? "" })),
    });
    if (advisoryPromoted) {
      // Advisory promotion must not read as SOLID green on the status
      // projection: mark the run degraded ("klar med varningar") — mirrors the
      // quality-gate route's advisory emit so both paths surface identically.
      emitBusEvent({
        t: "version.degraded",
        versionId,
        chatId,
        kind: "typecheck_advisory",
        message: "Designläge: versionen promotades med typecheck-varningar (advisory).",
        meta: { advisoryChecks: ["typecheck"] },
      });
    }
    await createEngineVersionErrorLogs([
      {
        chatId,
        versionId,
        level: passed
          ? lintAdvisories.length > 0
            ? "warning"
            : "info"
          : advisoryPromoted
            ? "warning"
            : "error",
        category: advisoryPromoted ? "quality-gate:typecheck-advisory" : "preflight:quality-gate",
        message: passed
          ? lintAdvisories.length > 0
            ? "Server verify passed with lint warnings (advisory)."
            : "Server verify passed."
          : advisoryPromoted
            ? "Designläge: typecheck-varning (advisory) — previewen renderar; server-verify promotade utan repair."
            : "Server verify failed.",
        meta: advisoryPromoted
          ? { ...qualityGateMeta, advisory: true, failedChecks: ["typecheck"] }
          : qualityGateMeta,
      },
    ]).catch((err) => {
      console.warn("[server-verify] Failed to persist quality gate summary log:", err);
    });

    // Advisory promotion succeeded (the no-op case returned above); done.
    if (advisoryPromoted) {
      return;
    }

    if (passed) {
      if (normalPromoted && lintAdvisories.length > 0) {
        try {
          emitBusEvent({
            t: "version.degraded",
            versionId,
            chatId,
            kind: "lint_advisory",
            message: "ReleaseGate godkändes med ESLint-varningar (advisory).",
            meta: {
              advisoryChecks: ["lint"],
              warningCount: lintAdvisories.reduce(
                (sum, result) => sum + (result.warningCount ?? 0),
                0,
              ),
            },
          });
        } catch {
          // Telemetry only — never invalidate a successful promotion.
        }
      }
      return;
    }

    const { failedOutputs, nonRepairableFailures } = partitionServerVerifyFailures(
      gateResult.results,
    );
    if (nonRepairableFailures.length > 0) {
      await createEngineVersionErrorLogs(
        nonRepairableFailures.map((result) => ({
          chatId,
          versionId,
          level: "error" as const,
          category: `quality-gate:${result.check}-tooling`,
          message: `${result.check} tooling/configuration failure; not repairable as user code.`,
          meta: {
            failureKind: result.failureKind ?? "tooling",
            output: result.output.slice(0, 12_000),
            serverOwned: true,
          },
        })),
      ).catch(() => null);
      if (failedOutputs.length === 0) {
        await failVersionVerification(
          versionId,
          `ReleaseGate tooling/configuration failure (${nonRepairableFailures
            .map((result) => result.check)
            .join(", ")}); automatic code repair was not started.`,
          runId,
        ).catch(() => null);
        return;
      }
    }
    logQualityGateFailuresBestEffort({ chatId, versionId, failedOutputs });

    if (diagnosticOnly) {
      // SM-024: verifier blockers still forbid promotion AND LLM repair
      // (regress-on-repair: LLM passes can worsen blocking findings). But the
      // VM gate may have independent, mechanically fixable code failures
      // (import-repair / autofix). Run that deterministic prepass, persist
      // improvements into files_json, then fail closed — never promote.
      let deterministicMeta: {
        attempted: boolean;
        contentChanged: boolean;
        persisted: boolean;
        importRepairFixCount: number;
        handledCodes: string[];
        skippedPersistReason?: string;
        error?: string;
      } = {
        attempted: false,
        contentChanged: false,
        persisted: false,
        importRepairFixCount: 0,
        handledCodes: [],
      };

      if (failedOutputs.length > 0) {
        try {
          const repairVerbatimRepo = await chatUsesVerbatimRepo(chatId);
          const exportableForRepair = await buildExportableProject(codeFiles, {
            verbatimRepo: repairVerbatimRepo,
          });
          const initialContent = serializeCodeProject(exportableForRepair);
          const prepass = await runDeterministicRepairPrepass({
            initialContent,
            failedOutputs,
            previewPolicy,
            chatId,
            verbatimRepo: repairVerbatimRepo,
          });
          deterministicMeta = {
            attempted: true,
            contentChanged: prepass.changed,
            persisted: false,
            importRepairFixCount: prepass.fixCount,
            handledCodes: prepass.handledCodes,
          };

          if (prepass.changed) {
            const rawRepairedFiles = parseCodeProject(prepass.content).files;
            const protectedPartition =
              partitionGeneratedFilesForProtectedPaths(rawRepairedFiles);
            const reinjection = reinjectProtectedPathsFromFallback({
              kept: protectedPartition.kept,
              droppedPaths: fullProjectProtectedDroppedPaths(
                rawRepairedFiles,
                protectedPartition.dropped,
              ),
              fallbackFiles: codeFiles,
            });
            const repairedFilesJson = JSON.stringify(reinjection.files);
            const persistBlock = missingProtectedPathsPersistBlock(reinjection.stillMissing, {
              verbatimRepo: repairVerbatimRepo,
            });
            if (persistBlock) {
              deterministicMeta.skippedPersistReason = "protected_paths_still_missing";
            } else if (repairedFilesJson !== baseFilesJson) {
              // Supersede guard (bugbot HIGH on this diff): the gate can run
              // for minutes after the initial latest-check at the top of the
              // run. Re-check before mutating so a follow-up version created
              // meanwhile never gets its predecessor's files rewritten under
              // it. `expectedFilesJson` below still guards the same-version
              // race (user edit advancing files_json).
              if (!(await isLatestVersionForChat(chatId, versionId))) {
                deterministicMeta.skippedPersistReason = "superseded_by_newer_version";
              } else {
                checkVerificationDeadline(params.verifyDeadlineEpochMs);
                const persisted = await updateVersionFiles(versionId, repairedFilesJson, {
                  holderRunId: runId,
                  expectedFilesJson: baseFilesJson,
                }).catch((err) => {
                  console.warn(
                    "[server-verify] Failed to persist diagnostic deterministic repair:",
                    err,
                  );
                  return false;
                });
                deterministicMeta.persisted = persisted === true;
              }
            }
          }
        } catch (err) {
          if (err instanceof VerificationDeadlineExceeded) throw err;
          // Fail-closed: keep today's surface-only path when mechanical repair throws.
          deterministicMeta = {
            ...deterministicMeta,
            attempted: true,
            error: err instanceof Error ? err.message : String(err),
          };
          console.warn(
            "[server-verify] Deterministic diagnostic repair failed; falling back to surface-only:",
            err,
          );
        }
      }

      const diagnosticMessage = !deterministicMeta.attempted
        ? "Server verify gate failed but auto-repair suppressed (verifier blockers already exist; surface findings for inspection only)."
        : deterministicMeta.error
          ? "Server verify gate failed; deterministic repair threw (LLM repair suppressed — verifier blockers). Surface findings only."
          : deterministicMeta.contentChanged
            ? deterministicMeta.persisted
              ? "Server verify gate failed; deterministic repair persisted improvements (LLM repair suppressed — verifier blockers forbid promotion)."
              : "Server verify gate failed; deterministic repair improved content but could not persist (LLM repair suppressed — verifier blockers)."
            : "Server verify gate failed; deterministic repair ran with no content change (LLM repair suppressed — verifier blockers).";

      await createEngineVersionErrorLogs([
        {
          chatId,
          versionId,
          level: "warning",
          category: "server-verify:diagnostic",
          message: diagnosticMessage,
          meta: {
            serverOwned: true,
            diagnosticOnly: true,
            failedChecks: failedOutputs.map((f) => f.check),
            deterministicRepair: deterministicMeta,
          },
        },
      ]).catch(() => null);
      // 2026-04-23 (showcase-bug rootfix, fas D2): terminal-state resolve.
      // See matching comment in the `passed` branch above. Here verifier-LLM
      // and server-verify both agree the version is broken, so resolve to
      // `failed` cleanly. `triggerBuildErrorRepair` can still flip this to
      // `repair_available` later when the VM emits a build-error SSE.
      // Honesty note (bugbot MEDIUM on this diff): the gate ran on the
      // PRE-repair content; after a persisted deterministic fix the recorded
      // check list may no longer describe the stored files_json. Re-running
      // the gate here is out of scope for the diagnostics lane (promotion is
      // forbidden by verifier blockers regardless), so the summary says which
      // content the findings refer to instead of implying they were re-checked.
      await failVersionVerification(
        versionId,
        `Verifier-LLM blockers + server-verify gate failed (${failedOutputs
          .map((f) => f.check)
          .join(", ")}).${
          deterministicMeta.persisted
            ? " Deterministic repair persisted improvements afterwards; the gate findings refer to the pre-repair content."
            : ""
        }`,
        runId,
      ).catch(() => null);
      return;
    }

    checkVerificationDeadline(params.verifyDeadlineEpochMs);
    const repairOutcome = await tryServerRepairLoop({
      chatId,
      versionId,
      codeFiles,
      baseFilesJson,
      baseFilesRevision: actualFilesRevision,
      baseEditKind: snapshot.editKind,
      previewPolicy,
      failedOutputs,
      verifyLaneDurationMs: gateResult.verifyLaneDurationMs,
      firstFailureCheck: gateResult.firstFailureCheck,
      jobStartedAt: gateResult.jobStartedAt,
      jobFinishedAt: gateResult.jobFinishedAt,
      onRepairAvailable,
      runId,
      // #260 Codex P2 (forced build gate): a build-originated re-verify keeps
      // `build` in the post-repair gate even if this round only re-fails tsc.
      forceBuildGate: forceBuildCheck,
      // Bind this fire-and-forget loop to a wall-clock ceiling so it cannot keep
      // burning LLM passes minutes after the user left (the background lane
      // previously passed no deadline → capped only by pass count + per-pass
      // timeouts). Reuses the lease-holding-route budget as a generous bound.
      repairDeadlineEpochMs: Math.min(params.verifyDeadlineEpochMs ?? Infinity, resolveBackgroundRepairDeadlineEpochMs({
        nowMs: Date.now(),
        budgetMs: REPAIR_LOOP_BUDGET_MS,
      })),
      repairLedger,
      repairScopeId,
      contextRetryUsed,
      repairAuthority: params.repairAuthority,
      f3Readiness:
        previewPolicy === "fidelity3" && f3ReadinessContext
          ? {
              parentVersionId,
              orchestrationSnapshot: f3ReadinessContext.orchestrationSnapshot,
              projectId: f3ReadinessContext.projectId,
            }
          : null,
    });
    if (repairOutcome.stop) {
      outcome = { kind: "stop", ...repairOutcome.stop };
      if (repairOutcome.stop.reason === "time_budget_exceeded") {
        await resetVersionVerificationToPending(versionId, undefined, runId).catch(() => null);
      }
      return;
    }
    outcome = { kind: "stop", reason: "repair_settled", retryable: false };
    reverifyCurrent = repairOutcome.reverifyCurrent;
    reverifyFromContextCasMiss = repairOutcome.contextCasMiss === true;
    reverifyForceBuildCheck = repairOutcome.buildOriginated;
    if (repairOutcome.integrationMigrationHoldApplied) return;
  } catch (err) {
    if (err instanceof VerificationDeadlineExceeded) {
      outcome = { kind: "stop", reason: "time_budget_exceeded", retryable: true };
      await resetVersionVerificationToPending(versionId, undefined, runId).catch(() => null);
    } else if (err === REVERIFY_CURRENT_CONTEXT) {
      // Return supersession to the coordinator. No fail/green signal belongs
      // to the old context and this core never acquires a replacement lease.
    } else if (err instanceof QualityGateUnavailableError || err instanceof QualityGateNotConfiguredError) {
      outcome = { kind: "stop", reason: err instanceof QualityGateNotConfiguredError ? "quality_gate_disabled" : "quality_gate_unavailable",
        retryable: err instanceof QualityGateUnavailableError };
      await resetVersionVerificationToPending(versionId, undefined, runId).catch(() => null);
    } else {
      console.error("[server-verify] Error:", err);
      // #260 Codex P2 / Bugbot (no fail of B from a stale repair): staleBaseNoOp
      // lives inside tryServerRepairLoop and is lost when it throws, so the outer
      // catch must re-check here. If a concurrent user edit advanced files_json
      // past the snapshot this run was based on, do NOT finalize the newer edit B
      // as failed from the abandoned repair(A) — re-verify B instead (build kept in
      // the gate, conservatively, since the crash hid which checks were failing).
      let staleAfterError = false;
      if (baseFilesJsonForRecovery !== null) {
        const current = await getVersionFilesSnapshot(versionId).catch(() => null);
        if (current && current.filesJson !== baseFilesJsonForRecovery) {
          staleAfterError = true;
        }
      }
      if (staleAfterError) {
        reverifyCurrent = true;
        reverifyForceBuildCheck = true;
      } else {
        await failVersionVerification(
          versionId,
          "Server verification could not complete.",
          runId,
        ).catch(() => null);
      }
    }
  }
  };
  await execute();
  if (reverifyCurrent) return {
    kind: "superseded", cause: reverifyFromContextCasMiss ? "context" : "files",
    forceBuildCheck: reverifyForceBuildCheck || forceBuildCheck,
    contextRetryUsed: contextRetryUsed || reverifyFromContextCasMiss,
  };
  return outcome;
}
