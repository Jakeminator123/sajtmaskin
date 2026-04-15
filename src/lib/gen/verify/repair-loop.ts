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

export type RepairErrorManifestDiagnostic = {
  source: string;
  line: number | null;
  column: number | null;
  message: string;
};

export type RepairErrorManifestEntry = {
  file: string;
  importedByCount: number;
  dependsOn: string[];
  diagnostics: RepairErrorManifestDiagnostic[];
};

export type RepairErrorManifest = RepairErrorManifestEntry[];

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
  errorManifest: RepairErrorManifest;
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
    const groupedMatch = line.match(/^File:\s+([^\s]+)\s+\(/);
    if (fileMatch?.[1]) files.add(fileMatch[1]);
    if (groupedMatch?.[1]) files.add(groupedMatch[1]);
  }
  return [...files];
}

type ParsedRepairDiagnostic = {
  file: string;
  line: number | null;
  column: number | null;
  message: string;
  source: string;
};

const STACK_LINE_PREFIX_RE = /^\s*(at|in)\s+/i;
const NOISE_LINE_RE = /^(>|\|{2,}|npm (ERR|WARN)!|error Command failed)/i;
const FILE_LINE_RE =
  /^(?<file>(?:[A-Za-z]:)?[^:\n\r]+\.(?:[tj]sx?|jsx?|mjs|cjs|json|css|scss|mdx?))(?::(?<line>\d+))?(?::(?<column>\d+))?\s*-?\s*(?<message>.+)$/;
const TS_DIAG_RE =
  /^(?<file>(?:[A-Za-z]:)?[^:\n\r]+\.(?:[tj]sx?|jsx?|mjs|cjs|json|css|scss|mdx?))\((?<line>\d+),(?<column>\d+)\):\s*(?:error|warning)\s+TS\d+:\s*(?<message>.+)$/i;
const BRACKET_PREFIX_RE = /^\[[^\]]+\]\s*/;

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

function normalizeDiagnosticFile(raw: string): string | null {
  const normalized = toPosixPath(raw.replace(/^file\s+/i, "").trim());
  if (!normalized || normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return null;
  }
  if (normalized.includes("node_modules/")) return null;
  const cwdMarker = "/sajtmaskin/";
  const cwdIndex = normalized.toLowerCase().lastIndexOf(cwdMarker);
  if (cwdIndex >= 0) {
    return normalized.slice(cwdIndex + cwdMarker.length);
  }
  return normalized.replace(/^\/+/, "");
}

function parseNullableInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDiagnosticsFromFailure(failure: RepairFailedOutput): ParsedRepairDiagnostic[] {
  const diagnostics: ParsedRepairDiagnostic[] = [];
  const lines = failure.output.split("\n");
  for (const rawLine of lines) {
    const line = BRACKET_PREFIX_RE.test(rawLine)
      ? rawLine.replace(BRACKET_PREFIX_RE, "").trim()
      : rawLine.trim();
    if (!line || line.length < 3) continue;
    if (STACK_LINE_PREFIX_RE.test(line) || NOISE_LINE_RE.test(line)) continue;

    const tsMatch = line.match(TS_DIAG_RE);
    if (tsMatch?.groups) {
      const file = normalizeDiagnosticFile(tsMatch.groups.file);
      const message = tsMatch.groups.message?.trim();
      if (!file || !message) continue;
      diagnostics.push({
        file,
        line: parseNullableInt(tsMatch.groups.line),
        column: parseNullableInt(tsMatch.groups.column),
        message,
        source: failure.check,
      });
      continue;
    }

    const fileLineMatch = line.match(FILE_LINE_RE);
    if (fileLineMatch?.groups) {
      const file = normalizeDiagnosticFile(fileLineMatch.groups.file);
      const message = fileLineMatch.groups.message?.trim();
      if (!file || !message || /^(error|warning)$/i.test(message)) continue;
      diagnostics.push({
        file,
        line: parseNullableInt(fileLineMatch.groups.line),
        column: parseNullableInt(fileLineMatch.groups.column),
        message,
        source: failure.check,
      });
      continue;
    }
  }
  return diagnostics;
}

