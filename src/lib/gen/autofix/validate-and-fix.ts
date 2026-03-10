import { runLlmFixer } from "./llm-fixer";
import { runAutoFix } from "./pipeline";

export interface ValidateFixResult {
  content: string;
  hadErrors: boolean;
  fixerUsed: boolean;
  fixerImproved: boolean;
  errorsBefore: number;
  errorsAfter: number;
}

/**
 * Validates generated code via esbuild, and if syntax errors are found,
 * attempts a single LLM fixer pass (cheap GPT-4.1-mini) followed by
 * re-autofix + re-validation. Returns the best available content.
 *
 * Safe to call in the hot path — all failures are caught internally
 * and the original content is returned unchanged.
 */
export async function validateAndFix(
  content: string,
  opts: { chatId: string; model: string },
): Promise<ValidateFixResult> {
  try {
    const { validateGeneratedCode } = await import("../retry/validate-syntax");
    const validation = await validateGeneratedCode(content);
    if (validation.valid) {
      return {
        content,
        hadErrors: false,
        fixerUsed: false,
        fixerImproved: false,
        errorsBefore: 0,
        errorsAfter: 0,
      };
    }

    const errorSummary = validation.errors.map(
      (e) => `${e.file}:${e.line} ${e.message}`,
    );
    console.warn("[engine] Syntax errors after autofix, attempting LLM fixer", {
      errorCount: validation.errors.length,
    });

    try {
      const fixerResult = await runLlmFixer(content, errorSummary);
      if (fixerResult.success) {
        const reFixed = await runAutoFix(fixerResult.fixedContent, {
          chatId: opts.chatId,
          model: opts.model,
        });
        const { validateGeneratedCode: reValidate } = await import("../retry/validate-syntax");
        const reValidation = await reValidate(reFixed.fixedContent);
        if (
          reValidation.valid ||
          reValidation.errors.length < validation.errors.length
        ) {
          console.info("[engine] LLM fixer improved code", {
            errorsBefore: validation.errors.length,
            errorsAfter: reValidation.errors.length,
          });
          return {
            content: reFixed.fixedContent,
            hadErrors: true,
            fixerUsed: true,
            fixerImproved: true,
            errorsBefore: validation.errors.length,
            errorsAfter: reValidation.errors.length,
          };
        }
      }
    } catch (fixerError) {
      console.warn("[engine] LLM fixer failed, using autofix result", fixerError);
    }

    return {
      content,
      hadErrors: true,
      fixerUsed: false,
      fixerImproved: false,
      errorsBefore: validation.errors.length,
      errorsAfter: validation.errors.length,
    };
  } catch (err) {
    console.warn("[engine] Validation pipeline error, using original content", err);
    return {
      content,
      hadErrors: false,
      fixerUsed: false,
      fixerImproved: false,
      errorsBefore: 0,
      errorsAfter: 0,
    };
  }
}
