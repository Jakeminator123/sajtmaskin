/** Hint when preview-host is not configured. */
export const TIER2_PREVIEW_SETUP_HINT =
  "Sätt SAJTMASKIN_PREVIEW_HOST_BASE_URL till din preview-host/Fly-bas-URL och konfigurera SAJTMASKIN_PREVIEW_HOST_API_KEY om hosten kräver auth.";

export function getPreviewHostBaseUrl(): string | null {
  const u = process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL?.trim();
  if (!u) return null;
  const normalized = u.replace(/\/$/, "");
  try {
    const parsed = new URL(normalized);
    if (parsed.pathname === "/preview") {
      parsed.pathname = "";
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString().replace(/\/$/, "");
    }
  } catch {
    // Keep the raw trimmed value; callers already handle invalid URLs defensively.
  }
  return normalized;
}

export type Tier2RuntimeMode = "preview_host";

/** Tier-2 is always preview_host/Fly in the current architecture. */
export function getTier2RuntimeMode(): Tier2RuntimeMode {
  return "preview_host";
}

/** True when tier-2 iframe preview can be started on preview-host/Fly. */
export function isTier2PreviewConfigured(): boolean {
  return Boolean(getPreviewHostBaseUrl());
}
