/**
 * Server-side verify+repair loop.
 *
 * Triggered after finalize+preview verify handoff in the generation stream as a
 * fire-and-forget background task. Updates version verification state
 * on the DB; the UI reads server state via version polls.
 *
 * Note: this module uses preview-host's isolated verify lane. It does not
 * control the primary tier-2 preview provider for end users.
 *
 * Deduplicated: the same versionId will not run twice concurrently.
 */
import { dbConfigured } from "@/lib/db/client";
import {
  markVersionVerifying,
  markVersionRepairing,
  promoteVersion,
  failVersionVerification,
  saveRepairedFiles,
  getChat,
  getLatestVersion,
  markVersionSupersededByRepair,
} from "@/lib/db/chat-repository-pg";
import { getVersionFiles } from "@/lib/gen/version-manager";
import { buildExportableProject } from "@/lib/gen/export/build-exportable-project";
import { parseCodeProject, serializeCodeProject, type CodeFile } from "@/lib/gen/parser";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { DESIGN_PREVIEW_QUALITY_GATE_CHECKS } from "./quality-gate-checks";
import {
  isQualityGateConfigured,
  maybeAnalyzeVisualQAForPassedExportable,
  qualityGateAllPassed,
  runQualityGateOnExportable,
  shouldPromoteAfterRepair,
} from "./preview-quality-gate";
import { ownModelIdToCanonicalModelId } from "@/lib/models/catalog";
import { resolvePhaseModel, resolvePhaseThinking } from "@/lib/models/phase-routing";
import { SERVER_REPAIR_MAX_PASSES } from "@/lib/gen/defaults";
import {
  buildGroupedRepairErrorContext,
  buildRepairErrorContextLines,
  runRepairLoop,
  type RepairErrorManifest,
} from "./repair-loop";
import {
  buildServerVerifyQualityGateMeta,
  buildServerVerifyRepairContextLines,
  buildServerRepairOutcomeMeta,
  compactVisualQAForQualityGateLog,
  type ServerVerifyFailedOutput,
} from "./server-verify-log-meta";

const inflight = new Set<string>();

export function isServerVerifyEligible(versionId: string): boolean {
  if (!dbConfigured) return false;
  if (!isQualityGateConfigured()) return false;
  if (inflight.has(versionId)) return false;
  return true;
}

export function isServerVerifyInFlight(versionId: string): boolean {
  return inflight.has(versionId);
}

async function isLatestVersionForChat(chatId: string, versionId: string): Promise<boolean> {
  const latest = await getLatestVersion(chatId).catch(() => null);
  return !latest || latest.id === versionId;
}

/**
 * Fire-and-forget server-side verification + capped repair loop.
 * Called from generation stream after finalize. Does NOT block the SSE response.
 */
