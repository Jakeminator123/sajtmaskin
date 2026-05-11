import { generateCode } from "../engine";
import { ENGINE_MAX_OUTPUT_TOKENS } from "../defaults";
import { dumpOwnEngineCodegenFromFullSystem } from "../prompt-dump";
import { prepareGenerationContext } from "../orchestrate";
import { parseCodeProject, serializeCodeProject, type CodeFile } from "../parser";
import { runAutoFix } from "../autofix/pipeline";
import { DEFAULT_MODEL } from "../models";
import { DB_ENV_VARS, resolveConfiguredDbEnv } from "@/lib/db/env";
import { buildCompleteProject } from "../export/project-scaffold";
import { collectRequiredUiComponents } from "../export/project-scaffold-ui-reader";
import { runFinalizePreflight } from "../stream/finalize-preflight";
import { runSeoPreflightChecks } from "../validation/seo-preflight";
import { partitionGeneratedFilesForProtectedPaths } from "../scaffolds/protected-paths";
import { EVAL_PROMPTS, type EvalPrompt } from "./prompts";
import {
  createEvalRunId,
  resolveEvalDumpMode,
  writeEvalArtifacts,
  writeEvalSuiteSummary,
  type EvalDumpMode,
  type EvalPromptArtifactRecord,
} from "./artifact-dump";
import {
  checkProjectSanity,
  checkNoBracketPlaceholders,
  checkSeoPublishReadiness,
  checkTier2Readiness,
  checkVisualQuality,
  checkFileCount,
  checkRequiredFiles,
  checkExports,
  checkImports,
  checkSyntax,
  checkResponsive,
  checkAccessibility,
  checkSemanticTokens,
  type CheckResult,
} from "./checks";

export type EvalGenerationStatus = "skipped" | "passed" | "failed";
export type EvalFailureStage = "preflight_env" | "generation" | null;

export interface EvalResult {
  promptId: string;
  generationStatus: EvalGenerationStatus;
  failureStage: EvalFailureStage;
  generationTimeMs: number;
  fileCount: number;
  finalProjectFiles: number;
  generatedSurfaceFiles: number;
  scaffoldId: string | null;
  variantId: string | null;
  promptSize: {
    totalChars: number;
    totalEstimatedTokens: number;
    staticCoreChars: number;
    staticCoreEstimatedTokens: number;
    dynamicContextChars: number;
    dynamicContextEstimatedTokens: number;
    dynamicBudgetUsedTokens: number;
    dynamicBudgetBudgetTokens: number;
    droppedBlocks: number;
    largestBlocks: Array<{
      title: string;
      chars: number;
      estimatedTokens: number;
      kept: boolean;
      required: boolean;
    }>;
  };
  preflight: {
    errors: number;
    warnings: number;
    previewBlocked: boolean;
    previewBlockingReason: string | null;
  };
  droppedProtectedPaths: string[];
  checks: CheckResult[];
  totalScore: number;
  passed: boolean;
  blockingChecks: string[];
}

export interface EvalSummary {
  total: number;
  passed: number;
  avgScore: number;
  avgTimeMs: number;
  blockingFailures: number;
  blockingCheckCounts: Record<string, number>;
}

export interface EvalReport {
  timestamp: string;
  model: string;
  results: EvalResult[];
  summary: EvalSummary;
}

const CRITICAL_EVAL_CHECKS = new Set([
  "project-sanity",
  "tier2-readiness",
  "seo-publish-readiness",
  "no-bracket-placeholders",
  "required-files",
  "exports",
  "imports",
  "syntax",
  "preflight_env",
]);

const MISSING_DB_ENV_MESSAGE =
  "preflight=failed_env: missing database connection string. " +
  `Set one of ${DB_ENV_VARS.join(", ")} before running codegen evals.`;

