import type { PreviewStartContract } from "@/lib/gen/stream/preflight-contract";

/**
 * Own-engine: whether tier-2 live preview should start after finalize.
 * Compatibility preview is no longer a primary runtime path.
 */
export function shouldStartOwnEnginePreview(params: {
  isPreviewConfigured: boolean;
  previewStart: PreviewStartContract;
  parsedFileCount: number;
}): boolean {
  return (
    params.isPreviewConfigured &&
    params.previewStart.canStartPreview &&
    params.parsedFileCount > 0
  );
}
