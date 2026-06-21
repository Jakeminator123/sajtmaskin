import { fetchPreviewHostStatus } from "./preview-host-client";
import type { PreviewSessionEntry } from "./session-store";

/**
 * Resume tier-2 preview for a stored preview-host session.
 *
 * Passes the session's pinned `versionId` so the status check can reject a
 * resume when the preview-VM is serving a different version than this session
 * is bound to (BUG-SWARM rank 1 — avoids surfacing a stale/white iframe as a
 * live preview for the expected version).
 */
export async function tryResumeTier2Runtime(
  entry: PreviewSessionEntry,
): Promise<{ previewSessionId: string; primaryUrl: string } | null> {
  return fetchPreviewHostStatus(entry.previewSessionId, {
    expectedVersionId: entry.versionId,
  });
}