export async function triggerServerVerification(params: {
  chatId: string;
  versionId: string;
  onRepairAvailable?: (payload: {
    versionId: string;
    summary: string | null;
    repairAvailableAt: string | null;
  }) => void;
}): Promise<void> {
  const { chatId, versionId, onRepairAvailable } = params;
  if (!isServerVerifyEligible(versionId)) return;
  inflight.add(versionId);

  try {
    if (!(await isLatestVersionForChat(chatId, versionId))) {
      await markVersionSupersededByRepair(versionId).catch(() => null);
      await createEngineVersionErrorLogs([{
        chatId,
        versionId,
        level: "warning",
        category: "server-verify:superseded",
        message: "Background verification skipped because a newer version already exists.",
        meta: { serverOwned: true },
      }]).catch(() => null);
      return;
    }
    const codeFiles = await getVersionFiles(versionId);
    if (!codeFiles || codeFiles.length === 0) return;

    await markVersionVerifying(versionId).catch(() => null);

    const exportable = await buildExportableProject(codeFiles);
    const gateResult = await runQualityGateOnExportable({
      chatId,
      versionId,
      exportable,
      checks: DESIGN_PREVIEW_QUALITY_GATE_CHECKS,
    });
    if (!gateResult) {
      await failVersionVerification(versionId, "Quality gate unavailable during verification.").catch(() => null);
      return;
    }

    const passed = qualityGateAllPassed(gateResult.results);
    const visualQA = maybeAnalyzeVisualQAForPassedExportable({
      exportable,
      results: gateResult.results,
      onError: (vqaErr) => {
        console.warn("[server-verify] Visual QA error (non-fatal):", vqaErr);
      },
    });

    await createEngineVersionErrorLogs([{
      chatId,
      versionId,
      level: passed ? "info" : "error",
      category: "preflight:quality-gate",
      message: passed ? "Server verify passed." : "Server verify failed.",
      meta: buildServerVerifyQualityGateMeta({
        passed,
        results: gateResult.results,
        verifyLaneDurationMs: gateResult.verifyLaneDurationMs,
        firstFailureCheck: gateResult.firstFailureCheck,
        jobStartedAt: gateResult.jobStartedAt,
        jobFinishedAt: gateResult.jobFinishedAt,
        visualQA: visualQA ? compactVisualQAForQualityGateLog(visualQA) : undefined,
      }),
    }]).catch((err) => {
      console.warn("[server-verify] Failed to persist quality gate summary log:", err);
    });

    if (passed) {
      await promoteVersion(versionId, "Automatic server verification passed.").catch(() => null);
      return;
    }

    const failedOutputs = gateResult.results
      .filter((r) => !r.passed)
      .map((r) => ({
        check: r.check,
        exitCode: r.exitCode,
        output: r.output,
        durationMs: r.durationMs ?? null,
      }));

    await tryServerRepairLoop({
      chatId,
      versionId,
      codeFiles,
      failedOutputs,
      verifyLaneDurationMs: gateResult.verifyLaneDurationMs,
      firstFailureCheck: gateResult.firstFailureCheck,
      jobStartedAt: gateResult.jobStartedAt,
      jobFinishedAt: gateResult.jobFinishedAt,
      onRepairAvailable,
    });
  } catch (err) {
    console.error("[server-verify] Error:", err);
    await failVersionVerification(
      versionId,
      "Server verification could not complete.",
    ).catch(() => null);
  } finally {
    inflight.delete(versionId);
  }
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
 * **Opt-in for safety.** Gated by `SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR=1`
 * so we don't change end-user-visible behavior in production until
 * we've watched it in dev for a while. Same `inflight` dedup as
 * server-verify, so we never run two repair loops on the same version
 * concurrently regardless of which path triggered them.
 */
export async function triggerBuildErrorRepair(params: {
  chatId: string;
  versionId: string;
  buildError: {
    stage: string;
    message: string;
    failureCode?: string | null;
  };
  onRepairAvailable?: (payload: {
    versionId: string;
    summary: string | null;
    repairAvailableAt: string | null;
  }) => void;
}): Promise<void> {
  if (process.env.SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR !== "1") return;
  const { chatId, versionId, buildError, onRepairAvailable } = params;
  if (!isServerVerifyEligible(versionId)) return;
  inflight.add(versionId);
  try {
    if (!(await isLatestVersionForChat(chatId, versionId))) return;
    const codeFiles = await getVersionFiles(versionId);
    if (!codeFiles || codeFiles.length === 0) return;
    const failureCodeSuffix = buildError.failureCode ? ` [${buildError.failureCode}]` : "";
    const failedOutput: ServerVerifyFailedOutput = {
      check: "build",
      exitCode: 1,
      output: `[preview-vm:${buildError.stage}]${failureCodeSuffix} ${buildError.message}`,
      durationMs: null,
    };
    await tryServerRepairLoop({
      chatId,
      versionId,
      codeFiles,
      failedOutputs: [failedOutput],
      verifyLaneDurationMs: 0,
      firstFailureCheck: "build",
      jobStartedAt: null,
      jobFinishedAt: null,
      onRepairAvailable,
    });
  } catch (err) {
    console.error("[server-verify] build-error repair failed:", err);
  } finally {
    inflight.delete(versionId);
  }
}

async function tryServerRepairLoop(params: {
  chatId: string;
  versionId: string;
  codeFiles: CodeFile[];
  failedOutputs: ServerVerifyFailedOutput[];
  verifyLaneDurationMs: number;
  firstFailureCheck: string | null;
  jobStartedAt: string | null;
  jobFinishedAt: string | null;
  onRepairAvailable?: (payload: {
    versionId: string;
    summary: string | null;
    repairAvailableAt: string | null;
  }) => void;
}): Promise<void> {
  const {
    chatId,
    versionId,
    codeFiles,
    failedOutputs,
    verifyLaneDurationMs,
    firstFailureCheck,
    jobStartedAt,
    jobFinishedAt,
    onRepairAvailable,
  } = params;
  const verifyContext = {
    verifyLaneDurationMs,
    firstFailureCheck,
    jobStartedAt,
    jobFinishedAt,
  };
  const hadQualityGateFailures = failedOutputs.length > 0;

  await markVersionRepairing(versionId).catch(() => null);

  const exportable = await buildExportableProject(codeFiles);
  const initialContent = serializeCodeProject(exportable);

  async function tryPromoteAfterGate(projectContent: string, method: "deterministic" | "llm"): Promise<boolean> {
    const repairedFiles = parseCodeProject(projectContent).files;
    const exportableForGate = await buildExportableProject(repairedFiles);
    const decision = await shouldPromoteAfterRepair({
      chatId,
      versionId,
      exportable: exportableForGate,
      hadQualityGateFailures,
      checks: DESIGN_PREVIEW_QUALITY_GATE_CHECKS,
    });
    const visualQA = maybeAnalyzeVisualQAForPassedExportable({
      exportable: exportableForGate,
      results: decision.results,
      onError: (vqaErr) => {
        console.warn("[server-verify] Post-repair visual QA error (non-fatal):", vqaErr);
      },
    });
    const visualQAMeta = visualQA
      ? compactVisualQAForQualityGateLog(visualQA)
      : undefined;
    let promoted = false;
    if (decision.promote) {
      if (!(await isLatestVersionForChat(chatId, versionId))) {
        await markVersionSupersededByRepair(versionId).catch(() => null);
        await createEngineVersionErrorLogs([{
          chatId,
          versionId,
          level: "warning",
          category: "server-verify:superseded",
          message: "Post-repair promotion skipped because a newer version already exists.",
          meta: {
            method,
            serverOwned: true,
          },
        }]).catch(() => null);
        return false;
      }
      const filesJson = JSON.stringify(repairedFiles);
      const msg =
        method === "deterministic"
          ? "Server repair passed quality gate (deterministic). Awaiting acceptance."
          : "Server repair passed quality gate (LLM). Awaiting acceptance.";
      const saved = await saveRepairedFiles(versionId, filesJson, msg).catch((err) => {
        console.warn("[server-verify] Failed to save repaired version files:", err);
        return null;
      });
      promoted = Boolean(saved);
      if (saved && onRepairAvailable) {
        onRepairAvailable({
          versionId: saved.id,
          summary: saved.verification_summary,
          repairAvailableAt: saved.repair_available_at,
        });
      }
    }
    await createEngineVersionErrorLogs([
      {
        chatId,
        versionId,
        level: promoted ? "info" : "warning",
        category: "preflight:quality-gate",
        message: promoted
          ? `Post-repair quality gate passed (${method}); repair is ready for acceptance.`
          : decision.promote
            ? `Post-repair quality gate passed but repair could not be saved (${method}).`
            : "Post-repair quality gate did not pass; not promoting.",
        meta: buildServerVerifyQualityGateMeta({
          results: decision.results,
          verifyLaneDurationMs: decision.verifyLaneDurationMs,
          firstFailureCheck: decision.firstFailureCheck,
          jobStartedAt: decision.jobStartedAt,
          jobFinishedAt: decision.jobFinishedAt,
          repass: true,
          method,
          promoted,
          visualQA: visualQAMeta,
          errorManifest: groupedRepairContext.errorManifest,
        }),
      },
    ]).catch((err) => {
      console.warn("[server-verify] Failed to persist post-repair quality gate log:", err);
    });
    return promoted;
  }

  const originatingChat = await getChat(chatId).catch(() => null);
  const originatingTier = ownModelIdToCanonicalModelId(originatingChat?.model ?? null);
  const fixerModel = originatingTier
    ? resolvePhaseModel(originatingTier, "fixer").modelId
    : undefined;
  const fixerThinking = originatingTier
    ? resolvePhaseThinking(originatingTier, "fixer")
    : null;

  const repairLogContext = buildRepairLogContextLines({
    failedOutputs,
    verifyLaneDurationMs,
    firstFailureCheck,
    jobStartedAt,
    jobFinishedAt,
    initialContent,
  });
  const groupedRepairContext = {
    errorManifest: repairLogContext.errorManifest,
  };

  const loopResult = await runRepairLoop({
    initialContent,
    failedOutputs,
    contextLines: repairLogContext.contextLines,
    maxLlmPasses: SERVER_REPAIR_MAX_PASSES,
    llmTimeoutMs: 60_000,
    fixerModel,
    fixerThinking: fixerThinking?.thinking,
    fixerReasoningEffort: fixerThinking?.reasoningEffort,
    hasActionableErrorContext: hadQualityGateFailures,
    onAttemptPromotion: async (projectContent, method) => ({
      promoted: await tryPromoteAfterGate(projectContent, method),
    }),
  });

  if (loopResult.promoted) {
    logRepairOutcome(
      chatId,
      versionId,
      loopResult.method ?? "llm",
      true,
      loopResult.llmPasses,
      0,
      undefined,
      verifyContext,
      fixerModel,
      loopResult.errorManifest,
    );
    return;
  }

  if (loopResult.remainingErrors === 0) {
    await failVersionVerification(
      versionId,
      "Server repair: syntax clean but quality gate still failing.",
    ).catch(() => null);
    logRepairOutcome(
      chatId,
      versionId,
      "llm",
      false,
      loopResult.llmPasses,
      0,
      loopResult.earlyStopReason,
      verifyContext,
      fixerModel,
      loopResult.errorManifest,
    );
    return;
  }

  await failVersionVerification(
    versionId,
    `Server repair incomplete (${loopResult.remainingErrors} errors remain).`,
  ).catch(() => null);
  logRepairOutcome(
    chatId,
    versionId,
    "llm",
    false,
    loopResult.llmPasses,
    loopResult.remainingErrors,
    loopResult.earlyStopReason,
    verifyContext,
    fixerModel,
    loopResult.errorManifest,
  );
}

function logRepairOutcome(
  chatId: string,
  versionId: string,
  method: "deterministic" | "llm",
  repaired: boolean,
  llmPasses: number,
  remainingErrors?: number,
  earlyStopReason?: "fixer_noop" | "no_improvement" | "time_budget_exceeded" | null,
  verifyContext?: {
    verifyLaneDurationMs: number;
    firstFailureCheck: string | null;
    jobStartedAt: string | null;
    jobFinishedAt: string | null;
  },
  fixerModelId?: string | null,
  errorManifest?: RepairErrorManifest | null,
) {
  createEngineVersionErrorLogs([{
    chatId,
    versionId,
    level: repaired ? "info" : "warning",
    category: "server-repair",
    message: repaired
      ? `Server repair succeeded (${method}).`
      : `Server repair incomplete (${method}, ${remainingErrors ?? "?"} errors remain${earlyStopReason ? `, ${earlyStopReason}` : ""}).`,
    meta: {
      ...buildServerRepairOutcomeMeta({
        method,
        llmPasses,
        repaired,
        remainingErrors,
        earlyStopReason,
        verifyLaneDurationMs: verifyContext?.verifyLaneDurationMs ?? 0,
        firstFailureCheck: verifyContext?.firstFailureCheck ?? null,
        jobStartedAt: verifyContext?.jobStartedAt ?? null,
        jobFinishedAt: verifyContext?.jobFinishedAt ?? null,
        errorManifest: errorManifest ?? null,
      }),
      ...(fixerModelId ? { fixerModelId } : {}),
    },
  }]).catch((err) => {
    console.warn("[server-verify] Failed to persist server-repair outcome log:", err);
  });
}

function buildRepairLogContextLines(params: {
  failedOutputs: ServerVerifyFailedOutput[];
  verifyLaneDurationMs: number;
  firstFailureCheck: string | null;
  jobStartedAt: string | null;
  jobFinishedAt: string | null;
  initialContent: string;
}): {
  errorManifest: RepairErrorManifest;
  contextLines: string[];
} {
  const baseLines = [
    ...buildServerVerifyRepairContextLines({
      failedOutputs: params.failedOutputs,
      verifyLaneDurationMs: params.verifyLaneDurationMs,
      firstFailureCheck: params.firstFailureCheck,
      jobStartedAt: params.jobStartedAt,
      jobFinishedAt: params.jobFinishedAt,
    }),
    ...buildRepairErrorContextLines(params.failedOutputs),
  ];
  const grouped = buildGroupedRepairErrorContext(params.failedOutputs, {
    projectContent: params.initialContent,
  });
  return {
    errorManifest: grouped.errorManifest,
    contextLines: [...grouped.contextLines, ...baseLines],
  };
}
