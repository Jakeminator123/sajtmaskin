/**
 * Render-success telemetry — tracks whether preview actually rendered
 * after generation, not just that the model produced output.
 *
 * Called from PreviewPanel when the iframe posts preview-ready or preview-error.
 * Stores outcome in version_error_logs (same table as other preview issues)
 * so it can be queried per version for quality metrics.
 */

import { describePreviewDiagnosticCode } from "@/lib/gen/preview-diagnostics";

export interface RenderOutcome {
  chatId: string;
  versionId: string;
  success: boolean;
  source: "own-engine" | "v0" | "sandbox" | "unknown";
  demoUrl?: string;
  durationMs?: number;
  errorMessage?: string;
  errorCategory?: string;
  errorCode?: string;
  errorStage?: string;
}

/**
 * Report render outcome to the server. Non-blocking, best-effort.
 */
export async function reportRenderOutcome(outcome: RenderOutcome): Promise<void> {
  try {
    await fetch(
      `/api/v0/chats/${encodeURIComponent(outcome.chatId)}/versions/${encodeURIComponent(outcome.versionId)}/error-log`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level: outcome.success ? "info" : "error",
          category: "render-telemetry",
          message: outcome.success
            ? `Preview rendered successfully (${outcome.source})`
            : `Preview failed to render (${outcome.source}): ${
                describePreviewDiagnosticCode(outcome.errorCode) ??
                outcome.errorMessage ??
                "unknown"
              }`,
          meta: {
            renderSuccess: outcome.success,
            source: outcome.source,
            demoUrl: outcome.demoUrl,
            durationMs: outcome.durationMs,
            errorCategory: outcome.errorCategory,
            previewCode: outcome.errorCode ?? null,
            previewStage: outcome.errorStage ?? null,
          },
        }),
      },
    );
  } catch {
    // best-effort telemetry
  }
}
