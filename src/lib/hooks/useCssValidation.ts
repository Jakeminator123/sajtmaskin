"use client";

import { useCallback, useState } from "react";
import toast from "react-hot-toast";

export interface CssValidationResult {
  valid: boolean;
  issues: Array<{
    fileName: string;
    issues: Array<{
      type: string;
      line: number;
      column: number;
      property?: string;
      original: string;
      suggestion?: string;
      severity: "error" | "warning";
    }>;
  }>;
  fixed?: boolean;
  message?: string;
  demoUrl?: string;
}

interface UseCssValidationOptions {
  /** Show toast notifications for issues */
  showToasts?: boolean;
  /** Auto-fix issues if found */
  autoFix?: boolean;
}

/**
 * Hook for validating CSS in generated code
 *
 * Usage:
 * ```tsx
 * const { validateAndFix, isValidating } = useCssValidation({ autoFix: true });
 *
 * // After generation completes:
 * const result = await validateAndFix(chatId, versionId);
 * if (result && !result.valid) {
 *   console.log('Found CSS issues:', result.issues);
 * }
 * ```
 */
export function useCssValidation(options: UseCssValidationOptions = {}) {
  const { showToasts = true, autoFix = false } = options;
  const [isValidating, setIsValidating] = useState(false);
  const [lastResult, setLastResult] = useState<CssValidationResult | null>(null);

  const validateAndFix = useCallback(
    async (chatId: string, versionId: string): Promise<CssValidationResult | null> => {
      if (!chatId || !versionId) {
        console.warn("[useCssValidation] Missing chatId or versionId");
        return null;
      }

      setIsValidating(true);

      try {
        const response = await fetch(`/api/v0/chats/${chatId}/validate-css`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ versionId, autoFix }),
        });

        const payload = (await response.json().catch(() => null)) as
          | (CssValidationResult & { error?: string })
          | null;
        if (!response.ok) {
          throw new Error(payload?.error || "Validation failed");
        }
        if (!payload) {
          throw new Error("Validation failed");
        }
        const result: CssValidationResult = payload;
        setLastResult(result);

        // Show notifications
        if (showToasts) {
          if (!result.valid) {
            const errorCount = result.issues.reduce(
              (sum, r) => sum + r.issues.filter((i) => i.severity === "error").length,
              0,
            );

            if (result.fixed) {
              toast.success(`Fixed ${errorCount} CSS issues automatically`);
            } else if (errorCount > 0) {
              toast.error(
                `Found ${errorCount} CSS issues that may cause preview errors. Consider reviewing globals.css.`,
                { duration: 6000 },
              );
            }
          }
        }

        return result;
      } catch (error) {
        console.error("[useCssValidation] Error:", error);
        if (showToasts) {
          toast.error("Failed to validate CSS");
        }
        return null;
      } finally {
        setIsValidating(false);
      }
    },
    [autoFix, showToasts],
  );

  const clearResult = useCallback(() => {
    setLastResult(null);
  }, []);

  return {
    validateAndFix,
    isValidating,
    lastResult,
    clearResult,
  };
}
