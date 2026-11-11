/**
 * Deterministic quality gate under a held version lease. Decides a typed
 * `QualityGateOutcome` in phases; the route and the postcheck chain project
 * it with `qualityGateHttpResponse` and `verificationOutcomeFromQualityGate`.
 */
import { dbConfigured } from "@/lib/db/client";
import { assertPromoteAllowed } from "@/lib/db/promote-guard";
import { recordQualityGatePassedForCurrentContent } from "@/lib/db/services/generation-telemetry";
import {
  failVersionVerification,
  markVersionSupersededByRepair,
  markVersionVerifying,
  resetVersionVerificationToPending,
} from "@/lib/db/chat-repository-pg";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { logTier3MissingEnvBlockedDetached } from "@/lib/integrations/log-tier3-missing-env";
import { emit as emitBusEvent } from "@/lib/logging/event-bus";
// Side-effect imports: wire default subscribers (devLog-mirror + DB sink) so
// the `version.degraded` emits below reach both surfaces when the route loads
// this module without `verify-run`.
import "@/lib/logging/event-bus-subscribers";
import "@/lib/logging/event-bus-error-log-sink";
import { warnLog } from "@/lib/utils/debug";
import type { VisualQAResult } from "../visual-qa";
import {
  describeQualityGateVerification,
  isQualityGateConfigured,
  isQualityGateDisabledByEnv,
  QUALITY_GATE_COMMANDS,
  qualityGateAllPassed,
  QualityGateNotConfiguredError,
  QualityGateUnavailableError,
  type QualityGateCheckResult,
} from "../preview-quality-gate";
import { buildServerVerifyQualityGateMeta, compactVisualQAForQualityGateLog } from "../server-verify-log-meta";
import { checkTier3ReadinessForVersion, serverOwnedF3ReadinessParams } from "../tier3-readiness";
import { loadServerVerifyF3ReadinessContext, type ServerVerifyF3ReadinessContext } from "./f3-readiness";
import {
  checkVerificationDeadline,
  evaluateVersionGateSnapshot,
  promoteVersionWithRetry,
  VerificationDeadlineExceeded,
  type VersionFilesSnapshot,
} from "./gate-steps";
import { isLatestVersionForChat } from "./lease";
import type { QualityGateAdvisories, QualityGateEvidence, QualityGateOutcome } from "./quality-gate-outcome";

const QUALITY_GATE_ERROR_LOG_LOCK_TIMEOUT_MS = 3_000;
const LOG_OPTIONS = { lockTimeoutMs: QUALITY_GATE_ERROR_LOG_LOCK_TIMEOUT_MS };

export type QualityGateRunParams = {
  chatId: string;
  versionId: string;
  holderRunId: string;
  snapshot: VersionFilesSnapshot;
  gate?: "designPreview" | "integrationsBuild";
  verifyDeadlineEpochMs?: number;
};

/** Everything the phases share once the preconditions hold. */
type GateRun = {
  chatId: string;
  versionId: string;
  runId: string;
  snapshot: VersionFilesSnapshot;
  verifyDeadlineEpochMs: number | undefined;
};

type GateLogRow = Parameters<typeof createEngineVersionErrorLogs>[0][number];

