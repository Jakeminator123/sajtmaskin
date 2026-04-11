import { runLlmFixer } from "./llm-fixer";
import { runAutoFix } from "./pipeline";
import { resolvePhaseModel } from "@/lib/models/phase-routing";
import type { CanonicalModelId } from "@/lib/models/catalog";
import { devLogAppend } from "@/lib/logging/devLog";
import { SYNTAX_FIX_MAX_PASSES } from "../defaults";
import { normalizeErrorPattern, countByFixer, type FixEntry } from "./types";

type ValidateFixStatus = "passed" | "partial" | "failed" | "pipeline-error";
type ValidateFixEarlyStopReason = "fixer_noop" | "no_improvement" | "time_budget_exceeded" | null;
const VALIDATOR_UNAVAILABLE_NEEDLE = "Syntax validator unavailable:";
const MAX_RESIDUAL_PATTERNS = 5;

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
}

export type ValidateFixProgressCallback = (event: {
  pass: number;
  phase: "validating" | "fixing" | "retrying" | "passed" | "gave-up";
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
 * Validates generated code via esbuild, and if syntax errors are found,
 * runs the mechanical → LLM → mechanical loop up to the configured pass
 * limit.  Returns the best available content together with structured
 * telemetry (mechanical vs LLM fix counts, residual error patterns).
 */
export async function validateAndFix(
  content: string,
  opts: {
    chatId: string;
    model: string;
    resolvedTier?: CanonicalModelId;
    onProgress?: ValidateFixProgressCallback;
    fixBudgetMs?: number;
  },
): Promise<ValidateFixResult> {
  const onProgress = opts.onProgress;
  const fixBudgetMs = Math.max(1_000, opts.fixBudgetMs ?? 120_000);
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

    // Initial mechanical pass
    const preFixResult = await runAutoFix(content, {
      chatId: opts.chatId,
      model: opts.model,
    });
    let currentContent = preFixResult.fixedContent;
    totalMechanicalFixes += preFixResult.fixes.length;

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

      // --- clean? done! ---
      if (validation.valid) {
        onProgress?.({ pass, phase: "passed", errorCount: 0 });
        devLogAppend("in-progress", {
          type: "syntax-validation.pass",
          chatId: opts.chatId,
          pass,
          phase: "passed",
          errorCount: 0,
        });
        return {
          content: currentContent,
          hadErrors: initialErrorCount > 0,
          fixerUsed,
          fixerImproved,
          errorsBefore: initialErrorCount,
          errorsAfter: 0,
          passes: passCount,
          status: "passed",
          pipelineError: null,
          earlyStopReason,
          mechanicalFixCount: totalMechanicalFixes,
          llmFixCount: totalLlmFixes,
          residualPatterns: [],
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
          mechanicalFixCount: preFixResult.fixes.length,
          residualErrorCount: validation.errors.length,
          residualErrors: validation.errors.slice(0, 12).map((e: { file: string; line: number; message: string }) => ({
            file: e.file,
            line: e.line,
            message: e.message,
            pattern: normalizeErrorPattern(e.message),
          })),
          topMechanicalFixers: countByFixer(preFixResult.fixes as FixEntry[]),
        });
      }

      // --- last pass? give up ---
      if (pass === SYNTAX_FIX_MAX_PASSES) {
        onProgress?.({ pass, phase: "gave-up", errorCount: validation.errors.length });
        devLogAppend("in-progress", {
          type: "syntax-validation.gave-up",
          chatId: opts.chatId,
          pass,
          errorCount: validation.errors.length,
        });
        break;
      }

      // --- LLM fixer ---
      const errorSummary = validation.errors.map(
        (e: { file: string; line: number; column: number; message: string }) =>
          `${e.file}:${e.line}:${e.column} ${e.message}`,
      );
      console.warn(`[engine] Pass ${pass}: ${validation.errors.length} syntax errors, attempting LLM fixer`);

      onProgress?.({ pass, phase: "fixing", errorCount: validation.errors.length });
      const fixerModel = opts.resolvedTier
        ? resolvePhaseModel(opts.resolvedTier, "fixer").modelId
        : undefined;
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
            requiredFiles: brokenFiles,
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

        // Mechanical pass on LLM output
        onProgress?.({ pass, phase: "retrying", errorCount: validation.errors.length });
        const reFixed = await runAutoFix(fixerResult.fixedContent, {
          chatId: opts.chatId,
          model: opts.model,
        });
        currentContent = reFixed.fixedContent;
        totalMechanicalFixes += reFixed.fixes.length;

        if (isBudgetExceeded(budgetDeadline)) {
          earlyStopReason = "time_budget_exceeded";
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
          };
        }

        console.info(`[engine] Pass ${pass}: errors reduced ${validation.errors.length} -> ${reValidation.errors.length}`);
        if (reValidation.errors.length >= validation.errors.length) {
          earlyStopReason = "no_improvement";
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
          emitBudgetStop(pass, bestErrorCount);
          break;
        }
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
