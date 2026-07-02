import { fetchPreviewHostStatus } from "./preview-host-client";
import type { PreviewSessionEntry } from "./session-store";

/**
 * Resume tier-2 preview for a stored preview-host session.
 *
 * Passes the session's pinned `versionId` so the status check can reject a
 * resume when the preview-VM is serving a different version than this session
 * is bound to (BUG-SWARM rank 1 — avoids surfacing a stale/white iframe as a
 * live preview for the expected version).
 *
 * `requireReady` (BUG-SWARM #3): when true, only resume once the host reports
 * CONTENT-readiness, not just a live process. The status-polling path that the
 * builder maps to the `live` lifecycle sets this so a still-compiling VM (boot
 * page) is not reported as live. Fast-resume/recover callers omit it to keep the
 * process-alive semantics (reuse a booting session instead of tearing it down).
 */
export async function tryResumeTier2Runtime(
  entry: PreviewSessionEntry,
  opts?: { requireReady?: boolean },
): Promise<{ previewSessionId: string; primaryUrl: string } | null> {
  return fetchPreviewHostStatus(entry.previewSessionId, {
    expectedVersionId: entry.versionId,
    requireReady: opts?.requireReady === true,
  });
}
