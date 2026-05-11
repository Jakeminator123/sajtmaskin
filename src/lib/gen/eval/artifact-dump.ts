import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CodeFile } from "../parser";
import type { RunFinalizePreflightResult } from "../stream/finalize-preflight";
import type { EvalCheckSources, EvalReport, EvalResult } from "./runner";
import type { EvalPrompt } from "./prompts";
import { formatEvalReport } from "./report";

export type EvalDumpMode = "off" | "failed" | "all";

const DEFAULT_RETENTION_PROMPT_DIRS = 60;

export interface EvalArtifactStages {
  rawContent: string;
  fixedContent: string;
  rawFiles: CodeFile[];
  fixedFiles: CodeFile[];
  mergedFiles: CodeFile[];
  completeProjectFiles: CodeFile[];
  sources: EvalCheckSources;
  preflight: RunFinalizePreflightResult;
}

export interface EvalPromptArtifactRecord {
  promptId: string;
  runDir: string;
  runDirRelative: string;
  filesDumped: boolean;
}

export interface EvalSuiteSummaryParams {
  runId: string;
  report: EvalReport;
  promptArtifacts: EvalPromptArtifactRecord[];
}

export function resolveEvalDumpMode(env: NodeJS.ProcessEnv = process.env): EvalDumpMode {
  const raw = env.SAJTMASKIN_EVAL_DUMP_FILES?.trim().toLowerCase();
  if (!raw || raw === "0" || raw === "false" || raw === "off" || raw === "none") {
    return "off";
  }
  if (raw === "all") return "all";
  if (raw === "1" || raw === "true" || raw === "failed" || raw === "failures") {
    return "failed";
  }
  return "off";
}

export function createEvalRunId(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "").replace("T", "-").slice(0, 17);
}

export function sanitizeEvalPathSegment(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return sanitized || "unknown";
}

function shouldDumpFiles(mode: EvalDumpMode, result: EvalResult): boolean {
  if (mode === "all") return true;
  if (mode === "failed") return !result.passed;
  return false;
}

function relativeRepoPath(absolutePath: string): string {
  return path.relative(process.cwd(), absolutePath).replace(/\\/g, "/");
}

function evalRunsRoot(): string {
  return path.join(process.cwd(), "data", "eval-runs");
}

