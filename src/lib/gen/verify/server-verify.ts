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
  updateVersionFiles,
  getChat,
  getLatestVersion,
  markVersionSupersededByRepair,
} from "@/lib/db/chat-repository-pg";
import { getVersionFiles } from "@/lib/gen/version-manager";
import { buildExportableProject } from "@/lib/gen/export/build-exportable-project";
import { parseCodeProject, serializeCodeProject, type CodeFile } from "@/lib/gen/parser";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { SERVER_VERIFY_QUALITY_GATE_CHECKS } from "./quality-gate-checks";
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
import { buildRepairErrorContextLines, runRepairLoop } from "./repair-loop";
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
}): Promise<void> {
  const { chatId, versionId } = params;
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
      checks: SERVER_VERIFY_QUALITY_GATE_CHECKS,
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

async function tryServerRepairLoop(params: {
  chatId: string;
  versionId: string;
  codeFiles: CodeFile[];
  failedOutputs: ServerVerifyFailedOutput[];
  verifyLaneDurationMs: number;
  firstFailureCheck: string | null;
  jobStartedAt: string | null;
  jobFinishedAt: string | null;
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
      checks: SERVER_VERIFY_QUALITY_GATE_CHECKS,
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
          ? "Server repair succeeded (deterministic); quality gate re-passed."
          : "Server repair succeeded (LLM); quality gate re-passed.";
      const updated = await updateVersionFiles(versionId, filesJson).catch((err) => {
        console.warn("[server-verify] Failed to update repaired version files:", err);
        return false;
      });
      if (updated) {
        const promotedVersion = await promoteVersion(versionId, msg).catch((err) => {
          console.warn("[server-verify] Failed to promote repaired version:", err);
          return null;
        });
        promoted = Boolean(promotedVersion);
      }
    }
    await createEngineVersionErrorLogs([
      {
        chatId,
        versionId,
        level: promoted ? "info" : "warning",
        category: "preflight:quality-gate",
        message: promoted
          ? `Post-repair quality gate passed (${method}).`
          : decision.promote
            ? `Post-repair quality gate passed but promotion failed (${method}).`
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

  const repairContextLines = [
    ...buildServerVerifyRepairContextLines({
      failedOutputs,
      verifyLaneDurationMs,
      firstFailureCheck,
      jobStartedAt,
      jobFinishedAt,
    }),
    ...buildRepairErrorContextLines(failedOutputs),
  ];

  const loopResult = await runRepairLoop({
    initialContent,
    failedOutputs,
    contextLines: repairContextLines,
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
      }),
      ...(fixerModelId ? { fixerModelId } : {}),
    },
  }]).catch((err) => {
    console.warn("[server-verify] Failed to persist server-repair outcome log:", err);
  });
}
