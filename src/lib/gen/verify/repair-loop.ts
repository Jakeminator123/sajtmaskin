import path from "node:path";
import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import type { FixerResult } from "@/lib/gen/autofix/llm-fixer";
import {
  runLlmRepairGate,
  type LlmRepairConfig,
  type RepairLedger,
} from "@/lib/gen/autofix/llm-repair-gate";
import { countByFixer } from "@/lib/gen/autofix/types";
import { devLogAppend } from "@/lib/logging/devLog";
import { runDeterministicImportRepair } from "@/lib/gen/autofix/deterministic-import-repair";
import type { BuildSpecPreviewPolicy } from "@/lib/gen/build-spec";
import type { RecurringFailurePattern } from "@/lib/gen/autofix/fixer-prompt";
import { parseCodeProject, serializeCodeProject } from "@/lib/gen/parser";
import {
  AUTOFIX_MAX_OUTPUT_TOKENS,
  FINAL_GATE_MIN_FLOOR_MS,
  FINAL_GATE_RELEASE_MARGIN_MS,
} from "@/lib/gen/defaults";
import { buildLintRepairContextLines } from "./lint-output";
import {
  isRepairBudgetExhausted,
  resolveFinalGateVerifyBudget,
  resolveServerRepairEarlyStopReason,
} from "./server-repair-policy";
import type { ReasoningEffort } from "@/lib/gen/engine";

export type RepairMethod = "deterministic" | "llm";

export type RepairEarlyStopReason =
  | "fixer_noop"
  | "no_improvement"
  | "time_budget_exceeded"
  | "superseded"
  | null;