function safeOutputPath(baseDir: string, filePath: string): string {
  const normalizedParts = filePath
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== ".." && !part.includes(":"));
  const safeRelative = normalizedParts.length > 0 ? normalizedParts.join("/") : "file.txt";
  const target = path.resolve(baseDir, safeRelative);
  const relative = path.relative(baseDir, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Unsafe eval artifact path: ${filePath}`);
  }
  return target;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(filePath: string, value: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

async function writeCodeFiles(baseDir: string, files: CodeFile[]): Promise<void> {
  await mkdir(baseDir, { recursive: true });
  await writeJson(path.join(baseDir, "_files.json"), files);
  for (const file of files) {
    await writeText(safeOutputPath(baseDir, file.path), file.content);
  }
}

function summarizePreflight(preflight: RunFinalizePreflightResult): Record<string, unknown> {
  return {
    preflightFileCount: preflight.preflightFileCount,
    preflightIssues: preflight.preflightIssues,
    previewBlockingReason: preflight.previewBlockingReason,
    previewStart: preflight.previewStart,
    unresolvedImportFallbackUsed: preflight.unresolvedImportFallbackUsed,
  };
}

function buildPromptSummary(params: {
  runId: string;
  prompt: EvalPrompt;
  result: EvalResult;
  filesDumped: boolean;
  runDirRelative: string;
}): Record<string, unknown> {
  const { runId, prompt, result, filesDumped, runDirRelative } = params;
  return {
    runId,
    promptId: prompt.id,
    prompt: prompt.prompt,
    intent: prompt.intent,
    passed: result.passed,
    generationStatus: result.generationStatus,
    failureStage: result.failureStage,
    totalScore: result.totalScore,
    blockingChecks: result.blockingChecks,
    scaffoldId: result.scaffoldId,
    variantId: result.variantId,
    generationTimeMs: result.generationTimeMs,
    generatedSurfaceFiles: result.generatedSurfaceFiles,
    finalProjectFiles: result.finalProjectFiles,
    promptSize: result.promptSize,
    preflight: result.preflight,
    droppedProtectedPaths: result.droppedProtectedPaths,
    filesDumped,
    runDir: runDirRelative,
  };
}

export async function writeEvalArtifacts(params: {
  runId: string;
  prompt: EvalPrompt;
  result: EvalResult;
  dumpMode: EvalDumpMode;
  stages?: EvalArtifactStages;
}): Promise<EvalPromptArtifactRecord> {
  const promptSegment = sanitizeEvalPathSegment(params.prompt.id);
  const runDir = path.join(evalRunsRoot(), "runs", `${params.runId}-${promptSegment}`);
  const runDirRelative = relativeRepoPath(runDir);
  const filesDumped = Boolean(params.stages) && shouldDumpFiles(params.dumpMode, params.result);

  await rm(runDir, { recursive: true, force: true });
  await mkdir(runDir, { recursive: true });
  await writeJson(
    path.join(runDir, "summary.json"),
    buildPromptSummary({
      runId: params.runId,
      prompt: params.prompt,
      result: params.result,
      filesDumped,
      runDirRelative,
    }),
  );
  await writeJson(path.join(runDir, "checks.json"), params.result.checks);
  await writeJson(
    path.join(runDir, "preflight.json"),
    params.stages ? summarizePreflight(params.stages.preflight) : params.result.preflight,
  );
  await writeJson(path.join(runDir, "prompt-size.json"), params.result.promptSize);

  if (filesDumped && params.stages) {
    await writeText(path.join(runDir, "raw-content.txt"), params.stages.rawContent);
    await writeText(path.join(runDir, "fixed-content.txt"), params.stages.fixedContent);
    await writeCodeFiles(path.join(runDir, "raw-files"), params.stages.rawFiles);
    await writeCodeFiles(path.join(runDir, "fixed-files"), params.stages.fixedFiles);
    await writeCodeFiles(path.join(runDir, "merged-files"), params.stages.mergedFiles);
    await writeCodeFiles(
      path.join(runDir, "canonical-runtime-files"),
      params.stages.sources.canonicalRuntimeFiles,
    );
    await writeCodeFiles(
      path.join(runDir, "complete-project-files"),
      params.stages.completeProjectFiles,
    );
  }

  return {
    promptId: params.prompt.id,
    runDir,
    runDirRelative,
    filesDumped,
  };
}

function buildSuiteSummaryJson(params: EvalSuiteSummaryParams): Record<string, unknown> {
  const artifactByPrompt = new Map(
    params.promptArtifacts.map((artifact) => [artifact.promptId, artifact]),
  );
  return {
    runId: params.runId,
    timestamp: params.report.timestamp,
    model: params.report.model,
    summary: params.report.summary,
    prompts: params.report.results.map((result) => {
      const artifact = artifactByPrompt.get(result.promptId);
      return {
        promptId: result.promptId,
        passed: result.passed,
        generationStatus: result.generationStatus,
        failureStage: result.failureStage,
        totalScore: result.totalScore,
        blockingChecks: result.blockingChecks,
        scaffoldId: result.scaffoldId,
        variantId: result.variantId,
        generationTimeMs: result.generationTimeMs,
        generatedSurfaceFiles: result.generatedSurfaceFiles,
        finalProjectFiles: result.finalProjectFiles,
        promptSize: result.promptSize,
        preflight: result.preflight,
        droppedProtectedPaths: result.droppedProtectedPaths,
        artifactDir: artifact?.runDirRelative ?? null,
        filesDumped: artifact?.filesDumped ?? false,
      };
    }),
  };
}

export async function writeEvalSuiteSummary(params: EvalSuiteSummaryParams): Promise<void> {
  const latestDir = path.join(evalRunsRoot(), "latest");
  await rm(latestDir, { recursive: true, force: true });
  await mkdir(latestDir, { recursive: true });
  await writeJson(path.join(latestDir, "summary.json"), buildSuiteSummaryJson(params));
  await writeText(path.join(latestDir, "summary.md"), `${formatEvalReport(params.report)}\n`);
  await pruneOldPromptDirs();
}

async function pruneOldPromptDirs(): Promise<void> {
  const runsDir = path.join(evalRunsRoot(), "runs");
  let entries: Array<{ name: string; mtimeMs: number }> = [];
  try {
    entries = await Promise.all(
      (await readdir(runsDir, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const entryStat = await stat(path.join(runsDir, entry.name));
          return { name: entry.name, mtimeMs: entryStat.mtimeMs };
        }),
    );
  } catch {
    return;
  }

  const keep = Number.parseInt(process.env.SAJTMASKIN_EVAL_RETENTION_PROMPT_DIRS ?? "", 10);
  const keepCount = Number.isFinite(keep) && keep > 0 ? keep : DEFAULT_RETENTION_PROMPT_DIRS;
  const stale = entries.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(keepCount);
  await Promise.all(
    stale.map((entry) => rm(path.join(runsDir, entry.name), { recursive: true, force: true })),
  );
}
