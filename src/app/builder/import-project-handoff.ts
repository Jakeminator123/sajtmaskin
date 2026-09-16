import type { ImportInitSuccess } from "@/lib/import/import-init-contract";

export type ImportedProjectHandoff = {
  nextProjectId: string;
  nextChatId: string;
  nextVersionId: string;
  nextPreviewUrl: string | null;
  shouldClearOldPreview: boolean;
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
  };
}

/** Keep a just-imported chat while `router.replace` has not yet written `chatId` to the URL. */
export function shouldSkipFreshEntryChatReset(params: {
  chatIdParam: string | null;
  isCreatingChat: boolean;
  pendingImportedChatId?: string | null;
  currentChatId?: string | null;
}): boolean {
  if (params.chatIdParam) return true;
  if (params.isCreatingChat) return true;
  return Boolean(
    params.pendingImportedChatId &&
      params.currentChatId &&
      params.pendingImportedChatId === params.currentChatId,
  );
}
