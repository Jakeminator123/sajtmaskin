/**
 * Legacy compatibility-preview URL helpers (`/api/preview-render`) and
 * shim detection.
 *
 * Primary product preview is the tier-2 live preview (preview-host / VM).
 * Tier-2 URL classification lives in `../preview-url-classifier`; import
 * tier-2 helpers from there.
 *
 * This module owns ONLY:
 * - the shim URL path constant
 * - `isShimPreviewDisabled()`     (env gate)
 * - `isCompatibilityShimPreviewUrl(url)`
 * - `isShimOrMissingPreviewUrl(url)`  (used by bootstrap to re-try on shim / stale URL)
 *
 * It re-exports `normalizePreviewUrl` from `preview-url-classifier` for
 * backward compatibility with callers that import it from here.
 */

import {
  isTier2LivePreviewUrl,
  normalizePreviewUrl,
  previewUrlsEquivalent,
  type AlternatePreviewUrls,
} from "../preview-url-classifier";

export { normalizePreviewUrl } from "../preview-url-classifier";

const OWN_ENGINE_PREVIEW_PATH = "/api/preview-render";

/**
 * When `SAJTMASKIN_SHIM_PREVIEW_DISABLED` is truthy, the legacy
 * compatibility (shim) preview is suppressed end-to-end:
 * - `buildPreviewUrl` returns null so no shim URL is ever constructed
 * - `/api/preview-render` returns HTTP 410 with an explanatory page
 * - `isShimOrMissingPreviewUrl` always returns true so the tier-2 VM
 *   bootstrap re-attempts even if a stale shim URL leaks in from persisted state
 */
export function isShimPreviewDisabled(): boolean {
  if (typeof process === "undefined" || !process.env) return false;
  const raw = process.env.SAJTMASKIN_SHIM_PREVIEW_DISABLED?.trim().toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function isCompatibilityShimPreviewUrl(url: string | null | undefined): boolean {
  const normalized = normalizePreviewUrl(url);
  return normalized ? normalized.includes(OWN_ENGINE_PREVIEW_PATH) : false;
}

export function isShimOrMissingPreviewUrl(url: string | null | undefined): boolean {
  const normalized = normalizePreviewUrl(url);
  if (!normalized) return true;
  if (isCompatibilityShimPreviewUrl(normalized)) return true;
  // When shim is disabled, any non-tier-2 URL counts as "needs upgrade"
  // so the bootstrap re-runs even if a stale legacy URL slipped through.
  if (isShimPreviewDisabled() && !isTier2LivePreviewUrl(normalized)) return true;
  return false;
}

/**
 * UI banner that surfaces "switch to the stored tier-2 preview" when the
 * current iframe URL is the compatibility shim. Returns null when no
 * upgrade is possible or useful.
 */
export function buildAlternatePreviewBannerState(params: {
  currentUrl: string | null | undefined;
  alternatePreviewUrls?: AlternatePreviewUrls | null;
}): { livePreviewUrl: string } | null {
  const currentUrl = normalizePreviewUrl(params.currentUrl);
  const livePreviewUrl = normalizePreviewUrl(params.alternatePreviewUrls?.storedLivePreviewUrl);

  const offerTier2Preview = Boolean(
    currentUrl &&
      isCompatibilityShimPreviewUrl(currentUrl) &&
      livePreviewUrl &&
      !previewUrlsEquivalent(currentUrl, livePreviewUrl),
  );

  if (!offerTier2Preview) return null;
  return { livePreviewUrl: livePreviewUrl! };
}
