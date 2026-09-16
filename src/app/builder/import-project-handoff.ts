import type { ImportInitSuccess } from "@/lib/import/import-init-contract";

export type ImportedProjectHandoff = {
  nextProjectId: string;
  nextChatId: string;
  nextVersionId: string;
  nextPreviewUrl: string | null;
  shouldClearOldPreview: boolean;
  shouldRetryPreview: boolean;
};

/**
 * Import from the builder dialog always opens the project the server created.
 * The previously open project id must not be reused as `_v0ProjectInternalId`.
 */
export function planImportedProjectHandoff(result: ImportInitSuccess): ImportedProjectHandoff {
  const nextPreviewUrl =
    result.preview.status === "failed"
      ? null
      : result.previewUrl && result.previewUrl.trim()
        ? result.previewUrl.trim()
        : null;
  return {
    nextProjectId: result.projectId,
    nextChatId: result.chatId,
    nextVersionId: result.versionId,
    nextPreviewUrl,
    shouldClearOldPreview: true,
    shouldRetryPreview: result.preview.status === "failed" || result.preview.retryable,
  };
}
