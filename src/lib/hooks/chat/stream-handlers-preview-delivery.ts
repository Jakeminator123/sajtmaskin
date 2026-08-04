import type { StreamContext } from "./stream-handlers-types";

/**
 * Dedup'd preview handoff: exactly one iframe reload per stream run even
 * when preview-ready AND done both carry the same URL. The per-run latch
 * here is deliberate (not just the controller's versionId:url latch):
 * `versionIdFromStream` may still be null when preview-ready arrives and
 * only resolve at done, which would give the two events different dedup
 * keys. Falls back to a plain URL set (which itself reloads the iframe)
 * when the controller callback is not wired (tests).
 */
export function createPreviewUrlDeliverer(
  ctx: Pick<StreamContext, "applyPreviewHandoff" | "setCurrentPreviewUrl">,
) {
  let deliveredPreviewUrlForRun: string | null = null;
  let deliveredVersionIdForRun: string | null = null;

  return (url: string | null | undefined, versionId: string | null) => {
    const normalized = typeof url === "string" && url.trim().length > 0 ? url.trim() : null;
    if (!normalized) return;
    const resolvedVersionId =
      typeof versionId === "string" && versionId.trim().length > 0 ? versionId.trim() : null;
    const sameUrl = deliveredPreviewUrlForRun === normalized;
    // Latch upgrade: preview-ready delivered this URL before the stream reported
    // versionId (`?:url`), and done now carries the concrete id for the SAME URL.
    // Re-deliver ONCE so the controller upgrades its dedup latch to
    // `versionId:url` — decidePreviewHandoff returns a no-reload noop for that
    // upgrade, so the iframe still reloads exactly once, but the latch never
    // stays stuck at `?:url` (which would swallow a genuine new-version bump at
    // the same reused VM URL — Bugbot). The fallback path (no handoff callback,
    // tests) has no latch to upgrade, so it keeps the strict URL-only dedup.
    const isLatchUpgrade =
      sameUrl &&
      Boolean(ctx.applyPreviewHandoff) &&
      resolvedVersionId !== null &&
      resolvedVersionId !== deliveredVersionIdForRun;
    if (sameUrl && !isLatchUpgrade) return;
    deliveredPreviewUrlForRun = normalized;
    if (resolvedVersionId !== null) deliveredVersionIdForRun = resolvedVersionId;
    if (ctx.applyPreviewHandoff) {
      ctx.applyPreviewHandoff({ url: normalized, versionId });
      return;
    }
    ctx.setCurrentPreviewUrl(normalized);
  };
}
