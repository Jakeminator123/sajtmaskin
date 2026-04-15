import path from "node:path";
import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import { runLlmFixer } from "@/lib/gen/autofix/llm-fixer";
import { parseCodeProject, serializeCodeProject } from "@/lib/gen/parser";
import { buildLintRepairContextLines } from "./lint-output";
import { resolveServerRepairEarlyStopReason } from "./server-repair-policy";
import type { ReasoningEffort } from "@/lib/gen/engine";

export type RepairMethod = "deterministic" | "llm";

export type RepairEarlyStopReason =
  | "fixer_noop"
  | "no_improvement"
  | "time_budget_exceeded"
  | null;

export type RepairFailedOutput = {
  check: string;
  exitCode: number;
  output: string;
  durationMs?: number | null;
};

export type RepairAttemptResult<TPayload = unknown> = {
  promoted: boolean;
  payload?: TPayload;
};

export type RunRepairLoopResult<TPayload = unknown> = {
  promoted: boolean;
  method: RepairMethod | null;
  payload?: TPayload;
  llmPasses: number;
  earlyStopReason: RepairEarlyStopReason;
  remainingErrors: number;
  improvedSyntax: boolean;
  noContext: boolean;
};

export type RunRepairLoopParams<TPayload = unknown> = {
  initialContent: string;
  failedOutputs: RepairFailedOutput[];
  contextLines: string[];
  maxLlmPasses: number;
  llmTimeoutMs: number;
  fixerModel?: string;
  fixerThinking?: boolean;
  fixerReasoningEffort?: ReasoningEffort;
  onAttemptPromotion: (
    projectContent: string,
    method: RepairMethod,
  ) => Promise<RepairAttemptResult<TPayload>>;
  onNoContext?: () => Promise<void> | void;
  hasActionableErrorContext?: boolean;
  enableTargetedRepair?: boolean;
  targetedRepairMaxFiles?: number;
};

type TargetedRepairBundle = {
  contentForFixer: string;
  requiredFiles: string[];
  mergeBack: (fixerContent: string) => string;
};

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

function parseFilesFromErrorLines(lines: string[]): string[] {
  const files = new Set<string>();
  for (const line of lines) {
    const fileMatch = line.match(/]\s*([^\s:]+\.\w{2,4}):/);
    if (fileMatch?.[1]) files.add(fileMatch[1]);
  }
  return [...files];
}

function resolveImportPath(
  importerPath: string,
  importPath: string,
  knownFiles: Set<string>,
): string | null {
  if (importPath.startsWith("@/")) {
    const aliasResolved = `src/${importPath.slice(2)}`;
    if (knownFiles.has(aliasResolved)) return aliasResolved;
  }
  if (!importPath.startsWith(".")) return null;

  const base = path.posix.normalize(
    path.posix.join(path.posix.dirname(importerPath), importPath),
  );
  if (knownFiles.has(base)) return base;

  const extCandidates = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".json",
    ".css",
    "/index.ts",
    "/index.tsx",
    "/index.js",
    "/index.jsx",
  ];
  for (const ext of extCandidates) {
    const candidate = `${base}${ext}`;
    if (knownFiles.has(candidate)) return candidate;
  }
  return null;
}

function collectImportDependencies(
  selectedFiles: string[],
  fileContents: Map<string, string>,
  knownFiles: Set<string>,
): string[] {
  const queue = [...selectedFiles];
  const seen = new Set(selectedFiles);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const content = fileContents.get(current);
    if (!content) continue;
    const importMatches = content.matchAll(
      /from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g,
    );
    for (const match of importMatches) {
      const importPath = (match[1] || match[2] || "").trim();
      if (!importPath) continue;
      const resolved = resolveImportPath(current, importPath, knownFiles);
      if (!resolved || seen.has(resolved)) continue;
      seen.add(resolved);
      queue.push(resolved);
    }
  }
  return [...seen];
}

function buildTargetedRepairBundle(params: {
  fullContent: string;
  brokenFiles: string[];
  maxFiles: number;
}): TargetedRepairBundle | null {
  const parsed = parseCodeProject(params.fullContent).files;
  if (parsed.length === 0) return null;

  const byPath = new Map(parsed.map((file) => [file.path, file]));
  const knownFiles = new Set(byPath.keys());
  const seed = params.brokenFiles.filter((file) => byPath.has(file));
  if (seed.length === 0) return null;

  const withDependencies = collectImportDependencies(
    seed,
    new Map(parsed.map((file) => [file.path, file.content])),
    knownFiles,
  );
  const selectedPaths = withDependencies.slice(0, Math.max(1, params.maxFiles));
  if (selectedPaths.length === 0 || selectedPaths.length >= parsed.length) return null;

  const selectedFiles = selectedPaths
    .map((pathName) => byPath.get(pathName))
    .filter((file): file is NonNullable<typeof file> => Boolean(file));
  if (selectedFiles.length === 0) return null;

  const fullFileOrder = parsed.map((file) => file.path);
  const fullFileMap = new Map(parsed.map((file) => [file.path, file]));

  return {
    contentForFixer: serializeCodeProject(selectedFiles),
    requiredFiles: selectedFiles.map((file) => file.path),
    mergeBack: (fixerContent: string) => {
      const fixedFiles = parseCodeProject(fixerContent).files;
      if (fixedFiles.length === 0) return params.fullContent;

      const mergedMap = new Map(fullFileMap);
      for (const fixed of fixedFiles) mergedMap.set(fixed.path, fixed);

      const merged = [
        ...fullFileOrder
          .map((pathName) => mergedMap.get(pathName))
          .filter((file): file is NonNullable<typeof file> => Boolean(file)),
        ...[...mergedMap.values()].filter((file) => !fullFileOrder.includes(file.path)),
      ];
      return serializeCodeProject(merged);
    },
  };
}

