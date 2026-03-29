export type AlternatePreviewUrls = {
  shimUrl: string | null;
  sandboxUrl: string | null;
};

const OWN_ENGINE_PREVIEW_PATH = "/api/preview-render";
const ENGINE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

export function isSandboxPreviewUrl(url: string | null | undefined): boolean {
  const normalized = normalizePreviewUrl(url);
  if (!normalized || isCompatibilityShimPreviewUrl(normalized)) {
    return false;
  }

  try {
    const host = new URL(normalized, PREVIEW_URL_BASE).hostname.toLowerCase();
    return host.includes("sandbox") || host.endsWith(".vercel.run");
  } catch {
    const fallback = normalized.toLowerCase();
    return fallback.includes("sandbox") || fallback.includes("vercel.run");
  }
}

export function hasSandboxPreviewUrl(url: string | null | undefined): boolean {
  return isSandboxPreviewUrl(url);
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

export function buildCompatibilityShimPreviewUrl(
  chatId: string,
  versionId: string,
  projectId?: string | null,
): string {
  const params = new URLSearchParams({ chatId, versionId });
  if (projectId) params.set("projectId", projectId);
  return `${OWN_ENGINE_PREVIEW_PATH}?${params.toString()}`;
}

export function resolveCompatibilityShimPreviewUrl(params: {
  chatId?: string | null;
  versionId?: string | null;
  demoUrl?: string | null;
  sandboxUrl?: string | null;
  projectId?: string | null;
}): string | null {
  const demoUrl = normalizePreviewUrl(params.demoUrl);
  if (isCompatibilityShimPreviewUrl(demoUrl)) {
    return demoUrl;
  }

  if (!normalizePreviewUrl(params.sandboxUrl)) {
    return null;
  }

  if (
    !params.chatId ||
    !ENGINE_UUID_RE.test(params.chatId) ||
    !params.versionId ||
    !ENGINE_UUID_RE.test(params.versionId)
  ) {
    return null;
  }

  return buildCompatibilityShimPreviewUrl(params.chatId, params.versionId, params.projectId);
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
    shimUrl: resolveCompatibilityShimPreviewUrl(params),
    sandboxUrl,
  };
}

export function buildAlternatePreviewBannerState(params: {
  currentUrl: string | null | undefined;
  alternatePreviewUrls?: AlternatePreviewUrls | null;
}): { offerShim: boolean; offerSandbox: boolean; shimUrl: string; sandboxUrl: string } | null {
  const currentUrl = normalizePreviewUrl(params.currentUrl);
  const shimUrl = normalizePreviewUrl(params.alternatePreviewUrls?.shimUrl);
  const sandboxUrl = normalizePreviewUrl(params.alternatePreviewUrls?.sandboxUrl);

  const offerShim = Boolean(
    currentUrl && isSandboxPreviewUrl(currentUrl) && shimUrl && !previewUrlsEquivalent(currentUrl, shimUrl),
  );
  const offerSandbox = Boolean(
    currentUrl &&
      isCompatibilityShimPreviewUrl(currentUrl) &&
      sandboxUrl &&
      !previewUrlsEquivalent(currentUrl, sandboxUrl),
  );

  if (!offerShim && !offerSandbox) {
    return null;
  }

  return {
    offerShim,
    offerSandbox,
    shimUrl: shimUrl!,
    sandboxUrl: sandboxUrl!,
  };
}