function buildImportGraph(content: string): {
  dependsOn: Map<string, Set<string>>;
  importedBy: Map<string, Set<string>>;
} {
  const project = parseCodeProject(content);
  const byPath = new Map(project.files.map((file) => [toPosixPath(file.path), file.content]));
  const knownFiles = new Set(byPath.keys());
  const dependsOn = new Map<string, Set<string>>();
  const importedBy = new Map<string, Set<string>>();
  const importRe = /from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

  for (const [filePath, fileContent] of byPath.entries()) {
    const dependencies = new Set<string>();
    for (const match of fileContent.matchAll(importRe)) {
      const importPath = (match[1] || match[2] || "").trim();
      if (!importPath) continue;
      const resolved = resolveImportPath(filePath, importPath, knownFiles);
      if (!resolved) continue;
      const normalizedResolved = toPosixPath(resolved);
      dependencies.add(normalizedResolved);
      if (!importedBy.has(normalizedResolved)) {
        importedBy.set(normalizedResolved, new Set());
      }
      importedBy.get(normalizedResolved)!.add(filePath);
    }
    dependsOn.set(filePath, dependencies);
  }

  return { dependsOn, importedBy };
}

function sortManifestByDependencyPriority(
  manifest: RepairErrorManifest,
): RepairErrorManifest {
  return [...manifest].sort((a, b) => {
    if (b.importedByCount !== a.importedByCount) {
      return b.importedByCount - a.importedByCount;
    }
    if (b.dependsOn.length !== a.dependsOn.length) {
      return b.dependsOn.length - a.dependsOn.length;
    }
    return a.file.localeCompare(b.file);
  });
}

function buildRepairErrorManifest(params: {
  failedOutputs: RepairFailedOutput[];
  syntaxErrors: Array<{ file: string; line: number; column: number; message: string }>;
  projectContent?: string;
}): RepairErrorManifest {
  const diagnosticsByFile = new Map<string, RepairErrorManifestDiagnostic[]>();
  const graph = params.projectContent
    ? buildImportGraph(params.projectContent)
    : { dependsOn: new Map<string, Set<string>>(), importedBy: new Map<string, Set<string>>() };
  const { dependsOn, importedBy } = graph;

  const pushDiagnostic = (
    file: string,
    diagnostic: RepairErrorManifestDiagnostic,
  ) => {
    const normalizedFile = toPosixPath(file);
    if (!normalizedFile) return;
    if (!diagnosticsByFile.has(normalizedFile)) {
      diagnosticsByFile.set(normalizedFile, []);
    }
    diagnosticsByFile.get(normalizedFile)!.push(diagnostic);
  };

  for (const failure of params.failedOutputs) {
    const diagnostics = parseDiagnosticsFromFailure(failure);
    for (const diagnostic of diagnostics) {
      pushDiagnostic(diagnostic.file, {
        source: diagnostic.source,
        line: diagnostic.line,
        column: diagnostic.column,
        message: diagnostic.message,
      });
    }
  }

  for (const syntaxError of params.syntaxErrors) {
    if (!syntaxError.file || syntaxError.file === "__pipeline__") continue;
    pushDiagnostic(syntaxError.file, {
      source: "syntax",
      line: Number.isFinite(syntaxError.line) ? syntaxError.line : null,
      column: Number.isFinite(syntaxError.column) ? syntaxError.column : null,
      message: syntaxError.message,
    });
  }

  const entries: RepairErrorManifest = [];
  for (const [file, diagnostics] of diagnosticsByFile.entries()) {
    const uniqueDiagnostics = uniqueContextLines(
      diagnostics.map((diag) => {
        const location =
          diag.line !== null && diag.column !== null
            ? `${diag.line}:${diag.column}`
            : diag.line !== null
              ? `${diag.line}`
              : "n/a";
        return `${diag.source}|${location}|${diag.message}`;
      }),
      32,
    ).map((serialized) => {
      const [source = "unknown", location = "n/a", ...rest] = serialized.split("|");
      const [lineRaw, columnRaw] = location.split(":");
      const line = lineRaw && lineRaw !== "n/a" ? Number.parseInt(lineRaw, 10) : null;
      const column = columnRaw ? Number.parseInt(columnRaw, 10) : null;
      return {
        source,
        line: Number.isFinite(line as number) ? (line as number) : null,
        column: Number.isFinite(column as number) ? (column as number) : null,
        message: rest.join("|"),
      } satisfies RepairErrorManifestDiagnostic;
    });

    entries.push({
      file,
      importedByCount: importedBy.get(file)?.size ?? 0,
      dependsOn: [...(dependsOn.get(file) ?? new Set<string>())].sort(),
      diagnostics: uniqueDiagnostics,
    });
  }

  return sortManifestByDependencyPriority(entries);
}

