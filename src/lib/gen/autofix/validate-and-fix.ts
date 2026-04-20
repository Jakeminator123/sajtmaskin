import { runLlmFixer } from "./llm-fixer";
import { runAutoFix } from "./pipeline";
import { resolvePhaseModel, resolvePhaseThinking } from "@/lib/models/phase-routing";
import type { BuildSpecPreviewPolicy } from "@/lib/gen/build-spec";
import type { CanonicalModelId } from "@/lib/models/catalog";
import { devLogAppend } from "@/lib/logging/devLog";
import { readRecurringPatternsForChat } from "@/lib/logging/generation-log-writer";
import { incEarlyStop, recordPhaseDuration } from "@/lib/observability/metrics";
import { SYNTAX_FIX_MAX_PASSES } from "../defaults";
import { normalizeErrorPattern, countByFixer, type FixEntry } from "./types";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import type { PreVmTypecheckSkipReason } from "@/lib/gen/preview/warm-typecheck";

type ValidateFixStatus = "passed" | "partial" | "failed" | "pipeline-error";
type ValidateFixEarlyStopReason = "fixer_noop" | "no_improvement" | "time_budget_exceeded" | null;
const VALIDATOR_UNAVAILABLE_NEEDLE = "Syntax validator unavailable:";
const MAX_RESIDUAL_PATTERNS = 5;
const TSC_REPAIR_TIMEOUT_MS = 60_000;

export type TscPassOutcome =
  | { ran: false; skipped: PreVmTypecheckSkipReason | "esbuild_failed"; durationMs: number }
  | {
      ran: true;
      diagnosticCount: number;
      repaired: boolean;
      durationMs: number;
    };

export interface ValidateFixResult {
  content: string;
  hadErrors: boolean;
  fixerUsed: boolean;
  fixerImproved: boolean;
  errorsBefore: number;
  errorsAfter: number;
  passes: number;
  status: ValidateFixStatus;
  pipelineError: string | null;
  earlyStopReason: ValidateFixEarlyStopReason;
  mechanicalFixCount: number;
  llmFixCount: number;
  residualPatterns: string[];
  /**
   * Outcome of the warm-tsc pass that runs after esbuild passes. Absent when
   * esbuild itself never reached `passed` (the tsc pass requires a clean
   * baseline to avoid running tsc on syntactically broken code).
   */
  tsc?: TscPassOutcome;
}

export type ValidateFixProgressCallback = (event: {
  pass: number;
  phase:
    | "validating"
    | "fixing"
    | "retrying"
    | "passed"
    | "gave-up"
    | "tsc-validating"
    | "tsc-fixing"
    | "tsc-passed"
    | "tsc-skipped";
  errorCount: number;
}) => void;

function isBudgetExceeded(deadline: number): boolean {
  return Date.now() >= deadline;
}

function topPatterns(
  errors: Array<{ message: string }>,
  limit: number,
): string[] {
  const counts = new Map<string, number>();
  for (const e of errors) {
    const p = normalizeErrorPattern(e.message);
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([pattern]) => pattern);
}

/**
 * Warm-tsc post-pass: runs `tsc --noEmit` against a per-scaffold warm
 * `node_modules` cache to catch type-only / module-resolution errors that
 * esbuild missed. When diagnostics fire, performs a single LLM fixer
 * round (with timeout + scoped model) followed by deterministic autofix —
 * mirroring the syntax-validation loop above.
 *
 * Previously this lived in its own finalize step (`pre_vm_typecheck`) and
 * carried its own LLM-fixer call with no model/abort signal. Consolidated
 * here so the budget, model resolution and progress contract is shared
 * with esbuild validation. Skips silently when the cache is cold or the
 * scaffold is missing — same fail-open contract as before.
 */
