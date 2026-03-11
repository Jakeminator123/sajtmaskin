import { runLlmFixer } from "./llm-fixer";
import { runAutoFix } from "./pipeline";
import { devLogAppend } from "@/lib/logging/devLog";

export interface ValidateFixResult {
  content: string;
  hadErrors: boolean;
  fixerUsed: boolean;
  fixerImproved: boolean;
  errorsBefore: number;
  errorsAfter: number;
  passes: number;
}

export type ValidateFixProgressCallback = (event: {
  pass: number;
  phase: "validating" | "fixing" | "retrying" | "passed" | "gave-up";
  errorCount: number;
}) => void;

const MAX_FIX_PASSES = 3;

/**
 * Validates generated code via esbuild, and if syntax errors are found,
 * attempts up to MAX_FIX_PASSES LLM fixer rounds (cheap GPT-4.1-mini)
 * followed by re-autofix + re-validation each time. Returns the best
 * available content.
 *
 * The optional `onProgress` callback is called at each step so the
 * caller can emit SSE events for the client UI.
 */
export async function validateAndFix(
  content: string,
  opts: { chatId: string; model: string; onProgress?: ValidateFixProgressCallback },
): Promise<ValidateFixResult> {
  const onProgress = opts.onProgress;

  try {
    const { validateGeneratedCode } = await import("../retry/validate-syntax");

    let currentContent = content;
    let initialErrorCount = 0;
    let bestContent = content;
    let bestErrorCount = Infinity;
    let fixerUsed = false;
    let fixerImproved = false;
    let passCount = 0;

    for (let pass = 1; pass <= MAX_FIX_PASSES; pass++) {
      passCount = pass;
      onProgress?.({ pass, phase: "validating", errorCount: 0 });
      devLogAppend("in-progress", {
        type: "syntax-validation.pass",
        chatId: opts.chatId,
        pass,
        phase: "validating",
      });

      const validation = await validateGeneratedCode(currentContent);
      if (pass === 1) initialErrorCount = validation.errors.length;

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
        };
      }

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
        errors: validation.errors.slice(0, 8).map((error) => ({
          file: error.file,
          line: error.line,
          message: error.message,
        })),
      });

      if (pass === MAX_FIX_PASSES) {
        onProgress?.({ pass, phase: "gave-up", errorCount: validation.errors.length });
        devLogAppend("in-progress", {
          type: "syntax-validation.gave-up",
          chatId: opts.chatId,
          pass,
          errorCount: validation.errors.length,
        });
        break;
      }

      const errorSummary = validation.errors.map(
        (e) => `${e.file}:${e.line} ${e.message}`,
      );
      console.warn(`[engine] Pass ${pass}: ${validation.errors.length} syntax errors, attempting LLM fixer`);

      onProgress?.({ pass, phase: "fixing", errorCount: validation.errors.length });
      devLogAppend("in-progress", {
        type: "syntax-validation.fixer.start",
        chatId: opts.chatId,
        pass,
        errorCount: validation.errors.length,
        errors: errorSummary.slice(0, 8),
      });

      try {
        const fixerResult = await runLlmFixer(currentContent, errorSummary);
        if (fixerResult.success) {
          fixerUsed = true;
          onProgress?.({ pass, phase: "retrying", errorCount: validation.errors.length });

          const reFixed = await runAutoFix(fixerResult.fixedContent, {
            chatId: opts.chatId,
            model: opts.model,
          });
          currentContent = reFixed.fixedContent;

          const reValidation = await validateGeneratedCode(currentContent);
          if (reValidation.errors.length < bestErrorCount) {
            bestErrorCount = reValidation.errors.length;
            bestContent = currentContent;
            fixerImproved = true;
          }

          devLogAppend("in-progress", {
            type: "syntax-validation.fixer.result",
            chatId: opts.chatId,
            pass,
            errorsBefore: validation.errors.length,
            errorsAfter: reValidation.errors.length,
            improved: reValidation.errors.length < validation.errors.length,
            valid: reValidation.valid,
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
            };
          }

          console.info(`[engine] Pass ${pass}: errors reduced ${validation.errors.length} -> ${reValidation.errors.length}`);
        } else {
          devLogAppend("in-progress", {
            type: "syntax-validation.fixer.noop",
            chatId: opts.chatId,
            pass,
            errorCount: validation.errors.length,
          });
        }
      } catch (fixerError) {
        console.warn(`[engine] Pass ${pass}: LLM fixer failed`, fixerError);
        devLogAppend("in-progress", {
          type: "syntax-validation.fixer.error",
          chatId: opts.chatId,
          pass,
          errorCount: validation.errors.length,
          message: fixerError instanceof Error ? fixerError.message : "Unknown fixer error",
        });
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
    };
  } catch (err) {
    console.warn("[engine] Validation pipeline error, using original content", err);
    devLogAppend("in-progress", {
      type: "syntax-validation.pipeline-error",
      chatId: opts.chatId,
      message: err instanceof Error ? err.message : "Unknown validation pipeline error",
    });
    return {
      content,
      hadErrors: false,
      fixerUsed: false,
      fixerImproved: false,
      errorsBefore: 0,
      errorsAfter: 0,
      passes: 0,
    };
  }
}
