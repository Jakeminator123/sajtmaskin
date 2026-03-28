/**
 * Server-side verify+repair loop.
 *
 * Triggered after finalize+sandbox in the generation stream as a
 * fire-and-forget background task. Updates version verification state
 * on the DB; the UI reads server state via version polls.
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
} from "@/lib/db/chat-repository-pg";
import { getVersionFiles } from "@/lib/gen/version-manager";
import { buildExportableProject } from "@/lib/gen/build-exportable-project";
import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import { runLlmFixer } from "@/lib/gen/autofix/llm-fixer";
import { parseCodeProject, type CodeFile } from "@/lib/gen/parser";
import { createEngineVersionErrorLogs } from "@/lib/db/services";
import {
  isSandboxConfigured,
  resolveSandboxAccessCredentials,
  resolveSandboxTemplateGitUrl,
  isSafeRelativePath,
  getSandboxCommandTextOutput,
} from "@/lib/mcp/runtime-url";

const inflight = new Set<string>();
const MAX_REPAIR_PASSES = 2;

type CheckResult = { check: string; passed: boolean; exitCode: number; output: string };

export function isServerVerifyEligible(versionId: string): boolean {
  if (!dbConfigured) return false;
  if (!isSandboxConfigured()) return false;
  if (inflight.has(versionId)) return false;
  return true;
}

/**
 * Run quality gate checks (typecheck + build) in a Vercel Sandbox VM.
 * Returns null when sandbox is not configured.
 */
async function runQualityGateChecks(
  files: CodeFile[],
): Promise<{ results: CheckResult[]; durationMs: number } | null> {
  if (!isSandboxConfigured()) return null;
  const { Sandbox } = await import("@vercel/sandbox");
  const access = resolveSandboxAccessCredentials();
  const startMs = Date.now();

  const sandbox = await Sandbox.create({
    ...(access ?? {}),
    source: { type: "git", url: resolveSandboxTemplateGitUrl() },
    resources: { vcpus: 2 },
    timeout: 90_000,
    ports: [3000],
    runtime: "node24",
  });

  try {
    const safeFiles = files
      .filter((f) => f.content != null && isSafeRelativePath(f.path))
      .map((f) => ({ path: f.path, content: Buffer.from(f.content, "utf-8") }));
    if (safeFiles.length > 0) {
      await sandbox.writeFiles(safeFiles);
    }

    const installResult = await sandbox.runCommand({
      cmd: "bash",
      args: ["-c", "npm install --prefer-offline > /tmp/sv-install.log 2>&1; ec=$?; cat /tmp/sv-install.log; exit $ec"],
    });
    const installOutput = await getSandboxCommandTextOutput(installResult);
    if ((installResult.exitCode ?? 1) !== 0) {
      return {
        results: [{ check: "install", passed: false, exitCode: installResult.exitCode ?? 1, output: installOutput.slice(0, 16_000) }],
        durationMs: Date.now() - startMs,
      };
    }

    const checks = ["typecheck", "build"] as const;
    const commands: Record<string, string> = {
      typecheck: "npx tsc --noEmit",
      build: "npx next build",
    };
    const results: CheckResult[] = [];
    for (const check of checks) {
      const logFile = `/tmp/sv-${check}.log`;
      const script = `${commands[check]} > "${logFile}" 2>&1; ec=$?; cat "${logFile}" 2>/dev/null; exit $ec`;
      const r = await sandbox.runCommand({ cmd: "bash", args: ["-c", script] });
      const output = await getSandboxCommandTextOutput(r);
      results.push({
        check,
        passed: (r.exitCode ?? 1) === 0,
        exitCode: r.exitCode ?? 1,
        output: output.slice(0, 14_000),
      });
      if ((r.exitCode ?? 1) !== 0) break;
    }
    return { results, durationMs: Date.now() - startMs };
  } finally {
    try { await sandbox[Symbol.asyncDispose]?.(); } catch { /* best-effort cleanup */ }
  }
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
    const gateResult = await runQualityGateChecks(exportable);
    if (!gateResult) return;

    const passed = gateResult.results.every((r) => r.passed);

    await createEngineVersionErrorLogs([{
      chatId,
      versionId,
      level: passed ? "info" : "error",
      category: "preflight:quality-gate",
      message: passed ? "Server verify passed." : "Server verify failed.",
      meta: {
        passed,
        checks: gateResult.results.map((r) => ({ check: r.check, passed: r.passed, exitCode: r.exitCode })),
        durationMs: gateResult.durationMs,
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

  await markVersionRepairing(versionId).catch(() => null);

  const exportable = buildExportableProject(codeFiles);
  let content = filesToCodeProjectContent(exportable);

  const autoFixResult = await runAutoFix(content);
  content = autoFixResult.fixedContent;

  const { validateGeneratedCode } = await import("@/lib/gen/retry/validate-syntax");
  let syntaxResult = await validateGeneratedCode(content);

  if (syntaxResult.valid && failedOutputs.length === 0) {
    const repairedFiles = parseCodeProject(content).files;
    const filesJson = JSON.stringify(repairedFiles);
    const version = await createDraftVersion(chatId, null, filesJson);
    await promoteVersion(version.id, "Server repair succeeded (deterministic).").catch(() => null);
    logRepairOutcome(chatId, versionId, "deterministic", true, 0);
    return;
  }

  const errorLines: string[] = [];
  for (const f of failedOutputs) {
    for (const line of f.output.split("\n")) {
      const stripped = line.trim();
      if (stripped && /error\b|TS\d{4}|ERR!|FAIL/i.test(stripped)) {
        errorLines.push(`[${f.check}] ${stripped}`);
      }
      if (errorLines.length > 40) break;
    }
  }

  let bestContent = content;
  let bestErrorCount = syntaxResult.errors.length;

  for (let pass = 0; pass < MAX_REPAIR_PASSES; pass++) {
    const errorSummary = [
      ...syntaxResult.errors.map((e) => `${e.file}:${e.line}:${e.column} ${e.message}`),
      ...errorLines,
    ].slice(0, 50);
    const brokenFiles = [...new Set(syntaxResult.errors.map((e) => e.file).filter(Boolean))];

    const fixerResult = await runLlmFixer(content, errorSummary, { requiredFiles: brokenFiles });
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

  const repaired = bestErrorCount === 0;
  if (repaired) {
    const repairedFiles = parseCodeProject(bestContent).files;
    const filesJson = JSON.stringify(repairedFiles);
    const version = await createDraftVersion(chatId, null, filesJson);
    await promoteVersion(version.id, "Server repair succeeded (LLM).").catch(() => null);
  } else {
    await failVersionVerification(
      versionId,
      `Server repair incomplete (${bestErrorCount} errors remain).`,
    ).catch(() => null);
  }

  logRepairOutcome(chatId, versionId, "llm", repaired, MAX_REPAIR_PASSES, bestErrorCount);
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