export function resolveEvalEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; dbEnvName: string } | { ok: false; message: string } {
  const configuredDb = resolveConfiguredDbEnv(env);
  if (!configuredDb) {
    return { ok: false, message: MISSING_DB_ENV_MESSAGE };
  }

  return { ok: true, dbEnvName: configuredDb.name };
}

function makePreflightEnvFailureResult(evalPrompt: EvalPrompt, message: string): EvalResult {
  return {
    promptId: evalPrompt.id,
    generationStatus: "skipped",
    failureStage: "preflight_env",
    generationTimeMs: 0,
    fileCount: 0,
    finalProjectFiles: 0,
    generatedSurfaceFiles: 0,
    scaffoldId: null,
    variantId: null,
    promptSize: {
      totalChars: 0,
      totalEstimatedTokens: 0,
      staticCoreChars: 0,
      staticCoreEstimatedTokens: 0,
      dynamicContextChars: 0,
      dynamicContextEstimatedTokens: 0,
      dynamicBudgetUsedTokens: 0,
      dynamicBudgetBudgetTokens: 0,
      droppedBlocks: 0,
      largestBlocks: [],
    },
    preflight: {
      errors: 1,
      warnings: 0,
      previewBlocked: true,
      previewBlockingReason: "failed_env",
    },
    droppedProtectedPaths: [],
    checks: [
      {
        name: "preflight_env",
        passed: false,
        message,
        score: 0,
      },
    ],
    totalScore: 0,
    passed: false,
    blockingChecks: ["preflight_env"],
  };
}

/**
 * Sources used by the per-prompt gate checks in `evaluatePrompt`.
 *
 * Pre-2026-04-27 the harness ran every check against the raw LLM
 * emission (`project.files` / `fixedContent`). That meant
 * `SCAFFOLD_PROTECTED_PATHS` (which drops broken JSX-in-`.ts`
 * `app/api/placeholder/route.ts` emissions before they ever persist)
 * could not improve the eval score: the broken file was filtered out
 * of the canonical persist payload but the syntax check still saw it
 * in the raw output. Eval reported a runtime-correct fix as a failure.
 *
 * `deriveEvalCheckSources` returns four views so each check can pick
 * the right one:
 *
 * - `rawFiles` — the LLM's post-mechanical-autofix emission. Use for
 *   *content quality* checks where the LLM's output itself is the
 *   signal: `no-bracket-placeholders`, `responsive`, `accessibility`,
 *   `semantic-tokens`.
 *
 * - `generatedSurfaceFiles` — the filtered subset of `rawFiles` that counts
 *   as generated app surface for `file-count`. Excludes config, API routes,
 *   metadata/image routes and other scaffold/runtime support paths so the
 *   eval reports "surface/final" instead of conflating app files with the
 *   complete runnable Next project.
 *
 * - `canonicalRuntimeFiles` — full post-preflight payload. Use for
 *   runtime-readiness checks where deterministic additions from
 *   preflight (`package.json`, materialized helper files, etc.) are
 *   part of the truth: `project-sanity`, `imports`, `required-files`,
 *   `exports`, and (via `canonicalContent`) `syntax`.
 *
 * - `canonicalFiles` — the user-emitted subset of the post-preflight
 *   payload. Kept for diagnostics and for future checks that need to
 *   distinguish model-authored files from deterministic scaffold /
 *   preflight additions.
 *
 * - `canonicalContent` — `serializeCodeProject(canonicalRuntimeFiles)`,
 *   the syntax-check input matching the runtime payload.
 *
 * - `droppedProtectedPaths` — paths the protected-paths guard removed
 *   between raw and canonical. Surfaced for telemetry only; not a
 *   blocker by itself (the canonical payload still has them, with the
 *   scaffold default content).
 */
export interface EvalCheckSources {
  rawFiles: CodeFile[];
  canonicalRuntimeFiles: CodeFile[];
  canonicalFiles: CodeFile[];
  generatedSurfaceFiles: CodeFile[];
  canonicalContent: string;
  droppedProtectedPaths: string[];
}

function isGeneratedSurfacePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  if (!normalized) return false;
  if (normalized === "package.json") return false;
  if (/^(next|postcss|tailwind|tsconfig|eslint)\.config\./.test(normalized)) return false;
  if (/^\.[^/]+/.test(normalized)) return false;
  if (/^app\/api\//.test(normalized)) return false;
  if (/^app\/(?:icon|apple-icon|opengraph-image|twitter-image)\./.test(normalized)) return false;
  if (/^app\/(?:manifest|robots|sitemap)\./.test(normalized)) return false;
  if (/(^|\/)(loading|error|not-found|template)\.(tsx|jsx|ts|js)$/.test(normalized)) return false;
  if (/^hooks\/use-reduced-motion\.ts$/.test(normalized)) return false;
  if (/^lib\/utils\.(ts|tsx)$/.test(normalized)) return false;
  return true;
}

export function deriveEvalCheckSources(params: {
  rawFiles: CodeFile[];
  preflightFilesJson: string;
}): EvalCheckSources {
  const { rawFiles, preflightFilesJson } = params;

  const partition = partitionGeneratedFilesForProtectedPaths(rawFiles);
  const droppedProtectedPaths = partition.dropped.map((f) => f.path);

  let canonicalAll: CodeFile[] = [];
  try {
    const parsed = JSON.parse(preflightFilesJson) as Array<{
      path: string;
      content: string;
      language?: string;
    }>;
    canonicalAll = parsed.map((file) => ({
      ...file,
      language: file.language || "tsx",
    }));
  } catch {
    canonicalAll = [];
  }

  const userEmittedPaths = new Set(rawFiles.map((f) => f.path));
  const canonicalRuntimeFiles = canonicalAll;
  const canonicalFiles = canonicalRuntimeFiles.filter((f) => userEmittedPaths.has(f.path));
  const generatedSurfaceFiles = rawFiles.filter((f) => isGeneratedSurfacePath(f.path));
  const canonicalContent = serializeCodeProject(canonicalRuntimeFiles);

  return {
    rawFiles,
    canonicalRuntimeFiles,
    canonicalFiles,
    generatedSurfaceFiles,
    canonicalContent,
    droppedProtectedPaths,
  };
}

export function resolveEvalPassOutcome(params: {
  checks: CheckResult[];
  shouldCompile: boolean;
  totalScore: number;
}): { passed: boolean; blockingChecks: string[] } {
  const { checks, shouldCompile, totalScore } = params;
  const syntaxCheck = checks.find((check) => check.name === "syntax");
  const compileOk = !shouldCompile || syntaxCheck?.passed !== false;
  const blockingChecks = checks
    .filter((check) => CRITICAL_EVAL_CHECKS.has(check.name) && !check.passed)
    .map((check) => check.name);

  return {
    passed: compileOk && blockingChecks.length === 0 && totalScore >= 0.6,
    blockingChecks,
  };
}

async function collectSSEContent(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let accumulated = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith("data: ")) continue;

        const prevLine = i > 0 ? lines[i - 1] : "";
        if (prevLine !== "event: content") continue;

        try {
          const payload = JSON.parse(line.slice(6)) as { text?: string };
          if (payload.text) {
            accumulated += payload.text;
          }
        } catch {
          // malformed JSON — skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return accumulated;
}

