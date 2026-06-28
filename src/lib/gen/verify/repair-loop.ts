import path from "node:path";
import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import { fixKnownTs2304Imports } from "@/lib/gen/autofix/rules/ts2304-known-import-fixer";
import { runLlmFixer } from "@/lib/gen/autofix/llm-fixer";
import type { RecurringFailurePattern } from "@/lib/gen/autofix/fixer-prompt";
import { parseCodeProject, serializeCodeProject } from "@/lib/gen/parser";
import { AUTOFIX_MAX_OUTPUT_TOKENS } from "@/lib/gen/defaults";
import { buildLintRepairContextLines } from "./lint-output";
import {
  isRepairBudgetExhausted,
  resolveServerRepairEarlyStopReason,
} from "./server-repair-policy";
import type { ReasoningEffort } from "@/lib/gen/engine";

export type RepairMethod = "deterministic" | "llm";

export type RepairEarlyStopReason =
  | "fixer_noop"
  | "no_improvement"
  | "time_budget_exceeded"
  | null;

export type { RepairFailedOutput } from "./repair-loop/diagnostics-parser";
import type { RepairFailedOutput } from "./repair-loop/diagnostics-parser";
import {
  parseDiagnosticsFromFailure,
  parseFilesFromErrorLines,
  toPosixPath,
  uniqueContextLines,
} from "./repair-loop/diagnostics-parser";

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
  llmRetryTimeoutMs?: number;
  fixerModel?: string;
  fixerThinking?: boolean;
  fixerReasoningEffort?: ReasoningEffort;
  fixerMaxTokens?: number;
  // Återkommande felmönster från tidigare runs i samma chat-session.
  // Anroparen läser via `readRecurringPatternsForChat(chatId)` (i
  // `@/lib/logging/generation-log-writer`) och skickar in dem så LLM-fixern
  // får signal att INTE upprepa fixar som redan misslyckats.
  recurringPatterns?: RecurringFailurePattern[];
  onAttemptPromotion: (
    projectContent: string,
    method: RepairMethod,
  ) => Promise<RepairAttemptResult<TPayload>>;
  onNoContext?: () => Promise<void> | void;
  /**
   * Called at the start of every LLM pass (before the slow fixer call). Lets a
   * caller renew its distributed lease (Plan C / Codex P2) so a multi-pass
   * repair that runs past the lease TTL never loses ownership mid-loop — which
   * would otherwise make the lease-conditioned save silently no-op.
   */
  onBeforePass?: (passIndex: number) => Promise<void> | void;
  hasActionableErrorContext?: boolean;
  enableTargetedRepair?: boolean;
  targetedRepairMaxFiles?: number;
  /**
   * Absolute `Date.now()`-based deadline after which the loop must not START a
   * new LLM fixer pass or the final preview-host verify. Lets a caller bound the
   * loop to its route's static `maxDuration` so a multi-pass repair winds down
   * gracefully (`earlyStopReason = "time_budget_exceeded"`) and releases its
   * lease, instead of being hard-killed by the platform mid-pass / mid-DB-write
   * (#284 follow-up). Undefined = no wall-clock bound (back-compat).
   */
  repairDeadlineEpochMs?: number;
  /**
   * Worst-case duration (ms) of the final preview-host verify run by
   * `onAttemptPromotion` after the LLM loop. The final gate is only started when
   * at least this much budget remains before `repairDeadlineEpochMs`; otherwise
   * it is skipped gracefully (`time_budget_exceeded`). Reserving the real verify
   * timeout (not 0) stops a late verify from running past the route's
   * maxDuration and being hard-killed mid-verify / mid-save — the exact failure
   * this guard exists to prevent (Codex P1 on #286). Callers pass the canonical
   * `PREVIEW_HOST_CLIENT_TIMEOUTS_MS.verify`. Defaults to 0 (no reserve) for
   * back-compat.
   */
  finalGateReserveMs?: number;
};

