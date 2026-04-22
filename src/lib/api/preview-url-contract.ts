import { isCompatibilityShimPreviewUrl } from "@/lib/gen/preview/legacy/compatibility-shim";
import { normalizePreviewUrl } from "@/lib/gen/preview/preview-url-classifier";

/**
 * Public HTTP/SSE JSON uses `previewUrl` only (no response key `demoUrl`).
 * DB column remains `demo_url`. Inbound webhooks may still send legacy `demoUrl`.
 * Historical roadmap lives in git history; current public preview contract is
 * documented in docs/architecture/fas3-preview-and-deploy.md and docs/schemas/preview-session-contract.md.
 */

export function previewUrlField(url: string | null | undefined): { previewUrl: string | null } {
  if (url == null || url === "") return { previewUrl: null };
  return { previewUrl: String(url) };
}

export function readPreviewUrl(data: { previewUrl?: unknown } | null | undefined): string | null {
  if (typeof data?.previewUrl !== "string") return null;
  const t = data.previewUrl.trim();
  return t ? t : null;
}

/**
 * Inbound webhook / legacy payloads: prefer `previewUrl`, then fall back to
 * legacy `demoUrl`.
 */
export function resolveInboundPreviewUrl(
  data: { previewUrl?: unknown; demoUrl?: unknown } | null | undefined,
): string | null {
  const p = readPreviewUrl(data);
  if (p) return p;
  if (typeof data?.demoUrl !== "string") return null;
  const t = data.demoUrl.trim();
  return t ? t : null;
}

/** Normalize candidate preview URL and drop compatibility shim URLs from canonical live-preview paths. */
export function resolveCanonicalLivePreviewUrl(url: string | null | undefined): string | null {
  const normalized = normalizePreviewUrl(url);
  if (!normalized || isCompatibilityShimPreviewUrl(normalized)) return null;
  return normalized;
}

/** Preferred for `done` / stored payloads where legacy `demoUrl` may still exist. */
export function resolveCanonicalLivePreviewUrlFromDonePayload(
  data: { previewUrl?: unknown; demoUrl?: unknown } | null | undefined,
): string | null {
  return resolveCanonicalLivePreviewUrl(resolveInboundPreviewUrl(data));
}

/** Preferred for `preview-ready` where only `previewUrl` should be considered. */
export function resolveCanonicalLivePreviewUrlFromPreviewReadyPayload(
  data: { previewUrl?: unknown } | null | undefined,
): string | null {
  return resolveCanonicalLivePreviewUrl(readPreviewUrl(data));
}