async function recordPromptArtifacts(params: {
  runId: string;
  dumpMode: EvalDumpMode;
  prompt: EvalPrompt;
  result: EvalResult;
  stages?: Parameters<typeof writeEvalArtifacts>[0]["stages"];
}): Promise<EvalPromptArtifactRecord | null> {
  try {
    return await writeEvalArtifacts(params);
  } catch (err) {
    console.warn(
      `[eval] Failed to write artifacts for ${params.prompt.id}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

async function evaluatePrompt(
  evalPrompt: EvalPrompt,
  model: string,
  artifactContext: { runId: string; dumpMode: EvalDumpMode },
): Promise<{ result: EvalResult; artifact: EvalPromptArtifactRecord | null }> {
  const start = performance.now();

  // Run the full orchestration pipeline so eval tests the SAME system prompt
  // that production generates (scaffold, route plan, contracts, variant,
  // capability hints, references, ...). Previously this used a thin
  // `buildSystemPrompt({ intent })` shortcut that silently produced a much
  // weaker prompt than prod — eval results were therefore not representative.
  // Disable embedding scaffold matching to keep eval deterministic and offline.
  const generationInput = await prepareGenerationContext({
    prompt: evalPrompt.prompt,
    buildIntent: evalPrompt.intent,
    scaffoldMode: "auto",
    embeddingScaffoldMatch: false,
    sessionSeed: `eval_${evalPrompt.id}`,
  });
  const systemPrompt = generationInput.engineSystemPrompt;
  dumpOwnEngineCodegenFromFullSystem(systemPrompt, { source: "eval/runner" });

  const stream = generateCode({
    prompt: evalPrompt.prompt,
    systemPrompt,
    model,
    thinking: false,
    maxTokens: ENGINE_MAX_OUTPUT_TOKENS,
  });

  const content = await collectSSEContent(stream);
  const generationTimeMs = Math.round(performance.now() - start);

  // Eval path: standalone mechanical pass on raw stream content. Mirrors the
  // outer autofix in finalize-version.ts but without the surrounding pipeline.
  const { fixedContent } = await runAutoFix(content);
  const rawProject = parseCodeProject(content);
  const project = parseCodeProject(fixedContent);
  // Dynamic import keeps runner.test.ts able to import pure helpers
  // without pulling the finalize stack (and its database side imports)
  // into the test process.
  const { mergeGeneratedProjectFiles } = await import("../stream/finalize-merge");
  const mergeResult = mergeGeneratedProjectFiles({
    chatId: `eval_${evalPrompt.id}`,
    originalFilesJson: JSON.stringify(project.files),
    generatedFiles: project.files,
    resolvedScaffold: generationInput.resolvedScaffold,
  });
  const mergedFiles = (
    JSON.parse(mergeResult.filesJson) as Array<{
      path: string;
      content: string;
      language?: string;
    }>
  ).map((file) => ({ ...file, language: file.language || "tsx" }));
  const completeProjectFiles = buildCompleteProject(
    mergedFiles,
    collectRequiredUiComponents(mergedFiles),
  );
  const seoIssues = runSeoPreflightChecks(completeProjectFiles);
  const preflight = await runFinalizePreflight({
    chatId: `eval_${evalPrompt.id}`,
    model,
    filesJson: mergeResult.filesJson,
    buildSpec: generationInput.buildSpec,
    routePlan: generationInput.routePlan,
    orchestrationContract: generationInput.orchestrationContract,
    originalPrompt: evalPrompt.prompt,
  });

  const sources = deriveEvalCheckSources({
    rawFiles: project.files,
    preflightFilesJson: preflight.filesJson,
  });

  if (sources.droppedProtectedPaths.length > 0) {
    // Telemetry-only. The protected-paths guard removed these LLM
    // emissions from the canonical persist payload upstream; eval gate
    // checks therefore measure the scaffold-version content, not the
    // raw LLM-broken version. Logged so eval-report readers can
    // distinguish "model emitted a broken protected path but the
    // pipeline corrected it" (acceptable) from "model emitted an
    // unrelated bug" (real regression).
    console.info(
      `[eval] ${evalPrompt.id}: dropped scaffold-protected paths from canonical eval input: ${sources.droppedProtectedPaths.join(", ")}`,
    );
  }

  const checks: CheckResult[] = [
    checkProjectSanity(sources.canonicalRuntimeFiles),
    checkNoBracketPlaceholders(sources.rawFiles),
    checkSeoPublishReadiness(seoIssues),
    checkTier2Readiness(preflight),
    checkVisualQuality(completeProjectFiles),
    checkFileCount(
      sources.generatedSurfaceFiles,
      evalPrompt.expected.minFiles,
      evalPrompt.expected.maxFiles,
    ),
    checkRequiredFiles(sources.canonicalRuntimeFiles, evalPrompt.expected.requiredFiles),
    checkExports(sources.canonicalRuntimeFiles),
    checkImports(sources.canonicalRuntimeFiles, evalPrompt.expected.requiredImports),
    checkResponsive(sources.rawFiles),
    checkAccessibility(sources.rawFiles),
    checkSemanticTokens(sources.rawFiles),
  ];

  if (evalPrompt.expected.shouldCompile) {
    checks.push(await checkSyntax(sources.canonicalContent));
  }

  const totalScore =
    checks.length > 0
      ? checks.reduce((sum, c) => sum + c.score, 0) / checks.length
      : 0;

  const passOutcome = resolveEvalPassOutcome({
    checks,
    shouldCompile: evalPrompt.expected.shouldCompile,
    totalScore,
  });

  const result: EvalResult = {
    promptId: evalPrompt.id,
    generationStatus: "passed",
    failureStage: null,
    generationTimeMs,
    fileCount: sources.generatedSurfaceFiles.length,
    finalProjectFiles: sources.canonicalRuntimeFiles.length,
    generatedSurfaceFiles: sources.generatedSurfaceFiles.length,
    scaffoldId: generationInput.resolvedScaffold?.id ?? null,
    variantId: generationInput.variantId ?? null,
    promptSize: {
      totalChars: generationInput.promptSize.total.chars,
      totalEstimatedTokens: generationInput.promptSize.total.estimatedTokens,
      staticCoreChars: generationInput.promptSize.staticCore.chars,
      staticCoreEstimatedTokens: generationInput.promptSize.staticCore.estimatedTokens,
      dynamicContextChars: generationInput.promptSize.dynamicContext.chars,
      dynamicContextEstimatedTokens:
        generationInput.promptSize.dynamicContext.estimatedTokens,
      dynamicBudgetUsedTokens: generationInput.promptSize.dynamicBudget.usedTokens,
      dynamicBudgetBudgetTokens: generationInput.promptSize.dynamicBudget.budgetTokens,
      droppedBlocks: generationInput.promptSize.dynamicBudget.droppedBlocks,
      largestBlocks: generationInput.promptSize.blocks.largest
        .slice(0, 10)
        .map((block) => ({
          title: block.title,
          chars: block.chars,
          estimatedTokens: block.estimatedTokens,
          kept: block.kept,
          required: block.required,
        })),
    },
    preflight: {
      errors: preflight.preflightIssues.filter((issue) => issue.severity === "error").length,
      warnings: preflight.preflightIssues.filter((issue) => issue.severity === "warning").length,
      previewBlocked: !preflight.previewStart.canStartPreview,
      previewBlockingReason: preflight.previewBlockingReason,
    },
    droppedProtectedPaths: sources.droppedProtectedPaths,
    checks,
    totalScore,
    passed: passOutcome.passed,
    blockingChecks: passOutcome.blockingChecks,
  };

  const artifact = await recordPromptArtifacts({
    ...artifactContext,
    prompt: evalPrompt,
    result,
    stages: {
      rawContent: content,
      fixedContent,
      rawFiles: rawProject.files,
      fixedFiles: project.files,
      mergedFiles,
      completeProjectFiles,
      sources,
      preflight,
    },
  });

  return { result, artifact };
}

export async function runEval(
  options?: {
    model?: string;
    prompts?: EvalPrompt[];
    dumpMode?: EvalDumpMode;
    runId?: string;
  },
): Promise<EvalReport> {
  const model = options?.model ?? DEFAULT_MODEL;
  const prompts = options?.prompts ?? EVAL_PROMPTS;
  const runId = options?.runId ?? createEvalRunId();
  const dumpMode = options?.dumpMode ?? resolveEvalDumpMode();
  const environment = resolveEvalEnvironment();
  const promptArtifacts: EvalPromptArtifactRecord[] = [];

  if (!environment.ok) {
    console.error(`[eval] ${environment.message}`);
    const results = prompts.map((prompt) =>
      makePreflightEnvFailureResult(prompt, environment.message),
    );
    const blockingCheckCounts = { preflight_env: results.length };
    const report = {
      timestamp: new Date().toISOString(),
      model,
      results,
      summary: {
        total: results.length,
        passed: 0,
        avgScore: 0,
        avgTimeMs: 0,
        blockingFailures: results.length,
        blockingCheckCounts,
      },
    };
    await writeEvalSuiteSummary({ runId, report, promptArtifacts });
    return report;
  }

  const results: EvalResult[] = [];

  for (const evalPrompt of prompts) {
    try {
      console.info(`[eval] Running: ${evalPrompt.id}...`);
      const { result, artifact } = await evaluatePrompt(evalPrompt, model, {
        runId,
        dumpMode,
      });
      if (artifact) promptArtifacts.push(artifact);
      results.push(result);
      console.info(
        `[eval] ${evalPrompt.id}: score=${(result.totalScore * 100).toFixed(0)}% ` +
          `files=${result.fileCount} time=${result.generationTimeMs}ms ` +
          `${result.passed ? "PASS" : "FAIL"}`,
      );
    } catch (err) {
      console.error(
        `[eval] ${evalPrompt.id} failed:`,
        err instanceof Error ? err.message : err,
      );
      const result: EvalResult = {
        promptId: evalPrompt.id,
        generationStatus: "failed",
        failureStage: "generation",
        generationTimeMs: 0,
        fileCount: 0,
        finalProjectFiles: 0,
        generatedSurfaceFiles: 0,
        scaffoldId: null,
        variantId: null,
        promptSize: {
          totalChars: 0,
          totalEstimatedTokens: 0,
          staticCoreChars: 0,
          staticCoreEstimatedTokens: 0,
          dynamicContextChars: 0,
          dynamicContextEstimatedTokens: 0,
          dynamicBudgetUsedTokens: 0,
          dynamicBudgetBudgetTokens: 0,
          droppedBlocks: 0,
          largestBlocks: [],
        },
        preflight: {
          errors: 1,
          warnings: 0,
          previewBlocked: true,
          previewBlockingReason: err instanceof Error ? err.message : "generation_failed",
        },
        droppedProtectedPaths: [],
        checks: [
          {
            name: "generation",
            passed: false,
            message: err instanceof Error ? err.message : "Unknown error",
            score: 0,
          },
        ],
        totalScore: 0,
        passed: false,
        blockingChecks: ["generation"],
      };
      const artifact = await recordPromptArtifacts({
        runId,
        dumpMode,
        prompt: evalPrompt,
        result,
      });
      if (artifact) promptArtifacts.push(artifact);
      results.push(result);
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const avgScore =
    results.length > 0
      ? results.reduce((s, r) => s + r.totalScore, 0) / results.length
      : 0;
  const avgTimeMs =
    results.length > 0
      ? results.reduce((s, r) => s + r.generationTimeMs, 0) / results.length
      : 0;
  const blockingFailures = results.filter((r) => r.blockingChecks.length > 0).length;
  const blockingCheckCounts: Record<string, number> = {};
  for (const result of results) {
    for (const check of result.blockingChecks) {
      blockingCheckCounts[check] = (blockingCheckCounts[check] ?? 0) + 1;
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    model,
    results,
    summary: {
      total: results.length,
      passed,
      avgScore,
      avgTimeMs: Math.round(avgTimeMs),
      blockingFailures,
      blockingCheckCounts,
    },
  };
  await writeEvalSuiteSummary({ runId, report, promptArtifacts });
  return report;
}