export function buildRepairErrorContextLines(failedOutputs: RepairFailedOutput[]): string[] {
  const lines: string[] = [];
  for (const failure of failedOutputs) {
    if (failure.check === "lint") {
      lines.push(...buildLintRepairContextLines(failure.output));
    }
    const outputLines = failure.output.split("\n");
    for (let i = 0; i < outputLines.length; i++) {
      const stripped = outputLines[i].trim();
      if (!stripped) continue;
      if (/error\b|TS\d{4}|ERR!|FAIL/i.test(stripped)) {
        const prevLine = i > 0 ? outputLines[i - 1]?.trim() : "";
        if (prevLine && !lines.includes(`[${failure.check}] ${prevLine}`)) {
          lines.push(`[${failure.check}] ${prevLine}`);
        }
        lines.push(`[${failure.check}] ${stripped}`);
      }
      if (lines.length > 60) break;
    }
  }
  return lines;
}

export async function runRepairLoop<TPayload = unknown>(
  params: RunRepairLoopParams<TPayload>,
): Promise<RunRepairLoopResult<TPayload>> {
  const { validateGeneratedCode } = await import("@/lib/gen/retry/validate-syntax");

  let content = (await runAutoFix(params.initialContent)).fixedContent;
  let syntaxResult = await validateGeneratedCode(content);
  const initialSyntaxErrorCount = syntaxResult.errors.length;

  if (syntaxResult.valid) {
    const deterministic = await params.onAttemptPromotion(content, "deterministic");
    if (deterministic.promoted) {
      return {
        promoted: true,
        method: "deterministic",
        payload: deterministic.payload,
        llmPasses: 0,
        earlyStopReason: null,
        remainingErrors: 0,
        improvedSyntax: false,
        noContext: false,
      };
    }
  }

  const repairContextLines = uniqueContextLines(params.contextLines, 80);
  const hasErrorContext =
    params.hasActionableErrorContext ??
    (params.failedOutputs.length > 0 ||
      syntaxResult.errors.length > 0 ||
      repairContextLines.length > 0);
  if (!hasErrorContext) {
    await params.onNoContext?.();
    return {
      promoted: false,
      method: null,
      llmPasses: 0,
      earlyStopReason: null,
      remainingErrors: syntaxResult.errors.length,
      improvedSyntax: false,
      noContext: true,
    };
  }

  let bestContent = content;
  let bestErrorCount = syntaxResult.errors.length;
  let llmPasses = 0;
  let earlyStopReason: RepairEarlyStopReason = null;

  const filesFromGateOutput = parseFilesFromErrorLines(repairContextLines);
  for (let pass = 0; pass < params.maxLlmPasses; pass++) {
    if (syntaxResult.errors.length > bestErrorCount && bestErrorCount < Infinity) {
      content = bestContent;
      syntaxResult = await validateGeneratedCode(content);
    }
    const errorsBefore = syntaxResult.errors.length;
    const errorSummary = uniqueContextLines(
      [
        ...syntaxResult.errors.map(
          (error) => `${error.file}:${error.line}:${error.column} ${error.message}`,
        ),
        ...repairContextLines,
      ],
      50,
    );
    const brokenFiles = [
      ...new Set([
        ...syntaxResult.errors.map((error) => error.file).filter(Boolean),
        ...filesFromGateOutput,
      ]),
    ];

    const targetedBundle =
      params.enableTargetedRepair !== false
        ? buildTargetedRepairBundle({
            fullContent: content,
            brokenFiles,
            maxFiles: params.targetedRepairMaxFiles ?? 16,
          })
        : null;

    const fixerAbort = new AbortController();
    const timeoutHandle = setTimeout(
      () => fixerAbort.abort(),
      Math.max(1_000, params.llmTimeoutMs),
    );
    let fixerResult: Awaited<ReturnType<typeof runLlmFixer>>;
    try {
      fixerResult = await runLlmFixer(
        targetedBundle?.contentForFixer ?? content,
        errorSummary,
        {
          model: params.fixerModel,
          thinking: params.fixerThinking,
          reasoningEffort: params.fixerReasoningEffort,
          requiredFiles: targetedBundle?.requiredFiles ?? brokenFiles,
          abortSignal: fixerAbort.signal,
        },
      );
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

    const fixerOutput = targetedBundle
      ? targetedBundle.mergeBack(fixerResult.fixedContent)
      : fixerResult.fixedContent;
    const reFixed = await runAutoFix(fixerOutput);
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
    const promoted = await params.onAttemptPromotion(bestContent, "llm");
    return {
      promoted: promoted.promoted,
      method: "llm",
      payload: promoted.payload,
      llmPasses,
      earlyStopReason,
      remainingErrors: 0,
      improvedSyntax: 0 < initialSyntaxErrorCount,
      noContext: false,
    };
  }

  return {
    promoted: false,
    method: "llm",
    llmPasses,
    earlyStopReason,
    remainingErrors: bestErrorCount,
    improvedSyntax: bestErrorCount < initialSyntaxErrorCount,
    noContext: false,
  };
}