export type { RepairFailedOutput } from "./repair-loop/diagnostics-parser";
import type { RepairFailedOutput } from "./repair-loop/diagnostics-parser";
import {
  buildStructuredOriginDiagnostics,
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
  /**
   * Owning chat id — used only for dev-log telemetry of the deterministic
   * import-repair pre-pass. Optional so non-chat callers (eval) can omit it.
   */
  chatId?: string;
  /**
   * Version preview policy (F2 `"fidelity2"` / F3 `"fidelity3"`). Gates the
   * deterministic import-repair: tier-3 backend SDK imports are only
   * (re)introduced in F3. Omitted → treated as F2-safe (never adds tier-3).
   */
  previewPolicy?: BuildSpecPreviewPolicy;
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
    /**
     * Per-attempt options. The final LLM gate passes an absolute
     * `verifyDeadlineEpochMs` so the preview-host verify aborts before the
     * route's `maxDuration` (Codex P1 #286). Omitted for the early deterministic
     * promotion and for callers that don't bound the loop (back-compat).
     */
    options?: { verifyDeadlineEpochMs?: number },
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
   * Fas 3 (RepairGate): shared `RepairLedger` so the loop's fixer calls dedupe
   * against LLM repairs already attempted in other lanes of the same run
   * (finalize warm-tsc/syntax/verifier). Omitted → no dedupe (a fresh ledger
   * per call would be a no-op since every pass mutates content).
   */
  repairLedger?: RepairLedger;
  /**
   * Fas 3 (RepairGate): stable scope for ledger keys. Must MATCH the finalize
   * run's `repairScopeId` when the ledger is handed over from finalize, so
   * identical content+diagnostics collide across lanes. Falls back to chatId
   * inside the gate when omitted.
   */
  repairScopeId?: string;
  /**
   * Fas 3 (base-aware tidig abort): checked at the start of every LLM pass and
   * again before the final verify gate. Return `true` when the version being
   * repaired is superseded (a newer version exists, or its `files_json`
   * advanced past the snapshot this repair is based on) — the loop then stops
   * with `earlyStopReason: "superseded"` instead of finishing work whose
   * result would be discarded by the base-bound save anyway.
   */
  shouldAbortSuperseded?: () => Promise<boolean> | boolean;
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

function resolveNonPromotedEarlyStopReason(params: {
  earlyStopReason: RepairEarlyStopReason;
  hasDeterministicProgress: boolean;
  improvedSyntax: boolean;
}): RepairEarlyStopReason {
  if (params.earlyStopReason) return params.earlyStopReason;
  // Deterministic pre-pass or syntax improvement counts as measurable
  // progress — leave reason null so callers classify gate-only failure as
  // `syntax_clean_gate_failed`, not spurious `no_improvement`.
  if (params.hasDeterministicProgress || params.improvedSyntax) return null;
  return "no_improvement";
}

export async function runRepairLoop<TPayload = unknown>(
  params: RunRepairLoopParams<TPayload>,
): Promise<RunRepairLoopResult<TPayload>> {
  const { validateGeneratedCode } = await import("@/lib/gen/retry/validate-syntax");

  // Initial mechanical pass: repair-loop is invoked from contexts that may not
  // have already autofixed (verifier rerun, eval). Idempotent if input is
  // already clean.
  //
  // Thread the version's `previewPolicy` so the F2 SDK guard
  // (`tier3-sdk-guard-fixer`) only strips tier-3 backend SDK imports in F2.
  // Without it, an F3/integrations version entering the loop with a gate
  // failure unrelated to those imports would have its valid backend SDK
  // imports (stripe / @clerk/nextjs/server / supabase) stripped here — the
  // same policy the deterministic pre-pass already honours (Codex P1).
  let content = (await runAutoFix(params.initialContent, {
    previewPolicy: params.previewPolicy,
  })).fixedContent;

  // Deterministic, diagnostic-driven import repair (runs BEFORE the LLM fixer).
  // The quality gate that produced `failedOutputs` already ran tsc; its
  // diagnostics name the exact symbol + file for import-only failures
  // (TS2304/TS2552 missing import, TS1361 import-type-used-as-value, TS2440
  // import/local conflict, TS2300 duplicate identifier). Resolve those
  // mechanically and instantly so the deterministic promotion below can pass the
  // gate without a slow (~90s) LLM round-trip. Ambiguous / logic errors are left
  // for the LLM fixer. Shared implementation with the finalize warm-tsc
  // normalize pass: @/lib/gen/autofix/deterministic-import-repair.ts.
  const importRepair = runDeterministicImportRepair(
    content,
    params.failedOutputs.flatMap(parseDiagnosticsFromFailure),
    { previewPolicy: params.previewPolicy },
  );
  if (importRepair.fixed) {
    content = importRepair.content;
    devLogAppend("in-progress", {
      type: "validate.tsc.import-repair",
      chatId: params.chatId,
      handledCodes: importRepair.handledCodes,
      fixCount: importRepair.fixes.length,
      fixers: countByFixer(importRepair.fixes),
      // M#imp1 telemetry: which cannot-find codes were seen, which names
      // resolved, and why the residue stayed residual (tier3_gated /
      // ambiguous_shadcn_lucide / unknown_name / not_applied).
      cannotFindSummary: importRepair.cannotFindSummary,
    });
  } else if (importRepair.cannotFindSummary.residual.length > 0) {
    // Nothing was fixable — log the residual classification anyway so a prod
    // run where EVERY known-import candidate was gated (e.g. tier-3 SDKs in
    // an F2 lane, prod chat cc10e7de v8) is observable instead of silent.
    devLogAppend("in-progress", {
      type: "validate.tsc.import-repair",
      chatId: params.chatId,
      handledCodes: [],
      fixCount: 0,
      fixers: {},
      cannotFindSummary: importRepair.cannotFindSummary,
    });
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
      if (importRepair.fixed) {
        // Proof signal for prod analysis: the gate passed after deterministic
        // import-repair, so the LLM fixer was skipped entirely for this version.
        devLogAppend("in-progress", {
          type: "validate.tsc.import-repair.resolved",
          chatId: params.chatId,
          handledCodes: importRepair.handledCodes,
          llmSkippedBecauseResolved: true,
        });
      }
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

  // Baseline after deterministic pre-pass (autofix + import-repair). LLM
  // abort/partial must not discard progress measured against THIS snapshot.
  const preLlmBaselineContent = content;
  const hasDeterministicProgress =
    importRepair.fixed || content !== params.initialContent;

  let bestContent = content;
  let bestErrorCount = syntaxResult.errors.length;
  let llmPasses = 0;
  let earlyStopReason: RepairEarlyStopReason = null;

  // Fas 3 (bättre mål för repair-LLM:en): the ORIGINATING gate diagnostics
  // (tsc/build/lint) as structured `file:line:col` primary lines with the
  // TSxxxx codes preserved. Without these, a tsc-origin repair fed the model
  // only esbuild syntax output + secondary context — the model optimized
  // against the wrong signal ("0 errors remain" → gate failed anyway).
  const originPrimaryDiagnostics = buildStructuredOriginDiagnostics(
    params.failedOutputs,
  );
  // Fas 3: notes about previous failed passes so pass > 0 does not repeat the
  // exact patch that already failed. Bounded to the most recent 2 passes.
  const priorAttemptNotes: string[] = [];

  // Fixer routing config for the repair gate. When the caller resolved a
  // fixer model (both production callers do), pass it through unchanged;
  // otherwise the gate resolves the default-tier fixer phase model.
  const gateConfig: LlmRepairConfig | undefined = params.fixerModel
    ? {
        fixerModel: params.fixerModel,
        thinking: params.fixerThinking,
        reasoningEffort: params.fixerReasoningEffort,
      }
    : undefined;

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
    // Fas 3 (base-aware tidig abort): a superseded version (newer version, or
    // files_json advanced past the repair's base snapshot) makes the rest of
    // the loop dead work — the base-bound save would discard it anyway. Abort
    // before spending an LLM pass. Checked BEFORE onBeforePass so the lease is
    // not renewed for work that won't happen.
    if (await params.shouldAbortSuperseded?.()) {
      earlyStopReason = "superseded";
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
        ...originPrimaryDiagnostics,
        ...priorAttemptNotes,
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

    const contentBeforePass = content;
    const originalMaxTokens = params.fixerMaxTokens ?? AUTOFIX_MAX_OUTPUT_TOKENS;
    const reducedMaxTokens = Math.max(1, Math.floor(originalMaxTokens * 0.5));
    let fixerAttemptCount = 0;
    // Fas 3 (RepairGate): the loop's LLM calls go through the SAME
    // `runLlmRepairGate` as every finalize repair lane — one port, one
    // ledger. A shared ledger (threaded from finalize via the caller)
    // dedupes content+diagnostics already LLM-repaired in another lane.
    const runFixerAttempt = async (
      attemptErrors: string[],
      maxTokens: number,
      timeoutMs: number,
      bundleOverride?: TargetedRepairBundle | null,
    ): Promise<FixerResult> => {
      const activeBundle = bundleOverride ?? targetedBundle;
      const activeFixerInput = activeBundle?.contentForFixer ?? content;
      const gate = await runLlmRepairGate({
        content: activeFixerInput,
        errors: attemptErrors,
        chatId: params.chatId ?? "",
        timeoutMs,
        maxTokens,
        requiredFiles: activeBundle?.requiredFiles ?? brokenFiles,
        config: gateConfig,
        recurringPatterns: params.recurringPatterns ?? [],
        phase: "repair-loop",
        scopeId: params.repairScopeId,
        ledger: params.repairLedger,
      });
      // A deduped attempt made no LLM call; keep llmPasses an honest count of
      // actual fixer invocations. A deduped result flows on as a no-op
      // (`success:false`, `partial:false`) → `fixer_noop` early stop.
      if (!gate.deduped) fixerAttemptCount++;
      return gate.result;
    };

    const mergePartialFixerOutput = async (
      result: FixerResult,
      bundle: TargetedRepairBundle | null,
    ): Promise<void> => {
      if (!result.partial || result.fixedFiles.length === 0) return;
      const fixerOutput = bundle
        ? bundle.mergeBack(result.fixedContent)
        : result.fixedContent;
      const reFixed = await runAutoFix(fixerOutput, {
        previewPolicy: params.previewPolicy,
      });
      content = reFixed.fixedContent;
      syntaxResult = await validateGeneratedCode(content);
      if (syntaxResult.errors.length < bestErrorCount) {
        bestErrorCount = syntaxResult.errors.length;
        bestContent = content;
      }
    };

    const buildRetryTargetedBundle = (
      result: FixerResult,
    ): TargetedRepairBundle | null => {
      if (params.enableTargetedRepair === false) return null;
      const retryBrokenFiles = [
        ...new Set([
          ...syntaxResult.errors.map((error) => error.file).filter(Boolean),
          ...result.incompleteFiles.map((entry) => entry.path),
          ...result.missingFiles,
          ...filesFromGateOutput,
        ]),
      ];
      if (retryBrokenFiles.length === 0) return null;
      return buildTargetedRepairBundle({
        fullContent: content,
        brokenFiles: retryBrokenFiles,
        maxFiles: Math.min(
          params.targetedRepairMaxFiles ?? 16,
          Math.max(1, retryBrokenFiles.length),
        ),
      });
    };

    let activeBundle: TargetedRepairBundle | null = targetedBundle;
    let fixerResult = await runFixerAttempt(
      errorSummary,
      originalMaxTokens,
      params.llmTimeoutMs,
      activeBundle,
    );

    const needsTargetedRetry =
      fixerResult.aborted ||
      (fixerResult.partial &&
        !fixerResult.success &&
        (fixerResult.incompleteFiles.length > 0 || fixerResult.missingFiles.length > 0));

    if (needsTargetedRetry) {
      if (fixerResult.aborted) {
        devLogAppend("in-progress", {
          type: "repair_loop.llm_abort",
          chatId: params.chatId,
          pass: pass + 1,
          attempt: "primary",
          aborted: true,
          hasDeterministicProgress,
          inputFileCount: (activeBundle?.requiredFiles ?? brokenFiles).length,
          inputCharLength: (activeBundle?.contentForFixer ?? content).length,
          timeoutMs: params.llmTimeoutMs,
        });
      }
      await mergePartialFixerOutput(fixerResult, activeBundle);
      const retryBundle = buildRetryTargetedBundle(fixerResult);
      if (retryBundle) {
        activeBundle = retryBundle;
      } else if (activeBundle) {
        // Stale-bundle-skydd (bugbot HIGH, PR #380): pass-startens bundle har
        // `mergeBack`/`contentForFixer` stängda över PRE-partial-merge-
        // innehållet. Att behålla den efter `mergePartialFixerOutput` skulle
        // låta retry-mergen skriva över de accepterade partiella fixarna.
        // Bygg om SAMMA filurval mot aktuellt `content`; blir bundlen null
        // (t.ex. alla filer valda) körs retryn på hela aktuella innehållet
        // utan mergeBack — större prompt, men aldrig stale.
        activeBundle = buildTargetedRepairBundle({
          fullContent: content,
          brokenFiles: activeBundle.requiredFiles,
          maxFiles: Math.min(
            params.targetedRepairMaxFiles ?? 16,
            Math.max(1, activeBundle.requiredFiles.length),
          ),
        });
      }
      fixerResult = await runFixerAttempt(
        errorSummary.slice(0, 3),
        reducedMaxTokens,
        params.llmRetryTimeoutMs ?? params.llmTimeoutMs,
        activeBundle,
      );
      if (fixerResult.aborted) {
        devLogAppend("in-progress", {
          type: "repair_loop.llm_abort",
          chatId: params.chatId,
          pass: pass + 1,
          attempt: "retry",
          aborted: true,
          hasDeterministicProgress,
          inputFileCount: (activeBundle?.requiredFiles ?? brokenFiles).length,
          inputCharLength: (activeBundle?.contentForFixer ?? content).length,
          timeoutMs: params.llmRetryTimeoutMs ?? params.llmTimeoutMs,
        });
      }
    }
    const timedOut = fixerResult.aborted === true;
    llmPasses += fixerAttemptCount;

    if (!fixerResult.success && !fixerResult.partial) {
      // LLM produced no mergeable output. Deterministic pre-pass progress
      // (import-repair, dep-completer, etc.) still lives in `content` —
      // do NOT classify that as `no_improvement`. Fall through to the final
      // gate on `bestContent` when syntax is clean.
      if (!hasDeterministicProgress && content === preLlmBaselineContent) {
        const stopReason = resolveServerRepairEarlyStopReason({
          fixerProducedOutput: false,
          errorsBefore,
          errorsAfter: errorsBefore,
          timedOut,
        });
        earlyStopReason = stopReason === "continue" ? null : stopReason;
        break;
      }
      earlyStopReason = timedOut ? "time_budget_exceeded" : null;
      // Preserve the fewest-error snapshot invariant (VADE, PR #380): a
      // partial merge earlier in this pass can have left `content` WORSE
      // than `bestContent` — an unconditional overwrite would regress to a
      // more-broken snapshot and desync `bestContent`/`bestErrorCount`.
      // (`syntaxResult` always corresponds to `content` here: the partial-
      // merge helper revalidates, and the no-merge path leaves both as the
      // deterministic baseline that already seeded `bestContent`.)
      if (syntaxResult.errors.length < bestErrorCount) {
        bestErrorCount = syntaxResult.errors.length;
        bestContent = content;
      }
      break;
    }

    const fixerOutput = activeBundle
      ? activeBundle.mergeBack(fixerResult.fixedContent)
      : fixerResult.fixedContent;
    // post-LLM mechanical pass: normalizes the fixer output before the next
    // validate iteration. Required after every LLM pass. Carries the same
    // `previewPolicy` as the initial pass so an F3 LLM-fix that re-emits a
    // valid backend SDK import is not stripped by the F2 guard.
    const reFixed = await runAutoFix(fixerOutput, {
      previewPolicy: params.previewPolicy,
    });
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
    const fixerInputForPass = activeBundle?.contentForFixer ?? content;
    const contentChanged =
      fixerOutput !== fixerInputForPass || content !== contentBeforePass;
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
      if (stopReason === "no_improvement" && hasDeterministicProgress) {
        earlyStopReason = null;
        break;
      }
      earlyStopReason = stopReason;
      break;
    }
    if (syntaxResult.valid) break;
    // Fas 3 (bättre mål): tell the next pass what the previous one changed and
    // that the originating failure has not passed yet, so the model tries a
    // DIFFERENT approach instead of re-emitting the same patch.
    priorAttemptNotes.push(
      `[prior-attempt] pass ${pass + 1} edited ${
        fixerResult.fixedFiles.length > 0
          ? fixerResult.fixedFiles.slice(0, 6).join(", ")
          : "no files"
      } but the original failure is still unresolved (${syntaxResult.errors.length} syntax error(s) remain). Do not repeat that patch — try a different fix.`,
    );
    if (priorAttemptNotes.length > 2) priorAttemptNotes.shift();
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
  // Wall-clock graceful stop for the FINAL preview-host verify (#284 follow-up;
  // resolves Codex P1 + Bugbot HIGH on #286). The earlier fix reserved a FULL
  // static verify timeout before starting the gate, but that reserve ≈ the whole
  // loop budget, so the gate ALWAYS skipped and a manual LLM repair never promoted
  // (Bugbot HIGH). Compute the ACTUAL remaining budget instead:
  //   - too little left (<= floor) → skip gracefully so the caller fails +
  //     releases the lease (the syntax-clean but UNVERIFIED content is not
  //     promoted), set `time_budget_exceeded`;
  //   - otherwise → RUN the verify, passing an absolute deadline so the verify's
  //     AbortSignal (derived from `deadline - now` at the fetch site) fires before
  //     the route's maxDuration even after async prep, and
  //     `finally { releaseVersionLease }` always runs (Codex P1). The fetch-site
  //     clamp keeps the timeout under the static verify cap (route-budget invariant).
  // Fas 3 (base-aware tidig abort): re-check right before the final verify.
  // A pass may have taken minutes; if the version got superseded meanwhile,
  // skip the (expensive) final gate — the base-bound save would discard the
  // result anyway. `earlyStopReason` may already be "superseded" from the
  // per-pass check above.
  if (
    syntaxClean &&
    earlyStopReason !== "superseded" &&
    (await params.shouldAbortSuperseded?.())
  ) {
    earlyStopReason = "superseded";
  }
  if (syntaxClean && earlyStopReason !== "superseded") {
    const finalGate = resolveFinalGateVerifyBudget({
      deadlineEpochMs: params.repairDeadlineEpochMs,
      nowMs: Date.now(),
      floorMs: FINAL_GATE_MIN_FLOOR_MS,
      releaseMarginMs: FINAL_GATE_RELEASE_MARGIN_MS,
    });
    if (finalGate.skip) {
      earlyStopReason = "time_budget_exceeded";
    } else {
      const promoted = await params.onAttemptPromotion(bestContent, "llm", {
        verifyDeadlineEpochMs: finalGate.verifyDeadlineEpochMs,
      });
      return {
        promoted: promoted.promoted,
        method: "llm",
        payload: promoted.payload,
        llmPasses,
        // M#sr0: gate-only failures (syntax clean but the quality gate still
        // fails) used to exit via the `if (syntaxResult.valid) break` above with
        // `earlyStopReason` left null, so prod saw 0/16 promoted server-repairs
        // all reporting `earlyStopReason=null` — silent. When the final gate
        // does NOT promote, surface an explicit `no_improvement` so the outcome
        // is observable and the caller can name a reason. A successful promotion
        // keeps the existing reason (null on a clean resolve).
        earlyStopReason: promoted.promoted
          ? earlyStopReason
          : resolveNonPromotedEarlyStopReason({
              earlyStopReason,
              hasDeterministicProgress,
              improvedSyntax: 0 < initialSyntaxErrorCount,
            }),
        remainingErrors: 0,
        improvedSyntax: 0 < initialSyntaxErrorCount,
        noContext: false,
        errorManifest: finalErrorManifest,
      };
    }
  }

  return {
    promoted: false,
    method: "llm",
    llmPasses,
    // M#sr0: a non-promoted loop must never report `earlyStopReason=null`. If
    // the loop ran its passes without an explicit early stop (or skipped the
    // final gate), default to `no_improvement` so the failure is observable.
    earlyStopReason: resolveNonPromotedEarlyStopReason({
      earlyStopReason,
      hasDeterministicProgress,
      improvedSyntax: finalSyntaxResult.errors.length < initialSyntaxErrorCount,
    }),
    remainingErrors: finalSyntaxResult.errors.length,
    improvedSyntax: finalSyntaxResult.errors.length < initialSyntaxErrorCount,
    noContext: false,
    errorManifest: finalErrorManifest,
  };
}
