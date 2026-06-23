/**
 * Legacy compatibility-preview URL helpers (`/api/preview-render`) and shim
 * detection. Primary product preview is the tier-2 live preview; see
 * `docs/architecture/llm-pipeline.md`.
 *
 * Tier-2 helpers live in `@/lib/gen/preview/preview-url-classifier`.
 */
import {
  isTier2LivePreviewUrl,
  normalizePreviewUrl,
} from "../preview-url-classifier";

const OWN_ENGINE_PREVIEW_PATH = "/api/preview-render";

/**
 * When the legacy compatibility (shim) preview is disabled, it is suppressed
 * end-to-end:
 * - `buildPreviewUrl` returns null so no shim URL is ever constructed
 * - `/api/preview-render` returns HTTP 410 with an explanatory page
 * - `isShimOrMissingPreviewUrl` always returns true so the tier-2 VM
 *   bootstrap re-attempts even if a stale shim URL leaks in from persisted state
 *
 * Default: **disabled** (returns `true`). The canonical preview is the
 * tier-2 Fly-VM live preview; the legacy `/api/preview-render` path is no
 * longer minted by the engine APIs and is kept only as an emergency fallback.
 *
 * Operators can re-enable the shim path by setting
 * `SAJTMASKIN_SHIM_PREVIEW_DISABLED` to a falsy value: `0`, `false`, `off`,
 * or `no`. Any other value (including unset or truthy) keeps the shim
 * disabled.
 */
export function isShimPreviewDisabled(): boolean {
  if (typeof process === "undefined" || !process.env) return true;
  const raw = process.env.SAJTMASKIN_SHIM_PREVIEW_DISABLED?.trim().toLowerCase();
  if (!raw) return true;
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  return true;
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
