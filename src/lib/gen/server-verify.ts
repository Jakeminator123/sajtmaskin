/**
 * Server-side verify+repair loop.
 *
 * Triggered after finalize+sandbox in the generation stream as a
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
  createDraftVersion,
  getChat,
} from "@/lib/db/chat-repository-pg";
import { getVersionFiles } from "@/lib/gen/version-manager";
import { buildExportableProject } from "@/lib/gen/build-exportable-project";
import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import { runLlmFixer } from "@/lib/gen/autofix/llm-fixer";
import { parseCodeProject, type CodeFile } from "@/lib/gen/parser";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import {
  isQualityGateConfigured,
  runQualityGateOnExportable,
  qualityGateAllPassed,
  shouldPromoteAfterRepair,
} from "@/lib/gen/sandbox-quality-gate";
import { ownModelIdToCanonicalModelId } from "@/lib/models/catalog";
import { resolvePhaseModel } from "@/lib/models/phase-routing";
import { SERVER_REPAIR_MAX_PASSES } from "@/lib/gen/defaults";

const inflight = new Set<string>();

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
    const codeFiles = await getVersionFiles(versionId);
    if (!codeFiles || codeFiles.length === 0) return;

    await markVersionVerifying(versionId).catch(() => null);

    const exportable = buildExportableProject(codeFiles);
    const gateResult = await runQualityGateOnExportable({
      chatId,
      versionId,
      exportable,
      checks: ["typecheck", "build"],
    });
    if (!gateResult) {
      await failVersionVerification(versionId, "Quality gate unavailable during verification.").catch(() => null);
      return;
    }

    const passed = qualityGateAllPassed(gateResult.results);

    await createEngineVersionErrorLogs([{
      chatId,
      versionId,
      level: passed ? "info" : "error",
      category: "preflight:quality-gate",
      message: passed ? "Server verify passed." : "Server verify failed.",
      meta: {
        passed,
        checks: gateResult.results.map((r) => ({ check: r.check, passed: r.passed, exitCode: r.exitCode })),
        durationMs: gateResult.sandboxDurationMs,
        serverOwned: true,
      },
    }]).catch(() => {});

    if (passed) {
      await promoteVersion(versionId, "Automatic server verification passed.").catch(() => null);
      return;
    }

    const failedOutputs = gateResult.results
      .filter((r) => !r.passed)
      .map((r) => ({ check: r.check, exitCode: r.exitCode, output: r.output }));

    await tryServerRepairLoop({
      chatId,
      versionId,
      codeFiles,
      failedOutputs,
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
  failedOutputs: Array<{ check: string; exitCode: number; output: string }>;
}): Promise<void> {
  const { chatId, versionId, codeFiles, failedOutputs } = params;
  const hadQualityGateFailures = failedOutputs.length > 0;

  await markVersionRepairing(versionId).catch(() => null);

  const exportable = buildExportableProject(codeFiles);
  let content = filesToCodeProjectContent(exportable);

  const autoFixResult = await runAutoFix(content);
  content = autoFixResult.fixedContent;

  const { validateGeneratedCode } = await import("@/lib/gen/retry/validate-syntax");
  let syntaxResult = await validateGeneratedCode(content);

  async function tryPromoteAfterGate(projectContent: string, method: "deterministic" | "llm"): Promise<boolean> {
    const decision = await shouldPromoteAfterRepair({
      chatId,
      versionId,
      exportable: buildExportableProject(parseCodeProject(projectContent).files),
      hadQualityGateFailures,
    });
    await createEngineVersionErrorLogs([
      {
        chatId,
        versionId,
        level: decision.promote ? "info" : "warning",
        category: "preflight:quality-gate",
        message: decision.promote
          ? `Post-repair quality gate passed (${method}).`
          : "Post-repair quality gate did not pass; not promoting.",
        meta: {
          repass: true,
          method,
          promoted: decision.promote,
          checks: decision.results?.map((r) => ({ check: r.check, passed: r.passed })),
          sandboxDurationMs: decision.sandboxDurationMs,
          serverOwned: true,
        },
      },
    ]).catch(() => {});
    if (!decision.promote) return false;
    const filesJson = JSON.stringify(parseCodeProject(projectContent).files);
    const version = await createDraftVersion(chatId, null, filesJson);
    const msg =
      method === "deterministic"
        ? "Server repair succeeded (deterministic); quality gate re-passed."
        : "Server repair succeeded (LLM); quality gate re-passed.";
    await promoteVersion(version.id, msg).catch(() => null);
    return true;
  }

  if (syntaxResult.valid) {
    if (await tryPromoteAfterGate(content, "deterministic")) {
      logRepairOutcome(chatId, versionId, "deterministic", true, 0);
      return;
    }
  }

  const errorLines: string[] = [];
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
  for (let pass = 0; pass < SERVER_REPAIR_MAX_PASSES; pass++) {
    if (syntaxResult.errors.length > bestErrorCount && bestErrorCount < Infinity) {
      content = bestContent;
      syntaxResult = await validateGeneratedCode(content);
    }
    const errorSummary = [
      ...syntaxResult.errors.map((e) => `${e.file}:${e.line}:${e.column} ${e.message}`),
      ...errorLines,
    ].slice(0, 50);
    const brokenFiles = [...new Set([
      ...syntaxResult.errors.map((e) => e.file).filter(Boolean),
      ...filesFromGateOutput,
    ])];

    const fixerResult = await runLlmFixer(content, errorSummary, {
      model: fixerModel,
      requiredFiles: brokenFiles,
    });
    llmPasses++;
    if (!fixerResult.success && !fixerResult.partial) continue;

    const reFixed = await runAutoFix(fixerResult.fixedContent);
    content = reFixed.fixedContent;
    syntaxResult = await validateGeneratedCode(content);

    if (syntaxResult.errors.length < bestErrorCount) {
      bestErrorCount = syntaxResult.errors.length;
      bestContent = content;
    }
    if (syntaxResult.valid) break;
  }

  const syntaxClean = bestErrorCount === 0;
  if (syntaxClean) {
    if (await tryPromoteAfterGate(bestContent, "llm")) {
      logRepairOutcome(chatId, versionId, "llm", true, llmPasses, 0);
      return;
    }
    await failVersionVerification(
      versionId,
      "Server repair: syntax clean but quality gate still failing.",
    ).catch(() => null);
    logRepairOutcome(chatId, versionId, "llm", false, llmPasses, 0);
    return;
  }

  await failVersionVerification(
    versionId,
    `Server repair incomplete (${bestErrorCount} errors remain).`,
  ).catch(() => null);
  logRepairOutcome(chatId, versionId, "llm", false, llmPasses, bestErrorCount);
}

function logRepairOutcome(
  chatId: string,
  versionId: string,
  method: "deterministic" | "llm",
  repaired: boolean,
  llmPasses: number,
  remainingErrors?: number,
) {
  createEngineVersionErrorLogs([{
    chatId,
    versionId,
    level: repaired ? "info" : "warning",
    category: "server-repair",
    message: repaired
      ? `Server repair succeeded (${method}).`
      : `Server repair incomplete (${method}, ${remainingErrors ?? "?"} errors remain).`,
    meta: { method, llmPasses, repaired, remainingErrors, serverOwned: true },
  }]).catch(() => {});
}