async function runWarmTscPass(
  contentForVersion: string,
  opts: {
    chatId: string;
    model: string;
    resolvedTier?: CanonicalModelId;
    previewPolicy?: BuildSpecPreviewPolicy;
    resolvedScaffold?: ScaffoldManifest | null;
    forceTsc?: boolean;
    onProgress?: ValidateFixProgressCallback;
    pass: number;
    budgetDeadline: number;
  },
): Promise<{ content: string; tsc: TscPassOutcome; mechanicalFixesAdded: number; llmFixesAdded: number }> {
  const startedAt = Date.now();
  if (!opts.resolvedScaffold && !opts.forceTsc) {
    opts.onProgress?.({ pass: opts.pass, phase: "tsc-skipped", errorCount: 0 });
    return {
      content: contentForVersion,
      tsc: { ran: false, skipped: "no_files", durationMs: 0 },
      mechanicalFixesAdded: 0,
      llmFixesAdded: 0,
    };
  }
  if (isBudgetExceeded(opts.budgetDeadline)) {
    return {
      content: contentForVersion,
      tsc: { ran: false, skipped: "exception", durationMs: 0 },
      mechanicalFixesAdded: 0,
      llmFixesAdded: 0,
    };
  }
  try {
    const { runPreVmTypecheck, formatTypecheckDiagnosticsForRepair } = await import(
      "@/lib/gen/preview/warm-typecheck"
    );
    const { parseCodeProject } = await import("@/lib/gen/parser");
    const project = parseCodeProject(contentForVersion).files;
    opts.onProgress?.({ pass: opts.pass, phase: "tsc-validating", errorCount: 0 });
    const result = await runPreVmTypecheck({
      scaffoldId: opts.resolvedScaffold?.id ?? null,
      files: project,
      force: opts.forceTsc === true,
    });
    if (result.skipped) {
      opts.onProgress?.({ pass: opts.pass, phase: "tsc-skipped", errorCount: 0 });
      return {
        content: contentForVersion,
        tsc: { ran: false, skipped: result.skipped, durationMs: result.durationMs },
        mechanicalFixesAdded: 0,
        llmFixesAdded: 0,
      };
    }
    if (result.ok) {
      opts.onProgress?.({ pass: opts.pass, phase: "tsc-passed", errorCount: 0 });
      return {
        content: contentForVersion,
        tsc: {
          ran: true,
          diagnosticCount: 0,
          repaired: false,
          durationMs: result.durationMs,
        },
        mechanicalFixesAdded: 0,
        llmFixesAdded: 0,
      };
    }

    devLogAppend("in-progress", {
      type: "validate.tsc.diagnostics",
      chatId: opts.chatId,
      diagnosticCount: result.diagnostics.length,
      sample: result.diagnostics.slice(0, 5),
    });
    opts.onProgress?.({
      pass: opts.pass,
      phase: "tsc-fixing",
      errorCount: result.diagnostics.length,
    });

    const fixerModel = opts.resolvedTier
      ? resolvePhaseModel(opts.resolvedTier, "fixer").modelId
      : undefined;
    const fixerThinking = opts.resolvedTier
      ? resolvePhaseThinking(opts.resolvedTier, "fixer")
      : null;
    const tscFixAbort = new AbortController();
    const remainingBudgetMs = Math.max(1_000, opts.budgetDeadline - Date.now());
    const tscFixTimeout = setTimeout(
      () => tscFixAbort.abort(),
      Math.min(TSC_REPAIR_TIMEOUT_MS, remainingBudgetMs),
    );
    let mechanicalFixesAdded = 0;
    let llmFixesAdded = 0;
    try {
      const errors = formatTypecheckDiagnosticsForRepair(result.diagnostics);
      const repaired = await runLlmFixer(contentForVersion, errors, {
        model: fixerModel,
        thinking: fixerThinking?.thinking,
        reasoningEffort: fixerThinking?.reasoningEffort,
        recurringPatterns: readRecurringPatternsForChat(opts.chatId),
        abortSignal: tscFixAbort.signal,
      });
      if (repaired.success && repaired.fixedContent) {
        llmFixesAdded += repaired.fixedFiles.length;
        const reFixed = await runAutoFix(repaired.fixedContent, {
          chatId: opts.chatId,
          model: opts.model,
          previewPolicy: opts.previewPolicy,
        });
        mechanicalFixesAdded += reFixed.fixes.length;
        return {
          content: reFixed.fixedContent,
          tsc: {
            ran: true,
            diagnosticCount: result.diagnostics.length,
            repaired: true,
            durationMs: Date.now() - startedAt,
          },
          mechanicalFixesAdded,
          llmFixesAdded,
        };
      }
    } catch (repairErr) {
      devLogAppend("in-progress", {
        type: "validate.tsc.repair-error",
        chatId: opts.chatId,
        message: repairErr instanceof Error ? repairErr.message : String(repairErr),
      });
    } finally {
      clearTimeout(tscFixTimeout);
    }

    return {
      content: contentForVersion,
      tsc: {
        ran: true,
        diagnosticCount: result.diagnostics.length,
        repaired: false,
        durationMs: Date.now() - startedAt,
      },
      mechanicalFixesAdded,
      llmFixesAdded,
    };
  } catch (err) {
    devLogAppend("in-progress", {
      type: "validate.tsc.error",
      chatId: opts.chatId,
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      content: contentForVersion,
      tsc: { ran: false, skipped: "exception", durationMs: Date.now() - startedAt },
      mechanicalFixesAdded: 0,
      llmFixesAdded: 0,
    };
  }
}

/**
 * Validates generated code via esbuild, and if syntax errors are found,
 * runs the mechanical → LLM → mechanical loop up to the configured pass
 * limit.  Returns the best available content together with structured
 * telemetry (mechanical vs LLM fix counts, residual error patterns).
 *
 * Wraps the inner implementation in a try/finally so phase duration is
 * recorded to Prometheus regardless of exit path (success / pipeline-error
 * / thrown). The metrics module is fail-safe; observation never throws.
 */
export async function validateAndFix(
  content: string,
  opts: Parameters<typeof validateAndFixInner>[1],
): Promise<ValidateFixResult> {
  const startedAt = Date.now();
  try {
    return await validateAndFixInner(content, opts);
  } finally {
    try {
      recordPhaseDuration("validate_syntax", Date.now() - startedAt);
    } catch {
      // Telemetry must never break codegen; swallow.
    }
  }
}

async function validateAndFixInner(
  content: string,
  opts: {
    chatId: string;
    model: string;
    resolvedTier?: CanonicalModelId;
    onProgress?: ValidateFixProgressCallback;
    fixBudgetMs?: number;
    /** Forwarded to `runAutoFix` so the F2 SDK guard can run when active. */
    previewPolicy?: BuildSpecPreviewPolicy;
    /**
     * Skip the initial mechanical `runAutoFix` pass when the caller already
     * ran it on the same content (e.g. finalize-version.ts → outer autofix).
     * Avoids redundant idempotent work. The post-LLM mechanical pass inside
     * the repair loop is unaffected.
     */
    alreadyMechanicallyFixed?: boolean;
    /**
     * Resolved scaffold manifest — drives the warm-tsc cache lookup
     * (`scaffoldId`). Null/undefined disables the tsc pass; the function
     * still returns `passed` based on esbuild only.
     */
    resolvedScaffold?: ScaffoldManifest | null;
    /**
     * Force the warm-tsc pass even when `SAJTMASKIN_PRE_VM_TYPECHECK` is
     * disabled. Set by F3 (integrations) callers since the integrations
     * build always pays for the extra check.
     */
    forceTsc?: boolean;
  },
): Promise<ValidateFixResult> {
  const onProgress = opts.onProgress;
  const fixBudgetMs = Math.max(1_000, opts.fixBudgetMs ?? 180_000);
  const budgetDeadline = Date.now() + fixBudgetMs;
  let totalMechanicalFixes = 0;
  let totalLlmFixes = 0;

  const emitBudgetStop = (pass: number, bestErrorCount: number) => {
    onProgress?.({ pass, phase: "gave-up", errorCount: bestErrorCount === Infinity ? 0 : bestErrorCount });
    devLogAppend("in-progress", {
      type: "syntax-validation.early-stop",
      chatId: opts.chatId,
      pass,
      reason: "time_budget_exceeded",
      fixBudgetMs,
    });
  };

  try {
    const { validateGeneratedCode } = await import("../retry/validate-syntax");

    // Initial mechanical pass — skipped when caller already ran runAutoFix
    // on this exact content (idempotent: guards against double work in the
    // finalize-version.ts pipeline where the outer autofix runs first).
    let currentContent = content;
    let initialMechanicalFixes: FixEntry[] = [];
    if (!opts.alreadyMechanicallyFixed) {
      const preFixResult = await runAutoFix(content, {
        chatId: opts.chatId,
        model: opts.model,
        previewPolicy: opts.previewPolicy,
      });
      currentContent = preFixResult.fixedContent;
      initialMechanicalFixes = preFixResult.fixes as FixEntry[];
      totalMechanicalFixes += preFixResult.fixes.length;
    }

    let initialErrorCount = 0;
    let bestContent = content;
    let bestErrorCount = Infinity;
    let fixerUsed = false;
    let fixerImproved = false;
    let passCount = 0;
    let earlyStopReason: ValidateFixEarlyStopReason = null;
    let lastErrors: Array<{ file: string; line: number; column: number; message: string }> = [];

    for (let pass = 1; pass <= SYNTAX_FIX_MAX_PASSES; pass++) {
      passCount = pass;

      if (isBudgetExceeded(budgetDeadline)) {
        earlyStopReason = "time_budget_exceeded";
        try { incEarlyStop("time_budget_exceeded", "validate_syntax"); } catch {}
        emitBudgetStop(pass, bestErrorCount);
        break;
      }

      // --- validate ---
      onProgress?.({ pass, phase: "validating", errorCount: 0 });
      devLogAppend("in-progress", {
        type: "syntax-validation.pass",
        chatId: opts.chatId,
        pass,
        phase: "validating",
      });

      const validation = await validateGeneratedCode(currentContent);

      const validatorUnavailableError = validation.errors.find((error: { message: string }) =>
        error.message.includes(VALIDATOR_UNAVAILABLE_NEEDLE),
      );
      if (validatorUnavailableError) {
        devLogAppend("in-progress", {
          type: "syntax-validation.pipeline-error",
          chatId: opts.chatId,
          message: validatorUnavailableError.message,
        });
        return {
          content: currentContent,
          hadErrors: true,
          fixerUsed: false,
          fixerImproved: false,
          errorsBefore: validation.errors.length,
          errorsAfter: validation.errors.length,
          passes: passCount,
          status: "pipeline-error",
          pipelineError: validatorUnavailableError.message,
          earlyStopReason: null,
          mechanicalFixCount: totalMechanicalFixes,
          llmFixCount: totalLlmFixes,
          residualPatterns: [],
        };
      }

      if (pass === 1) initialErrorCount = validation.errors.length;

      // --- clean? run warm-tsc post-pass and we're done ---
      if (validation.valid) {
        onProgress?.({ pass, phase: "passed", errorCount: 0 });
        devLogAppend("in-progress", {
          type: "syntax-validation.pass",
          chatId: opts.chatId,
          pass,
          phase: "passed",
          errorCount: 0,
        });
        const tscResult = await runWarmTscPass(currentContent, {
          chatId: opts.chatId,
          model: opts.model,
          resolvedTier: opts.resolvedTier,
          previewPolicy: opts.previewPolicy,
          resolvedScaffold: opts.resolvedScaffold,
          forceTsc: opts.forceTsc,
          onProgress,
          pass,
          budgetDeadline,
        });
        currentContent = tscResult.content;
        totalMechanicalFixes += tscResult.mechanicalFixesAdded;
        totalLlmFixes += tscResult.llmFixesAdded;
        return {
          content: currentContent,
          hadErrors: initialErrorCount > 0,
          fixerUsed: fixerUsed || tscResult.llmFixesAdded > 0,
          fixerImproved:
            fixerImproved || (tscResult.tsc.ran && tscResult.tsc.repaired),
          errorsBefore: initialErrorCount,
          errorsAfter: 0,
          passes: passCount,
          status: "passed",
          pipelineError: null,
          earlyStopReason,
          mechanicalFixCount: totalMechanicalFixes,
          llmFixCount: totalLlmFixes,
          residualPatterns: [],
          tsc: tscResult.tsc,
        };
      }

      // --- track best ---
      lastErrors = validation.errors;
      if (validation.errors.length < bestErrorCount) {
        bestErrorCount = validation.errors.length;
        bestContent = currentContent;
      }

      devLogAppend("in-progress", {
        type: "syntax-validation.pass",
        chatId: opts.chatId,
        pass,
        phase: "invalid",
        errorCount: validation.errors.length,
        errors: validation.errors.slice(0, 8).map((error: { file: string; line: number; message: string }) => ({
          file: error.file,
          line: error.line,
          message: error.message,
        })),
      });

      // --- residual telemetry: what mechanical fixers left behind ---
      if (pass === 1) {
        devLogAppend("in-progress", {
          type: "autofix.mechanical-residual",
          chatId: opts.chatId,
          mechanicalFixCount: initialMechanicalFixes.length,
          residualErrorCount: validation.errors.length,
          residualErrors: validation.errors.slice(0, 12).map((e: { file: string; line: number; message: string }) => ({
            file: e.file,
            line: e.line,
            message: e.message,
            pattern: normalizeErrorPattern(e.message),
          })),
          topMechanicalFixers: countByFixer(initialMechanicalFixes),
        });
      }

      // --- LLM fixer ---
      // Note: the "is this the last pass? give up" check used to live HERE,
      // before runLlmFixer was invoked. That made the LLM fixer dead code on
      // the final pass — and entirely unreachable when SYNTAX_FIX_MAX_PASSES
      // was 1. Moved AFTER the fixer block (search for "last pass with errors")
      // so the fixer always gets a chance on every pass within budget.
      const errorSummary = validation.errors.map(
        (e: { file: string; line: number; column: number; message: string }) =>
          `${e.file}:${e.line}:${e.column} ${e.message}`,
      );
      console.warn(`[engine] Pass ${pass}: ${validation.errors.length} syntax errors, attempting LLM fixer`);

      onProgress?.({ pass, phase: "fixing", errorCount: validation.errors.length });
      const fixerModel = opts.resolvedTier
        ? resolvePhaseModel(opts.resolvedTier, "fixer").modelId
        : undefined;
      const fixerThinking = opts.resolvedTier
        ? resolvePhaseThinking(opts.resolvedTier, "fixer")
        : null;
      devLogAppend("in-progress", {
        type: "syntax-validation.fixer.start",
        chatId: opts.chatId,
        pass,
        errorCount: validation.errors.length,
        errors: errorSummary.slice(0, 8),
        fixerModel: fixerModel ?? null,
      });

      try {
        const brokenFiles = [
          ...new Set(validation.errors.map((error: { file: string }) => error.file).filter(Boolean)),
        ];
        if (isBudgetExceeded(budgetDeadline)) {
          earlyStopReason = "time_budget_exceeded";
          try { incEarlyStop("time_budget_exceeded", "validate_syntax"); } catch {}
          emitBudgetStop(pass, bestErrorCount);
          break;
        }

        const remainingBudgetMs = budgetDeadline - Date.now();
        const fixerAbort = new AbortController();
        const timeoutHandle = setTimeout(() => fixerAbort.abort(), remainingBudgetMs);
        let fixerResult: Awaited<ReturnType<typeof runLlmFixer>>;
        try {
          fixerResult = await runLlmFixer(currentContent, errorSummary, {
            model: fixerModel,
            thinking: fixerThinking?.thinking,
            reasoningEffort: fixerThinking?.reasoningEffort,
            requiredFiles: brokenFiles,
            recurringPatterns: readRecurringPatternsForChat(opts.chatId),
            abortSignal: fixerAbort.signal,
          });
        } finally {
          clearTimeout(timeoutHandle);
        }

        const canRetry = fixerResult.success || fixerResult.partial;
        if (!canRetry) {
          devLogAppend("in-progress", {
            type: "syntax-validation.fixer.noop",
            chatId: opts.chatId,
            pass,
            errorCount: validation.errors.length,
          });
          earlyStopReason = "fixer_noop";
          try { incEarlyStop("fixer_noop", "validate_syntax"); } catch {}
          onProgress?.({ pass, phase: "gave-up", errorCount: validation.errors.length });
          devLogAppend("in-progress", {
            type: "syntax-validation.early-stop",
            chatId: opts.chatId,
            pass,
            reason: earlyStopReason,
            errorCount: validation.errors.length,
          });
          break;
        }

        fixerUsed = true;
        totalLlmFixes += fixerResult.fixedFiles.length;

        if (fixerResult.partial) {
          devLogAppend("in-progress", {
            type: "syntax-validation.fixer.partial",
            chatId: opts.chatId,
            pass,
            missingFiles: fixerResult.missingFiles,
            fixedFiles: fixerResult.fixedFiles,
          });
        }

        // Mechanical pass on LLM output — required after each LLM fixer pass to
        // normalize freshly emitted imports/structure before the next validate pass.
        // Not deduped with the initial mechanical pass: content has changed.
        onProgress?.({ pass, phase: "retrying", errorCount: validation.errors.length });
        const reFixed = await runAutoFix(fixerResult.fixedContent, {
          chatId: opts.chatId,
          model: opts.model,
          previewPolicy: opts.previewPolicy,
        });
        currentContent = reFixed.fixedContent;
        totalMechanicalFixes += reFixed.fixes.length;

        if (isBudgetExceeded(budgetDeadline)) {
          earlyStopReason = "time_budget_exceeded";
          try { incEarlyStop("time_budget_exceeded", "validate_syntax"); } catch {}
          emitBudgetStop(pass, bestErrorCount);
          break;
        }

        const reValidation = await validateGeneratedCode(currentContent);
        if (reValidation.errors.length < bestErrorCount) {
          bestErrorCount = reValidation.errors.length;
          bestContent = currentContent;
          fixerImproved = true;
        }
        lastErrors = reValidation.errors;

        devLogAppend("in-progress", {
          type: "syntax-validation.fixer.result",
          chatId: opts.chatId,
          pass,
          errorsBefore: validation.errors.length,
          errorsAfter: reValidation.errors.length,
          improved: reValidation.errors.length < validation.errors.length,
          valid: reValidation.valid,
          fixerModel: fixerModel ?? null,
        });

        if (reValidation.valid) {
          console.info(`[engine] Pass ${pass}: LLM fixer resolved all errors`);
          onProgress?.({ pass, phase: "passed", errorCount: 0 });
          const tscResult = await runWarmTscPass(currentContent, {
            chatId: opts.chatId,
            model: opts.model,
            resolvedTier: opts.resolvedTier,
            previewPolicy: opts.previewPolicy,
            resolvedScaffold: opts.resolvedScaffold,
            forceTsc: opts.forceTsc,
            onProgress,
            pass,
            budgetDeadline,
          });
          currentContent = tscResult.content;
          totalMechanicalFixes += tscResult.mechanicalFixesAdded;
          totalLlmFixes += tscResult.llmFixesAdded;
          return {
            content: currentContent,
            hadErrors: true,
            fixerUsed: true,
            fixerImproved: true,
            errorsBefore: initialErrorCount,
            errorsAfter: 0,
            passes: passCount,
            status: "passed",
            pipelineError: null,
            earlyStopReason,
            mechanicalFixCount: totalMechanicalFixes,
            llmFixCount: totalLlmFixes,
            residualPatterns: [],
            tsc: tscResult.tsc,
          };
        }

        console.info(`[engine] Pass ${pass}: errors reduced ${validation.errors.length} -> ${reValidation.errors.length}`);
        if (reValidation.errors.length >= validation.errors.length) {
          earlyStopReason = "no_improvement";
          try { incEarlyStop("no_improvement", "validate_syntax"); } catch {}
          onProgress?.({ pass, phase: "gave-up", errorCount: reValidation.errors.length });
          devLogAppend("in-progress", {
            type: "syntax-validation.early-stop",
            chatId: opts.chatId,
            pass,
            reason: earlyStopReason,
            errorsBefore: validation.errors.length,
            errorsAfter: reValidation.errors.length,
          });
          break;
        }
      } catch (fixerError) {
        console.warn(`[engine] Pass ${pass}: LLM fixer failed`, fixerError);
        devLogAppend("in-progress", {
          type: "syntax-validation.fixer.error",
          chatId: opts.chatId,
          pass,
          errorCount: validation.errors.length,
          message: fixerError instanceof Error ? fixerError.message : "Unknown fixer error",
          fixerModel: fixerModel ?? null,
        });
        if (isBudgetExceeded(budgetDeadline)) {
          earlyStopReason = "time_budget_exceeded";
          try { incEarlyStop("time_budget_exceeded", "validate_syntax"); } catch {}
          emitBudgetStop(pass, bestErrorCount);
          break;
        }
      }

      // --- last pass with errors? give up ---
      // Runs AFTER the LLM fixer attempt so the fixer always gets a chance,
      // even on the final pass. (Earlier this lived before the fixer block,
      // making the fixer dead code on the final pass and unreachable when
      // SYNTAX_FIX_MAX_PASSES === 1.)
      if (pass === SYNTAX_FIX_MAX_PASSES) {
        const remaining =
          bestErrorCount === Infinity ? lastErrors.length : bestErrorCount;
        onProgress?.({ pass, phase: "gave-up", errorCount: remaining });
        devLogAppend("in-progress", {
          type: "syntax-validation.gave-up",
          chatId: opts.chatId,
          pass,
          errorCount: remaining,
        });
        break;
      }
    }

    return {
      content: bestContent,
      hadErrors: true,
      fixerUsed,
      fixerImproved,
      errorsBefore: initialErrorCount,
      errorsAfter: bestErrorCount === Infinity ? initialErrorCount : bestErrorCount,
      passes: passCount,
      status:
        bestErrorCount === Infinity || bestErrorCount >= initialErrorCount
          ? "failed"
          : "partial",
      pipelineError: null,
      earlyStopReason,
      mechanicalFixCount: totalMechanicalFixes,
      llmFixCount: totalLlmFixes,
      residualPatterns: topPatterns(lastErrors, MAX_RESIDUAL_PATTERNS),
    };
  } catch (err) {
    const pipelineErrorMessage =
      err instanceof Error ? err.message : "Unknown validation pipeline error";
    console.warn("[engine] Validation pipeline error, returning explicit failure state", err);
    devLogAppend("in-progress", {
      type: "syntax-validation.pipeline-error",
      chatId: opts.chatId,
      message: pipelineErrorMessage,
    });
    return {
      content,
      hadErrors: true,
      fixerUsed: false,
      fixerImproved: false,
      errorsBefore: 0,
      errorsAfter: 0,
      passes: 0,
      status: "pipeline-error",
      pipelineError: pipelineErrorMessage,
      earlyStopReason: null,
      mechanicalFixCount: totalMechanicalFixes,
      llmFixCount: totalLlmFixes,
      residualPatterns: [],
    };
  }
}
