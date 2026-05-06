import { fetchPreviewHostStatus } from "./preview-host-client";
import type { PreviewSessionEntry } from "./session-store";

/**
 * Resume tier-2 preview for a stored preview-host session.
 */
export async function tryResumeTier2Runtime(
  entry: PreviewSessionEntry,
): Promise<{ previewSessionId: string; primaryUrl: string } | null> {
  return fetchPreviewHostStatus(entry.previewSessionId);
}