type TargetedRepairBundle = {
  contentForFixer: string;
  requiredFiles: string[];
  mergeBack: (fixerContent: string) => string;
};

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

  // Initial mechanical pass: repair-loop is invoked from contexts that may not
  // have already autofixed (verifier rerun, eval). Idempotent if input is
  // already clean.
  let content = (await runAutoFix(params.initialContent)).fixedContent;

  // Deterministic TS2304 pre-pass (runs BEFORE the LLM fixer). The quality gate
  // that produced `failedOutputs` already ran tsc; its `Cannot find name 'X'`
  // diagnostics catch missing imports in NON-JSX positions (e.g.
  // `const Icon = Clapperboard;`) that the JSX-scan import-validator inside
  // runAutoFix never sees. Resolve the ones we know with certainty
  // (lucide icons / known module specifiers) mechanically and instantly so the
  // deterministic promotion below can pass the gate, instead of paying a slow
  // (~90s) LLM round-trip for a missing import. Unknown names are left for the
  // LLM fixer.
  const ts2304Diagnostics = params.failedOutputs
    .flatMap(parseDiagnosticsFromFailure)
    .filter((diagnostic) => /Cannot find name '/.test(diagnostic.message));
  if (ts2304Diagnostics.length > 0) {
    const knownImportResult = fixKnownTs2304Imports(content, ts2304Diagnostics);
    if (knownImportResult.addedImports.length > 0) {
      content = knownImportResult.code;
    }
  }

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
    // Wall-clock graceful stop (#284 follow-up): never START a new LLM fixer
    // pass that can't finish (including its retry attempt) before the route's
    // static maxDuration. `pass > 0` so a repair always makes at least one
    // attempt; later passes stop gracefully so the route can fail + release its
    // lease instead of being hard-killed mid-pass — which would strand the
    // version in `repairing` and abort the finalize DB write.
    if (
      pass > 0 &&
      isRepairBudgetExhausted({
        deadlineEpochMs: params.repairDeadlineEpochMs,
        nowMs: Date.now(),
        nextStepMaxMs: params.llmTimeoutMs + (params.llmRetryTimeoutMs ?? 0),
      })
    ) {
      earlyStopReason = "time_budget_exceeded";
      break;
    }
    // Renew the distributed lease before the slow fixer call (Codex P2: a
    // multi-pass repair can exceed the lease TTL; renewing per pass keeps
    // ownership so the final lease-conditioned save isn't silently dropped).
    await params.onBeforePass?.(pass);
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

    const fixerInput = targetedBundle?.contentForFixer ?? content;
    const contentBeforePass = content;
    const originalMaxTokens = params.fixerMaxTokens ?? AUTOFIX_MAX_OUTPUT_TOKENS;
    const reducedMaxTokens = Math.max(1, Math.floor(originalMaxTokens * 0.5));
    let timedOut = false;
    let fixerAttemptCount = 0;
    const runFixerAttempt = async (
      attemptErrors: string[],
      maxTokens: number,
      timeoutMs: number,
    ): Promise<Awaited<ReturnType<typeof runLlmFixer>>> => {
      const fixerAbort = new AbortController();
      const timeoutHandle = setTimeout(
        () => fixerAbort.abort(),
        Math.max(1_000, timeoutMs),
      );
      fixerAttemptCount++;
      try {
        const result = await runLlmFixer(fixerInput, attemptErrors, {
          model: params.fixerModel,
          thinking: params.fixerThinking,
          reasoningEffort: params.fixerReasoningEffort,
          maxTokens,
          requiredFiles: targetedBundle?.requiredFiles ?? brokenFiles,
          recurringPatterns: params.recurringPatterns,
          abortSignal: fixerAbort.signal,
        });
        timedOut = fixerAbort.signal.aborted;
        return result;
      } finally {
        clearTimeout(timeoutHandle);
      }
    };

    let fixerResult = await runFixerAttempt(errorSummary, originalMaxTokens, params.llmTimeoutMs);
    if (fixerResult.aborted) {
      console.warn("[repair-loop] LLM-fixer aborted, retrying with reduced budget");
      fixerResult = await runFixerAttempt(
        errorSummary.slice(0, 3),
        reducedMaxTokens,
        params.llmRetryTimeoutMs ?? params.llmTimeoutMs,
      );
    }
    llmPasses += fixerAttemptCount;

    if (!fixerResult.success && !fixerResult.partial) {
      const stopReason = resolveServerRepairEarlyStopReason({
        fixerProducedOutput: false,
        errorsBefore,
        errorsAfter: errorsBefore,
        timedOut,
      });
      earlyStopReason = stopReason === "continue" ? null : stopReason;
      break;
    }

    const fixerOutput = targetedBundle
      ? targetedBundle.mergeBack(fixerResult.fixedContent)
      : fixerResult.fixedContent;
    // post-LLM mechanical pass: normalizes the fixer output before the next
    // validate iteration. Required after every LLM pass.
    const reFixed = await runAutoFix(fixerOutput);
    content = reFixed.fixedContent;
    syntaxResult = await validateGeneratedCode(content);
    const groupedAfterFix = buildGroupedRepairErrorContext(params.failedOutputs, {
      syntaxErrors: syntaxResult.errors,
      projectContent: content,
    });
    errorManifest = groupedAfterFix.errorManifest;
    // The LLM "changed something" when either the raw output differs from
    // the targeted input we handed it OR the post-autofix content differs
    // from what the loop had at the top of this iteration. Either signal
    // means the model did not regurgitate the same bytes verbatim.
    const contentChanged =
      fixerOutput !== fixerInput || content !== contentBeforePass;
    const stopReason = resolveServerRepairEarlyStopReason({
      fixerProducedOutput: true,
      errorsBefore,
      errorsAfter: syntaxResult.errors.length,
      timedOut: false,
      contentChanged,
      gateFailureSignals: repairContextLines.length,
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
  // Wall-clock graceful stop (#284 follow-up, hardened per Codex P1 on #286): if
  // there is not a full preview-host verify-timeout of budget left, do NOT start
  // the final verify — a late verify would run past the route's maxDuration and
  // be hard-killed mid-verify / mid-save (the exact failure this guard prevents).
  // `finalGateReserveMs` is the verify timeout the caller passes; reserving it
  // (rather than 0) is what makes the check correct. Stop gracefully so the
  // caller fails + releases the lease; the unverified (but syntax-clean) content
  // is intentionally NOT promoted.
  const budgetSpentBeforeFinalGate = isRepairBudgetExhausted({
    deadlineEpochMs: params.repairDeadlineEpochMs,
    nowMs: Date.now(),
    nextStepMaxMs: params.finalGateReserveMs ?? 0,
  });
  if (syntaxClean && budgetSpentBeforeFinalGate) {
    earlyStopReason = "time_budget_exceeded";
  } else if (syntaxClean) {
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