export function buildQualityGateSummaryLog(params: {
  checkResults: QualityGateCheckResult[];
  verifyLaneDurationMs: number;
  firstFailureCheck: string | null;
  jobStartedAt: string | null;
  jobFinishedAt: string | null;
  visualQA?: VisualQAResult;
  /**
   * F2 render-first advisory: the VM gate did not pass but the only failure is
   * `typecheck` on a design-preview (F2) version. `next dev` renders JS despite
   * TS type errors, so the preview is usable — log a WARNING (not an error) and
   * let the version promote instead of failing + auto-repairing. F3 and any
   * build/lint failure never take this path.
   */
  advisory?: boolean;
}) {
  const {
    checkResults,
    verifyLaneDurationMs,
    firstFailureCheck,
    jobStartedAt,
    jobFinishedAt,
    visualQA,
    advisory = false,
  } = params;
  const passed = qualityGateAllPassed(checkResults);
  const hasAdvisory = advisory || checkResults.some((result) => result.advisory === true);
  const visualQAMeta =
    visualQA &&
    typeof visualQA.overallScore === "number" &&
    Array.isArray(visualQA.checks)
      ? compactVisualQAForQualityGateLog(visualQA)
      : undefined;

  const level: "info" | "warning" | "error" = passed
    ? hasAdvisory
      ? "warning"
      : "info"
    : advisory
      ? "warning"
      : "error";
  const message = passed
    ? hasAdvisory
      ? "Automatic quality gate passed with advisory findings."
      : "Automatic quality gate passed."
    : advisory
      ? "Designläge: typecheck-varning (advisory) — previewen renderar, versionen promotas."
      : "Automatic quality gate failed.";

  return {
    level,
    category: "preflight:quality-gate" as const,
    message,
    meta: buildServerVerifyQualityGateMeta({
      passed,
      advisory: hasAdvisory,
      advisoryChecks: advisory
        ? ["typecheck"]
        : Array.from(
            new Set(
              checkResults
                .filter((result) => result.advisory === true)
                .map((result) => result.check),
            ),
          ),
      results: checkResults,
      verifyLaneDurationMs,
      firstFailureCheck,
      jobStartedAt,
      jobFinishedAt,
      serverOwned: false,
      visualQA: visualQAMeta,
    }),
  };
}

/** Deterministic QG only. The caller owns the lease, auth and usage context. */
export async function runVersionQualityGateUnderLease(params: QualityGateRunParams): Promise<QualityGateOutcome> {
  const { chatId, versionId, holderRunId: runId, snapshot } = params;
  // Phase 1: preconditions. The lane never starts and the version stays untouched.
  if (!runId.trim() || !snapshot.filesRevision?.trim()) return { kind: "snapshot_unavailable" };
  const integrationsBuildGate = snapshot.lifecycleStage === "integrations";
  if (params.gate === "integrationsBuild" && !integrationsBuildGate) return { kind: "integrations_version_required" };
  const loaded = integrationsBuildGate ? await loadServerVerifyF3ReadinessContext(chatId) : null;
  if (loaded && "error" in loaded) return { kind: "readiness_context_unavailable", code: loaded.error };
  const readinessContext = loaded ?? { orchestrationSnapshot: null, projectId: null };
  const run: GateRun = { chatId, versionId, runId, snapshot, verifyDeadlineEpochMs: params.verifyDeadlineEpochMs };
  let verifyLaneStarted = false;
  try {
    return await runGatePhases(run, integrationsBuildGate, readinessContext, () => {
      verifyLaneStarted = true;
    });
  } catch (err) {
    return await classifyGateError(run, err, verifyLaneStarted);
  }
}

