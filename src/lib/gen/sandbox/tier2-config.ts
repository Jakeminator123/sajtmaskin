import { isSandboxConfigured, SANDBOX_SETUP_HINT } from "@/lib/mcp/runtime-url";

/** Hint when neither Vercel Sandbox nor preview-host base URL is configured. */
export const TIER2_PREVIEW_SETUP_HINT = `${SANDBOX_SETUP_HINT} Alternativt: s\u00e4tt SAJTMASKIN_PREVIEW_HOST_BASE_URL (preview-host, t.ex. Fly.io) och v\u00e4lj SAJTMASKIN_TIER2_RUNTIME.`;

export function getPreviewHostBaseUrl(): string | null {
  const u = process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL?.trim();
  if (!u) return null;
  return u.replace(/\/$/, "");
}

export type Tier2RuntimeMode = "vercel_sandbox" | "preview_host" | "preview_host_then_vercel";

/**
 * `SAJTMASKIN_TIER2_RUNTIME`: `vercel_sandbox`, `preview_host`, `preview_host_then_vercel`.
 *
 * If unset and `SAJTMASKIN_PREVIEW_HOST_BASE_URL` exists, prefer `preview_host_then_vercel`
 * so preview-host becomes the primary tier-2 path without losing Vercel fallback.
 */
export function getTier2RuntimeMode(): Tier2RuntimeMode {
  const raw = process.env.SAJTMASKIN_TIER2_RUNTIME?.trim().toLowerCase().replace(/-/g, "_");
  if (raw === "preview_host" || raw === "preview_host_only") {
    return "preview_host";
  }
  if (
    raw === "preview_host_then_vercel" ||
    raw === "preview_host_preferred" ||
    raw === "preview_with_vercel_fallback"
  ) {
    return "preview_host_then_vercel";
  }
  if (getPreviewHostBaseUrl()) {
    return "preview_host_then_vercel";
  }
  return "vercel_sandbox";
}

/** True when tier-2 iframe preview can be started (Vercel Sandbox and/or preview-host). */
export function isTier2PreviewConfigured(): boolean {
  return isSandboxConfigured() || Boolean(getPreviewHostBaseUrl());
}
