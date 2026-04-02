/**
 * Legacy tier-1 preview URL helpers (`/api/preview-render`) och shim-detektion.
 * Primär produktpreview är sandbox (Fidelity 2); se `docs/architecture/preview-deploy.md`.
 */
export type AlternatePreviewUrls = {
  shimUrl: string | null;
  sandboxUrl: string | null;
};

const OWN_ENGINE_PREVIEW_PATH = "/api/preview-render";
const PREVIEW_URL_BASE = "https://preview.local";

export function normalizePreviewUrl(url: string | null | undefined): string | null {
  return typeof url === "string" && url.trim().length > 0 ? url.trim() : null;
}

export function isCompatibilityShimPreviewUrl(url: string | null | undefined): boolean {
  const normalized = normalizePreviewUrl(url);
  return normalized ? normalized.includes(OWN_ENGINE_PREVIEW_PATH) : false;
}

export function isShimOrMissingPreviewUrl(url: string | null | undefined): boolean {
  const normalized = normalizePreviewUrl(url);
  return !normalized || isCompatibilityShimPreviewUrl(normalized);
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

/** True for tier-2 runtime preview URLs (Vercel Sandbox, preview-host on Fly, etc.) — not the legacy shim. */
export function isSandboxPreviewUrl(url: string | null | undefined): boolean {
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

export function hasSandboxPreviewUrl(url: string | null | undefined): boolean {
  return isSandboxPreviewUrl(url);
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
  chatId?: string | null;
  versionId?: string | null;
  demoUrl?: string | null;
  sandboxUrl?: string | null;
  projectId?: string | null;
}): AlternatePreviewUrls {
  const sandboxUrl = normalizePreviewUrl(params.sandboxUrl);
  return {
    shimUrl: null,
    sandboxUrl,
  };
}

export function buildAlternatePreviewBannerState(params: {
  currentUrl: string | null | undefined;
  alternatePreviewUrls?: AlternatePreviewUrls | null;
}): { sandboxUrl: string } | null {
  const currentUrl = normalizePreviewUrl(params.currentUrl);
  const sandboxUrl = normalizePreviewUrl(params.alternatePreviewUrls?.sandboxUrl);

  const offerSandbox = Boolean(
    currentUrl &&
      isCompatibilityShimPreviewUrl(currentUrl) &&
      sandboxUrl &&
      !previewUrlsEquivalent(currentUrl, sandboxUrl),
  );

  if (!offerSandbox) {
    return null;
  }

  return {
    sandboxUrl: sandboxUrl!,
  };
}