async function runGatePhases(
  run: GateRun,
  integrationsBuildGate: boolean,
  readinessContext: ServerVerifyF3ReadinessContext,
  onVerifyLaneStarted: () => void,
): Promise<QualityGateOutcome> {
  const { chatId, versionId, runId, snapshot } = run;
  // Phase 2: deadline, then the env kill-switch (F2 only).
  checkVerificationDeadline(run.verifyDeadlineEpochMs);
  // Read the version files EXACTLY ONCE under the lease and feed the SAME
  // set to readiness/export/verify/promotion — no re-read that could observe
  // a different snapshot (TOCTOU + Codex P2 stale-snapshot fix).
  const codeFiles = snapshot.files;

  // Env kill-switch (SAJTMASKIN_DISABLE_QUALITY_GATE): skip the automatic F2
  // RenderGate verify lane entirely, WITHOUT touching version state (Codex
  // P1 on #573: a skipped gate must never read as verified). The version
  // stays exactly as it was — normally `pending`, which for an F2 design
  // row is the honest "design ready, never gate-verified" resting state
  // (`resolveEngineVersionVerificationSurfaceStatus` → `design_ready`, and
  // the F2 deploy gate only blocks `failed`). No `markVersionVerifying`
  // (so no ~5-7s "verifying" spinner), no promotion, no superseded
  // mutation. NEVER disables the explicit F3 integrations ReleaseGate —
  // integrations must still typecheck+build before deploy.
  if (!integrationsBuildGate && isQualityGateDisabledByEnv()) {
    // Mirror the normal path: a fileless/unreadable snapshot is still 404.
    if (!codeFiles || codeFiles.length === 0) return { kind: "no_files" };
    await persistDisabledSkipLog(run);
    return { kind: "disabled_by_env" };
  }

  // Phase 3: F3 readiness.
  if (integrationsBuildGate) {
    const hold = await checkF3Readiness(run, readinessContext);
    if (hold) return hold;
  }

  // Phase 4: early supersede.
  if (await settleEarlySuperseded(run)) return { kind: "superseded", evidence: null };

  // Phase 5: run the verify lane over the snapshot.
  if (!codeFiles || codeFiles.length === 0) return { kind: "no_files" };
  if (!isQualityGateConfigured()) return { kind: "not_configured", hostError: null };
  const evaluation = await evaluateVersionGateSnapshot({ chatId, versionId, snapshot,
    verifyDeadlineEpochMs: run.verifyDeadlineEpochMs,
    beforeVerify: async () => {
      onVerifyLaneStarted();
      await markVersionVerifying(versionId, undefined, runId).catch((err) => {
        console.warn("[quality-gate] Failed to mark version verifying:", err);
      });
    },
  });
  if (!evaluation) {
    await resetVersionVerificationToPending(versionId, undefined, runId).catch(() => null);
    return { kind: "not_configured", hostError: null };
  }
  const { results, verifyLaneDurationMs, firstFailureCheck, jobStartedAt, jobFinishedAt } = evaluation.gateResult;
  const evidence: QualityGateEvidence = {
    passed: qualityGateAllPassed(results),
    checks: results,
    verifyLaneDurationMs,
    firstFailureCheck,
    jobStartedAt,
    jobFinishedAt,
    visualQA: evaluation.visualQA,
  };
  const gateAdvisoryResults = results.filter((result) => result.advisory === true);
  const hostAdvisories = Array.from(new Set(gateAdvisoryResults.map((result) => result.check)));
  const verificationSummary = describeQualityGateVerification(results);

  // F2 render-first (#330): a design-preview (F2) version whose ONLY gate
  // failure is `typecheck` is NOT failed/auto-repaired. `next dev` runs the
  // JS regardless of TS type errors, so the live preview renders — a type
  // error is advisory, not a blocker. The version is promoted (still
  // subject to the finalize promote-guard below) and a warning is surfaced.
  // False-green protection: only F2, only when EVERY failing check is
  // `typecheck` (any build/lint failure stays hard), and F3 (`integrations`)
  // is never advisory. Render-safety itself is enforced upstream in
  // finalize-preflight (buildPreviewHtml + home-route gate), so a version
  // that cannot render never reaches this promote path.
  const f2TypecheckAdvisory = evaluation.advisory;
  // Canonical client signal: `checks[]` is what the Agentlogg row
  // renders (`advisory` → "Varning"). `designAdvisory` on the envelope
  // is not enough — without this stamp a failed typecheck still reads
  // "Underkänd" even though the gate promoted with warnings. The stamp lands
  // after the host advisory list above and before the log rows below.
  if (f2TypecheckAdvisory) {
    for (const result of results) {
      if (result.check === "typecheck") {
        result.advisory = true;
      }
    }
  }
  // Carried into the retryable (non-promoted) outcomes too, so a transient
  // promote failure on an advisory version does not make the client treat
  // the typecheck-only failure as hard and auto-repair it.
  const advisories: QualityGateAdvisories = {
    designTypecheck: f2TypecheckAdvisory
      ? Array.from(new Set(results.filter((r) => !r.passed).map((r) => r.check)))
      : null,
    host: hostAdvisories,
  };

  // Phase 6: late supersede. Checked BEFORE persisting the regular logs so we
  // don't pile error rows on a version that no longer represents the chat's
  // head; the superseded path persists its own scoped log.
  if (!(await isLatestVersionForChat(chatId, versionId))) {
    await settleLateSuperseded(run, verificationSummary);
    return { kind: "superseded", evidence };
  }

  // Phase 7: log rows, built before promotion so they describe the lane.
  const logs = buildGateLogs(run, evidence, f2TypecheckAdvisory);

  // Phase 8: promotion.
  const decision = await decidePromotion(run, {
    gatePassed: evidence.passed,
    f2TypecheckAdvisory,
    hostAdvisories,
    verificationSummary,
  });

  // Phase 9: persist, notify, answer.
  if (decision === "integration_migration_required") {
    await persistIntegrationMigrationLog(run);
    return { kind: "integration_migration_required", vmGatePassed: evidence.passed };
  }
  if (logs.length > 0 && dbConfigured) {
    await createEngineVersionErrorLogs(logs, LOG_OPTIONS).catch((err) => {
      console.warn("[quality-gate] Failed to persist error logs:", err);
    });
  }
  // A guard-blocked promotion must NOT read as green.
  if (decision === "blocked") return { kind: "promotion_blocked", evidence };
  // Promote guard could not verify the finalize signal (DB/guard error):
  // not green, not a verifier block, retryable.
  if (decision === "guard_unavailable") {
    return { kind: "promotion_deferred", cause: "guard_unavailable", evidence, advisories };
  }
  // Transient promote failure: not green, but not a verifier block either.
  if (decision === "promote_failed") {
    return { kind: "promotion_deferred", cause: "promote_failed", evidence, advisories };
  }
  if (decision === "gate_failed") return { kind: "failed", evidence, hostAdvisories };
  emitPromotionAdvisories(run, advisories, gateAdvisoryResults);
  return { kind: "promoted", filesRevision: snapshot.filesRevision!, evidence, advisories };
}

