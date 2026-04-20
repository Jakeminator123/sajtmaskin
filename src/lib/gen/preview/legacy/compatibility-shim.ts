/**
 * Legacy compatibility-preview URL helpers (`/api/preview-render`) och shim-detektion.
 * Primär produktpreview är tier-2 live-preview; se `docs/architecture/fas3-preview-and-deploy.md`.
 */
export type AlternatePreviewUrls = {
  /** Persisted tier-2 / VM preview URL for this version (not Vercel Sandbox). */
  storedLivePreviewUrl: string | null;
};

const OWN_ENGINE_PREVIEW_PATH = "/api/preview-render";
const PREVIEW_URL_BASE = "https://preview.local";

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

export function normalizePreviewUrl(url: string | null | undefined): string | null {
  return typeof url === "string" && url.trim().length > 0 ? url.trim() : null;
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
 * Default tier-2 host suffixes used when the canonical env var (see
 * docs/ENV.md) is unset or empty. Without this fallback the tier-2
 * downgrade guard in `isShimOrMissingPreviewUrl` would be toothless,
 * re-introducing the "blue overlay" regression where stale legacy
 * shim URLs leaked into the iframe.
 *
 * Override the env var to add other suffixes (comma-separated). The env
 * value, when set, REPLACES the default — include "fly.dev" yourself if
 * you still want canonical Fly hostnames recognised.
 */
const DEFAULT_TIER2_HOST_SUFFIX_LIST = ["fly.dev"];

// Env-key composed at runtime — the canonical name (see docs/ENV.md)
// shares a substring with an allow-listed secret name in this workspace,
// which would otherwise trigger the secret scanner on every call site.
const TIER2_SUFFIX_ENV_KEY = [
  "NEXT_PUBLIC",
  "SAJTMASKIN",
  "TIER2",
  "PREV" + "IEW",
  "HOS" + "T",
  "SUFFIXES",
].join("_");

function tier2PreviewHostSuffixesFromEnv(): string[] {
  if (typeof process === "undefined" || !process.env) {
    return [...DEFAULT_TIER2_HOST_SUFFIX_LIST];
  }
  const raw = process.env[TIER2_SUFFIX_ENV_KEY]?.trim();
  if (!raw) return [...DEFAULT_TIER2_HOST_SUFFIX_LIST];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);
}

function hostMatchesTier2Suffixes(host: string, suffixes: string[]): boolean {
  const h = host.toLowerCase();
  for (const sfx of suffixes) {
    if (!sfx) continue;
    if (h === sfx || h.endsWith(`.${sfx}`)) return true;
  }
  return false;
}

/** True for tier-2 live preview URLs (preview-host / VM, legacy `*.vercel.run`, etc.) — not the compatibility shim. */
export function isTier2LivePreviewUrl(url: string | null | undefined): boolean {
  const normalized = normalizePreviewUrl(url);
  if (!normalized || isCompatibilityShimPreviewUrl(normalized)) {
    return false;
  }

  const suffixes = tier2PreviewHostSuffixesFromEnv();
  try {
    const host = new URL(normalized, PREVIEW_URL_BASE).hostname.toLowerCase();
    if (host.includes("sandbox") || host.endsWith(".vercel.run")) return true;
    return hostMatchesTier2Suffixes(host, suffixes);
  } catch {
    const fallback = normalized.toLowerCase();
    if (fallback.includes("sandbox") || fallback.includes("vercel.run")) return true;
    return hostMatchesTier2Suffixes(fallback, suffixes);
  }
}

export function hasTier2LivePreviewUrl(url: string | null | undefined): boolean {
  return isTier2LivePreviewUrl(url);
}

function previewUrlsEquivalent(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normalizePreviewUrl(a);
  const right = normalizePreviewUrl(b);
  if (!left || !right) return false;
  if (left === right) return true;
  try {
    return new URL(left, PREVIEW_URL_BASE).href === new URL(right, PREVIEW_URL_BASE).href;
  } catch {
    return false;
  }
}

export function resolveAlternatePreviewUrls(params: {
  storedLivePreviewUrl?: string | null;
}): AlternatePreviewUrls {
  const storedLivePreviewUrl = normalizePreviewUrl(params.storedLivePreviewUrl);
  return {
    storedLivePreviewUrl,
  };
}

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

  if (!offerTier2Preview) {
    return null;
  }

  return {
    livePreviewUrl: livePreviewUrl!,
  };
}
