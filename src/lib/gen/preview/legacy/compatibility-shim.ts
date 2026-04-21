/**
 * Legacy compatibility-preview URL helpers (`/api/preview-render`) and shim
 * detection. Primary product preview is the tier-2 live preview; see
 * `docs/architecture/fas3-preview-and-deploy.md`.
 *
 * Tier-2 helpers live in `@/lib/gen/preview/preview-url-classifier`.
 */
import {
  isTier2LivePreviewUrl,
  normalizePreviewUrl,
} from "../preview-url-classifier";

const OWN_ENGINE_PREVIEW_PATH = "/api/preview-render";

/**
 * When `SAJTMASKIN_SHIM_PREVIEW_DISABLED` is truthy, the legacy compatibility
 * (shim) preview is suppressed end-to-end:
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