/**
 * Durable trace (the response's skipped/disabled fields are ephemeral): one
 * warning row so readiness/status consumers can see the gate was switched off
 * for this version instead of silently never running.
 */
async function persistDisabledSkipLog(run: GateRun): Promise<void> {
  if (!dbConfigured) return;
  await createEngineVersionErrorLogs([
    {
      chatId: run.chatId,
      versionId: run.versionId,
      level: "warning",
      category: "quality-gate:disabled-skip",
      message:
        "Quality gate avstängd (SAJTMASKIN_DISABLE_QUALITY_GATE) — verify-lane hoppades över; versionen lämnas overifierad.",
      meta: { reason: "quality_gate_disabled_by_env", serverOwned: false },
    },
  ], LOG_OPTIONS).catch((err) => {
    warnLog("quality-gate", "Failed to persist disabled-skip log (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

async function checkF3Readiness(
  run: GateRun,
  readinessContext: ServerVerifyF3ReadinessContext,
): Promise<QualityGateOutcome | null> {
  const parentVersionId = run.snapshot.parentVersionId ?? null;
  const readiness = await checkTier3ReadinessForVersion(
    serverOwnedF3ReadinessParams({
      versionId: run.versionId,
      chatId: run.chatId,
      parentVersionId,
      filesRevision: run.snapshot.filesRevision,
      preloadedFiles: run.snapshot.files,
      orchestrationSnapshot: readinessContext.orchestrationSnapshot,
      projectId: readinessContext.projectId,
    }),
  );
  if (readiness.ready) return null;
  if (readiness.reason === "missing_env") {
    // R7: durable observation for /logg — best-effort, never blocks 412.
    // Prefer parent (design) version id; fall back to the F3 fork.
    logTier3MissingEnvBlockedDetached({
      chatId: run.chatId,
      versionId: parentVersionId ?? run.versionId,
      projectId: readinessContext.projectId,
      missingByIntegration: readiness.readiness.missingByIntegration,
      source: "quality-gate",
      f3VersionId: run.versionId,
      lockTimeoutMs: QUALITY_GATE_ERROR_LOG_LOCK_TIMEOUT_MS,
    });
  }
  return { kind: "f3_not_ready", parentVersionId, projectId: readinessContext.projectId, readiness };
}

/**
 * Early supersede check (2026-07 preview-lifecycle simplification): if a newer
 * version already exists, the VM verify lane (~30-45 s install +
 * typecheck/build) would only produce a result the late supersede check
 * discards anyway. Settle terminal-neutral `superseded` now — before
 * `markVersionVerifying` — so the abandoned row never spins and the lane
 * budget goes to the newer version instead. Placed AFTER the F3 readiness
 * block so the explicit integrationsBuild flow keeps its 412/409 readiness
 * contract (env dialogs in the builder depend on those statuses).
 *
 * Only claims `superseded` when the lease-guarded write actually settled the
 * row: `markVersionSupersededByRepair` returns null when its
 * `versionWriteWhere(id, runId)` guard matches no row. Claiming it regardless
 * was a false-green (Bugbot); otherwise the normal lane runs so a real verify
 * or the late supersede check terminalizes the row.
 */
async function settleEarlySuperseded(run: GateRun): Promise<boolean> {
  if (await isLatestVersionForChat(run.chatId, run.versionId)) return false;
  const earlySettled = await markVersionSupersededByRepair(run.versionId, null, run.runId).catch((err) => {
    console.warn("[quality-gate] Failed to mark superseded version (early):", err);
    return null;
  });
  if (!earlySettled) return false;
  await createEngineVersionErrorLogs([
    {
      chatId: run.chatId,
      versionId: run.versionId,
      level: "warning",
      category: "quality-gate:superseded",
      message:
        "Quality gate skipped: a newer version already exists; version settled as superseded before the verify lane ran.",
      meta: { serverOwned: false, early: true },
    },
  ], LOG_OPTIONS).catch((err) => {
    console.warn("[quality-gate] Failed to persist early superseded log:", err);
  });
  return true;
}

/**
 * Like the early lane, a superseded verdict never counts as a pass. The
 * lease-guarded settle may also have written nothing (another run owns the
 * row), so a pass here would claim a terminal state.
 */
async function settleLateSuperseded(run: GateRun, verificationSummary: string): Promise<void> {
  await markVersionSupersededByRepair(run.versionId, null, run.runId).catch((err) => {
    console.warn("[quality-gate] Failed to mark superseded version:", err);
  });
  await createEngineVersionErrorLogs([
    {
      chatId: run.chatId,
      versionId: run.versionId,
      level: "warning",
      category: "quality-gate:superseded",
      message: "Quality gate finished after a newer version was created; skipping state mutation.",
      meta: {
        verificationSummary,
        serverOwned: false,
      },
    },
  ], LOG_OPTIONS).catch((err) => {
    console.warn("[quality-gate] Failed to persist superseded log:", err);
  });
}

function buildGateLogs(run: GateRun, evidence: QualityGateEvidence, f2TypecheckAdvisory: boolean): GateLogRow[] {
  const { chatId, versionId } = run;
  const results = evidence.checks;
  return [
    {
      chatId,
      versionId,
      ...buildQualityGateSummaryLog({
        checkResults: results,
        verifyLaneDurationMs: evidence.verifyLaneDurationMs,
        firstFailureCheck: evidence.firstFailureCheck,
        jobStartedAt: evidence.jobStartedAt,
        jobFinishedAt: evidence.jobFinishedAt,
        visualQA: evidence.visualQA,
        advisory: f2TypecheckAdvisory,
      }),
    },
    ...results
      .filter((r) => !r.passed || r.advisory === true)
      .map((r) => {
        // In the F2 advisory case the typecheck failure is non-blocking:
        // log it as a warning under a distinct category so it stays visible
        // in diagnostics without reading as a hard "failed" verdict.
        const advisoryEntry =
          (f2TypecheckAdvisory && r.check === "typecheck") || r.advisory === true;
        return {
          chatId,
          versionId,
          level: advisoryEntry ? ("warning" as const) : ("error" as const),
          category: advisoryEntry
            ? `quality-gate:${r.check}-advisory`
            : `quality-gate:${r.check}`,
          message: advisoryEntry
            ? `${r.check} advisory (exit ${r.exitCode}) — ej blockerande`
            : `${r.check} failed (exit ${r.exitCode})`,
          meta: {
            stage: r.check,
            command: QUALITY_GATE_COMMANDS[r.check as keyof typeof QUALITY_GATE_COMMANDS] ?? null,
            output: r.output.slice(0, 12_000),
            outputLength: r.output.length,
            exitCode: r.exitCode,
            durationMs: r.durationMs ?? null,
            advisory: advisoryEntry,
            serverOwned: false,
          },
        };
      }),
  ];
}

type PromotionDecision =
  | "promoted"
  | "integration_migration_required"
  | "promote_failed"
  | "guard_unavailable"
  | "blocked"
  | "gate_failed";

/**
 * Promote when the gate passed OR when it is an F2 typecheck-only advisory
 * (render-first). Both still pay the finalize promote-guard, so a
 * verifier-blocked version is never advisory-promoted.
 */
async function decidePromotion(run: GateRun, input: {
  gatePassed: boolean;
  f2TypecheckAdvisory: boolean;
  hostAdvisories: string[];
  verificationSummary: string;
}): Promise<PromotionDecision> {
  const { chatId, versionId, runId } = run;
  const { f2TypecheckAdvisory, hostAdvisories, verificationSummary } = input;
  if (!input.gatePassed && !f2TypecheckAdvisory) {
    await failVersionVerification(versionId, verificationSummary, runId).catch((err) => {
      console.warn("[quality-gate] Failed to mark version failed:", err);
    });
    return "gate_failed";
  }
  const promoteSummary = f2TypecheckAdvisory
    ? "Designläge: previewen renderar. Typecheck-varningar kvarstår (advisory, ej blockerande)."
    : hostAdvisories.length > 0
      ? `ReleaseGate passed with advisory findings: ${hostAdvisories.join(", ")}.`
      : verificationSummary;
  // Check the false-green guard *explicitly* before promoting so we can
  // tell three cases apart: (1) an explicit verifier block, (2) a guard
  // that could not READ the finalize signal (DB error), and (3) a clean
  // allow. `onReadError: "indeterminate"` fails CLOSED on a read error
  // (B08): the historic fail-open here could promote a `verifier_failed`
  // row whenever the telemetry read threw. The `.catch` is defensive for
  // any unexpected throw and also fails closed (retryable).
  const readPromoteGuard = () =>
    assertPromoteAllowed(versionId, undefined, {
      onReadError: "indeterminate",
    }).catch((err) => {
      console.warn(
        "[quality-gate] Promote guard threw unexpectedly; failing closed (retryable):",
        err,
      );
      return {
        allowed: false as const,
        indeterminate: true as const,
        reason: "promote_guard_threw",
      };
    });

  let guard = await readPromoteGuard();

  // Approach B (prod 2026-08-05, chats 4cc467d2 / 41be90f2): when the
  // content-revision gate reports `staleRevision`, the VM checks above
  // already assessed the CURRENT fileset under lease. Stamp a fresh
  // `preflight_passed` for that revision and re-check the guard exactly
  // once — do NOT move an old verdict's revision forward (that would
  // reintroduce false-green), and do NOT treat a matching
  // `verifier_failed` as stale (explicit block path below).
  //
  // The superseded verdict must ALSO not have been blocking. The guard
  // classifies a revision mismatch BEFORE it looks at whether the verdict
  // blocks (`promote-guard.ts`), so `staleRevision` alone also covers
  // "the finalize verifier REJECTED revision A, then the post-check lane
  // mutated the files to B". Re-assessing there would stamp
  // `preflight_passed` over a rejection on the strength of the VM lane
  // alone — exactly the false-green this branch's own B08 comment
  // forbids, since install/typecheck/build is not a substitute for the
  // verifier pass. A blocking stale verdict therefore stays deferred and
  // retryable: the next finalize/verify run produces a verdict that
  // actually applies to the new content.
  if (
    !guard.allowed &&
    "indeterminate" in guard &&
    guard.indeterminate === true &&
    "staleRevision" in guard &&
    guard.staleRevision === true &&
    guard.staleSignalBlocking !== true
  ) {
    const stamped = await recordQualityGatePassedForCurrentContent(versionId);
    if (stamped) {
      console.info(
        "[quality-gate] Stale promote-guard revision: stamped fresh verdict for current content and re-checking once",
      );
      guard = await readPromoteGuard();
    }
  }

  if (guard.allowed) {
    // M#vlane2 + BB#299: bounded retry on a transient promote timeout so
    // a momentary row-lock/statement_timeout no longer strands a passed
    // gate at "verifying" (which the watchdog later false-reds).
    const promoted = await promoteVersionWithRetry(versionId, promoteSummary, runId, run.verifyDeadlineEpochMs);
    // The guard already allowed promotion, so a null here is a transient
    // failure (DB error, or a race that re-flagged the signal between the
    // two reads) — not a verifier block. Leave the row at "verifying" and
    // surface a soft error so the client can retry instead of going red.
    if (promoted === "integration_migration_required") return "integration_migration_required";
    return promoted ? "promoted" : "promote_failed";
  }
  if ("indeterminate" in guard && guard.indeterminate === true) {
    // Guard could not read the finalize signal, so we cannot prove this
    // row is clean. Fail CLOSED but RETRYABLE: do NOT promote, and do NOT
    // mark the version `failed` (a transient DB blip must not false-red a
    // clean version). Leave it at "verifying" and surface a soft error so
    // the client retries — mirrors the transient promote-failure path.
    // Also covers a staleRevision reassess that still could not produce
    // an applicable verdict (stamp failed / race).
    //
    // Do NOT persist the raw guard reason into the error log: on a DB/
    // telemetry read error `assertPromoteAllowed` embeds the underlying
    // exception message in `guard.reason`, and this `meta` is rendered
    // verbatim to the chat owner in VersionDiagnosticsDialog. Persist a
    // stable code instead and keep the raw detail in server logs only.
    console.warn(
      "[quality-gate] Promote guard unavailable (raw reason, server-only):",
      guard.reason,
    );
    await createEngineVersionErrorLogs([
      {
        chatId,
        versionId,
        level: "warning",
        category: "quality-gate:promote-guard-unavailable",
        message:
          "Build checks passed but the promotion guard could not verify the finalize signal; promotion deferred (retryable).",
        meta: {
          reason: "promote_guard_signal_unavailable",
          serverOwned: false,
        },
      },
    ], LOG_OPTIONS).catch((err) => {
      console.warn(
        "[quality-gate] Failed to persist promote-guard-unavailable log:",
        err,
      );
    });
    return "guard_unavailable";
  }
  await failVersionVerification(
    versionId,
    // Advisory case: don't claim "build checks passed" — typecheck failed
    // (advisory), and the finalize verifier is what blocked promotion.
    f2TypecheckAdvisory
      ? "Typecheck advisory noted, but the finalize verifier flagged blocking findings; promotion was blocked."
      : "Build checks passed but the finalize verifier flagged blocking findings; promotion was blocked.",
    runId,
  ).catch((err) => {
    console.warn(
      "[quality-gate] Failed to mark version failed after promote guard block:",
      err,
    );
  });
  return "blocked";
}

async function persistIntegrationMigrationLog(run: GateRun): Promise<void> {
  if (!dbConfigured) return;
  await createEngineVersionErrorLogs(
    [
      {
        chatId: run.chatId,
        versionId: run.versionId,
        level: "warning",
        category: "quality-gate:integration-migration-required",
        message:
          "Build checks passed, but an integration migration requires explicit review before promotion.",
        meta: {
          code: "integration_migration_required",
          retryable: false,
          serverOwned: false,
        },
      },
    ],
    LOG_OPTIONS,
  ).catch((err) => {
    console.warn("[quality-gate] Failed to persist integration hold log:", err);
  });
}

/** Telemetry only: a bus failure never blocks promotion or the answer. */
function emitPromotionAdvisories(
  run: GateRun,
  advisories: QualityGateAdvisories,
  gateAdvisoryResults: QualityGateCheckResult[],
): void {
  if (advisories.host.includes("lint")) {
    try {
      emitBusEvent({
        t: "version.degraded",
        versionId: run.versionId,
        chatId: run.chatId,
        kind: "lint_advisory",
        message: "ReleaseGate godkändes med ESLint-varningar (advisory).",
        meta: {
          advisoryChecks: advisories.host,
          warningCount: gateAdvisoryResults.reduce(
            (sum, result) => sum + (result.warningCount ?? 0),
            0,
          ),
        },
      });
    } catch {
      // Telemetry only — never block promotion on a bus failure.
    }
  }
  // F2 render-first advisory promotion: surface the advisory on the
  // version-status projection (Codex #345 P1): without a degradation the
  // status token reads solid green even though the VM typecheck failed.
  // `version.degraded` maps a `done` phase to `degraded` ("klar med
  // varningar") in `mapVersionStatusToDisplay`; the DURABLE record is the
  // promoted row's `verification_summary` (advisory text) + the warning row
  // in `engine_version_error_logs` persisted above.
  if (advisories.designTypecheck !== null) {
    try {
      emitBusEvent({
        t: "version.degraded",
        versionId: run.versionId,
        chatId: run.chatId,
        kind: "typecheck_advisory",
        message:
          "Designläge: versionen promotades med typecheck-varningar (advisory).",
        meta: { advisoryChecks: advisories.designTypecheck },
      });
    } catch {
      // Telemetry only — never block the response on a bus failure.
    }
  }
}

/** Phase 10: classify a throw. Only a code-independent failure becomes an outcome. */
async function classifyGateError(run: GateRun, err: unknown, verifyLaneStarted: boolean): Promise<QualityGateOutcome> {
  const { versionId, runId } = run;
  if (err instanceof VerificationDeadlineExceeded) {
    if (verifyLaneStarted) await resetVersionVerificationToPending(versionId, undefined, runId).catch(() => null);
    return { kind: "time_budget_exceeded" };
  }
  // Unreachable verify lane (network / timeout / HTTP 4xx-5xx / disk-full):
  // the gate never evaluated the code, so do NOT mark the version `failed`
  // (a false-RED verdict) and do NOT hard-500. The version stays unpromoted
  // (never false-green) and the caller still releases the lease. A real
  // check failure does not reach here — it is a `failed` outcome.
  if (err instanceof QualityGateUnavailableError || err instanceof QualityGateNotConfiguredError) {
    // Revert the optimistic `markVersionVerifying` (Codex P2 on #296):
    // leaving the row `verifying` with no running job would let the
    // readiness stale-verification watchdog later mark it `failed` (a
    // delayed false-RED). Reset to `pending` so the version honestly reads
    // "awaiting verification, retryable" instead.
    await resetVersionVerificationToPending(versionId, undefined, runId).catch(
      (resetErr) => {
        console.warn(
          "[quality-gate] Failed to reset version to pending after unavailable verify lane:",
          resetErr,
        );
      },
    );
    return err instanceof QualityGateNotConfiguredError
      ? { kind: "not_configured", hostError: err.message }
      : { kind: "verify_lane_unavailable", message: err.message, retryable: err.retryable };
  }
  if (!verifyLaneStarted) {
    // The throw happened during file read / readiness / export — the
    // verify lane never ran, so the version state must stay untouched
    // (no false-RED). Retryable, mirroring the lease/verify-lane
    // unavailability contract.
    console.error("[quality-gate] Pre-verify step threw; version state untouched:", err);
    return { kind: "precheck_failed" };
  }
  await failVersionVerification(
    versionId,
    "Automatic verification could not complete.",
    runId,
  ).catch((updateErr) => {
    console.warn("[quality-gate] Failed to mark version failed after error:", updateErr);
  });
  throw err;
}
