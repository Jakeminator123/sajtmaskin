/**
 * Tier-2 preview URL classification + normalization.
 *
 * Owns URL helpers that are independent of the legacy compatibility-shim
 * (`/api/preview-render`) path. Other modules should import tier-2 helpers
 * from here; shim-only helpers live in `./legacy/compatibility-shim.ts`.
 *
 * Tier-2 live preview = preview-host / VM (Fly, legacy `*.vercel.run`, etc.).
 * See `docs/architecture/fas3-preview-and-deploy.md`.
 */

const PREVIEW_URL_BASE = "https://preview.local";

export type AlternatePreviewUrls = {
  /** Persisted tier-2 / VM preview URL for this version (not Vercel Sandbox). */
  storedLivePreviewUrl: string | null;
};

export function normalizePreviewUrl(url: string | null | undefined): string | null {
  return typeof url === "string" && url.trim().length > 0 ? url.trim() : null;
}

function tier2PreviewHostSuffixesFromEnv(): string[] {
  if (typeof process === "undefined" || !process.env) return [];
  const raw = process.env.NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES?.trim();
  if (!raw) return [];
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

/**
 * True for tier-2 live preview URLs (preview-host / VM, legacy
 * `*.vercel.run`, or explicit host suffixes from
 * `NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES`). Compatibility-shim
 * URLs (`/api/preview-render`) return false here.
 */
export function isTier2LivePreviewUrl(url: string | null | undefined): boolean {
  const normalized = normalizePreviewUrl(url);
  if (!normalized) return false;
  // The compatibility shim mints relative URLs starting with `/api/preview-render`.
  if (normalized.includes("/api/preview-render")) return false;

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

export function previewUrlsEquivalent(
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
