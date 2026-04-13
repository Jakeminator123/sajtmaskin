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
import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import { runLlmFixer } from "@/lib/gen/autofix/llm-fixer";
import { parseCodeProject, type CodeFile } from "@/lib/gen/parser";
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
import { resolvePhaseModel } from "@/lib/models/phase-routing";
import { SERVER_REPAIR_MAX_PASSES } from "@/lib/gen/defaults";
import { resolveServerRepairEarlyStopReason } from "./server-repair-policy";
import { buildLintRepairContextLines } from "./lint-output";
import {
  buildServerVerifyQualityGateMeta,
  buildServerVerifyRepairContextLines,
  buildServerRepairOutcomeMeta,
  compactVisualQAForQualityGateLog,
  type ServerVerifyFailedOutput,
} from "./server-verify-log-meta";

const inflight = new Set<string>();
const SERVER_REPAIR_LLM_TIMEOUT_MS = 60_000;

export function isServerVerifyEligible(versionId: string): boolean {
  if (!dbConfigured) return false;
  if (!isQualityGateConfigured()) return false;
  if (inflight.has(versionId)) return false;
  return true;
}

function filesToCodeProjectContent(files: CodeFile[]): string {
  return files
    .map((f) => `\`\`\`${f.language || "tsx"} file="${f.path}"\n${f.content}\n\`\`\``)
    .join("\n\n");
}

function uniqueContextLines(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }
  return result;
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
  let content = filesToCodeProjectContent(exportable);

  const autoFixResult = await runAutoFix(content);
  content = autoFixResult.fixedContent;

  const { validateGeneratedCode } = await import("@/lib/gen/retry/validate-syntax");
  let syntaxResult = await validateGeneratedCode(content);

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

  if (syntaxResult.valid) {
    if (await tryPromoteAfterGate(content, "deterministic")) {
      logRepairOutcome(chatId, versionId, "deterministic", true, 0, undefined, undefined, verifyContext);
      return;
    }
  }

  const errorLines = buildServerVerifyRepairContextLines({
    failedOutputs,
    verifyLaneDurationMs,
    firstFailureCheck,
    jobStartedAt,
    jobFinishedAt,
  });
  for (const failure of failedOutputs) {
    if (failure.check === "lint") {
      errorLines.push(...buildLintRepairContextLines(failure.output));
    }
  }
  for (const f of failedOutputs) {
    const outputLines = f.output.split("\n");
    for (let i = 0; i < outputLines.length; i++) {
      const stripped = outputLines[i].trim();
      if (!stripped) continue;
      if (/error\b|TS\d{4}|ERR!|FAIL/i.test(stripped)) {
        const prevLine = i > 0 ? outputLines[i - 1]?.trim() : "";
        if (prevLine && !errorLines.includes(`[${f.check}] ${prevLine}`)) {
          errorLines.push(`[${f.check}] ${prevLine}`);
        }
        errorLines.push(`[${f.check}] ${stripped}`);
      }
      if (errorLines.length > 60) break;
    }
  }

  const filesFromGateOutput = new Set<string>();
  for (const line of errorLines) {
    const fileMatch = line.match(/]\s*([^\s:]+\.\w{2,4}):/);
    if (fileMatch?.[1]) filesFromGateOutput.add(fileMatch[1]);
  }

  let bestContent = content;
  let bestErrorCount = syntaxResult.errors.length;
  const originatingChat = await getChat(chatId).catch(() => null);
  const originatingTier = ownModelIdToCanonicalModelId(originatingChat?.model ?? null);
  const fixerModel = originatingTier
    ? resolvePhaseModel(originatingTier, "fixer").modelId
    : undefined;

  let llmPasses = 0;
  let earlyStopReason: "fixer_noop" | "no_improvement" | "time_budget_exceeded" | null = null;
  for (let pass = 0; pass < SERVER_REPAIR_MAX_PASSES; pass++) {
    if (syntaxResult.errors.length > bestErrorCount && bestErrorCount < Infinity) {
      content = bestContent;
      syntaxResult = await validateGeneratedCode(content);
    }
    const errorsBefore = syntaxResult.errors.length;
    const errorSummary = uniqueContextLines([
      ...syntaxResult.errors.map((e) => `${e.file}:${e.line}:${e.column} ${e.message}`),
      ...errorLines,
    ], 50);
    const brokenFiles = [...new Set([
      ...syntaxResult.errors.map((e) => e.file).filter(Boolean),
      ...filesFromGateOutput,
    ])];

    const fixerAbort = new AbortController();
    const timeoutHandle = setTimeout(() => fixerAbort.abort(), SERVER_REPAIR_LLM_TIMEOUT_MS);
    let fixerResult: Awaited<ReturnType<typeof runLlmFixer>>;
    try {
      fixerResult = await runLlmFixer(content, errorSummary, {
        model: fixerModel,
        requiredFiles: brokenFiles,
        abortSignal: fixerAbort.signal,
      });
    } finally {
      clearTimeout(timeoutHandle);
    }
    llmPasses++;
    if (!fixerResult.success && !fixerResult.partial) {
      const stopReason = resolveServerRepairEarlyStopReason({
        fixerProducedOutput: false,
        errorsBefore,
        errorsAfter: errorsBefore,
        timedOut: fixerAbort.signal.aborted,
      });
      earlyStopReason = stopReason === "continue" ? null : stopReason;
      break;
    }

    const reFixed = await runAutoFix(fixerResult.fixedContent);
    content = reFixed.fixedContent;
    syntaxResult = await validateGeneratedCode(content);
    const stopReason = resolveServerRepairEarlyStopReason({
      fixerProducedOutput: true,
      errorsBefore,
      errorsAfter: syntaxResult.errors.length,
      timedOut: false,
    });

    if (syntaxResult.errors.length < bestErrorCount) {
      bestErrorCount = syntaxResult.errors.length;
      bestContent = content;
    }
    if (stopReason !== "continue") {
      earlyStopReason = stopReason;
      break;
    }
    if (syntaxResult.valid) break;
  }

  const syntaxClean = bestErrorCount === 0;
  if (syntaxClean) {
    if (await tryPromoteAfterGate(bestContent, "llm")) {
      logRepairOutcome(chatId, versionId, "llm", true, llmPasses, 0, undefined, verifyContext);
      return;
    }
    await failVersionVerification(
      versionId,
      "Server repair: syntax clean but quality gate still failing.",
    ).catch(() => null);
    logRepairOutcome(chatId, versionId, "llm", false, llmPasses, 0, earlyStopReason, verifyContext);
    return;
  }

  await failVersionVerification(
    versionId,
    `Server repair incomplete (${bestErrorCount} errors remain).`,
  ).catch(() => null);
  logRepairOutcome(chatId, versionId, "llm", false, llmPasses, bestErrorCount, earlyStopReason, verifyContext);
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
) {
  createEngineVersionErrorLogs([{
    chatId,
    versionId,
    level: repaired ? "info" : "warning",
    category: "server-repair",
    message: repaired
      ? `Server repair succeeded (${method}).`
      : `Server repair incomplete (${method}, ${remainingErrors ?? "?"} errors remain${earlyStopReason ? `, ${earlyStopReason}` : ""}).`,
    meta: buildServerRepairOutcomeMeta({
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
  }]).catch((err) => {
    console.warn("[server-verify] Failed to persist server-repair outcome log:", err);
  });
}