function buildErrorManifestContextLines(manifest: RepairErrorManifest): string[] {
  const lines: string[] = [];
  for (const entry of manifest) {
    const dependencyLabel =
      entry.dependsOn.length > 0
        ? `${entry.dependsOn.length} dependencies`
        : "no local dependencies";
    lines.push(
      `File: ${entry.file} (imported by ${entry.importedByCount} files, ${dependencyLabel})`,
    );
    const diagnostics = entry.diagnostics.slice(0, 8);
    for (const diagnostic of diagnostics) {
      const location =
        diagnostic.line !== null && diagnostic.column !== null
          ? `line ${diagnostic.line}, col ${diagnostic.column}`
          : diagnostic.line !== null
            ? `line ${diagnostic.line}`
            : "line ?";
      lines.push(`  - [${diagnostic.source}] ${location}: ${diagnostic.message}`);
    }
    if (entry.diagnostics.length > diagnostics.length) {
      lines.push(
        `  - ... ${entry.diagnostics.length - diagnostics.length} additional diagnostics omitted.`,
      );
    }
  }
  return lines;
}

function resolveImportPath(
  importerPath: string,
  importPath: string,
  knownFiles: Set<string>,
): string | null {
  if (importPath.startsWith("@/")) {
    const aliasResolved = `src/${importPath.slice(2)}`;
    if (knownFiles.has(aliasResolved)) return aliasResolved;
    const aliasExtCandidates = [
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
    for (const ext of aliasExtCandidates) {
      const candidate = `${aliasResolved}${ext}`;
      if (knownFiles.has(candidate)) return candidate;
    }
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
  const lintContext = failedOutputs.flatMap((failure) =>
    failure.check === "lint" ? buildLintRepairContextLines(failure.output) : [],
  );
  const grouped = buildGroupedRepairErrorContext(failedOutputs);
  return uniqueContextLines([...grouped.contextLines, ...lintContext], 80);
}

export function buildGroupedRepairErrorContext(
  failedOutputs: RepairFailedOutput[],
  options?: {
    syntaxErrors?: Array<{ file: string; line: number; column: number; message: string }>;
    projectContent?: string;
  },
): {
  errorManifest: RepairErrorManifest;
  contextLines: string[];
} {
  const syntaxErrors = options?.syntaxErrors ?? [];
  const errorManifest = buildRepairErrorManifest({
    failedOutputs,
    syntaxErrors,
    projectContent: options?.projectContent,
  });
  const contextLines = buildErrorManifestContextLines(errorManifest);
  return { errorManifest, contextLines };
}

export async function runRepairLoop<TPayload = unknown>(
  params: RunRepairLoopParams<TPayload>,
): Promise<RunRepairLoopResult<TPayload>> {
  const { validateGeneratedCode } = await import("@/lib/gen/retry/validate-syntax");

  let content = (await runAutoFix(params.initialContent)).fixedContent;
  let syntaxResult = await validateGeneratedCode(content);
  const initialSyntaxErrorCount = syntaxResult.errors.length;
  let errorManifest = buildRepairErrorManifest({
    failedOutputs: params.failedOutputs,
    syntaxErrors: syntaxResult.errors,
    projectContent: content,
  });

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
        errorManifest,
      };
    }
  }

  const groupedContext = buildGroupedRepairErrorContext(params.failedOutputs, {
    syntaxErrors: syntaxResult.errors,
    projectContent: content,
  });
  errorManifest = groupedContext.errorManifest;
  const repairContextLines = uniqueContextLines(
    [...groupedContext.contextLines, ...params.contextLines],
    120,
  );
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
      errorManifest,
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
    const groupedAfterFix = buildGroupedRepairErrorContext(params.failedOutputs, {
      syntaxErrors: syntaxResult.errors,
      projectContent: content,
    });
    errorManifest = groupedAfterFix.errorManifest;
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

  const finalSyntaxResult =
    bestContent === content
      ? syntaxResult
      : await validateGeneratedCode(bestContent);
  const finalErrorManifest = buildRepairErrorManifest({
    failedOutputs: params.failedOutputs,
    syntaxErrors: finalSyntaxResult.errors,
    projectContent: bestContent,
  });
  const syntaxClean = finalSyntaxResult.errors.length === 0;
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
      errorManifest: finalErrorManifest,
    };
  }

  return {
    promoted: false,
    method: "llm",
    llmPasses,
    earlyStopReason,
    remainingErrors: finalSyntaxResult.errors.length,
    improvedSyntax: finalSyntaxResult.errors.length < initialSyntaxErrorCount,
    noContext: false,
    errorManifest: finalErrorManifest,
  };
}
