import { canExposeEnginePreview } from "@/lib/db/engine-version-lifecycle";
import {
  hasTier2LivePreviewUrl,
  isTier2LivePreviewUrl,
  normalizePreviewUrl,
} from "@/lib/gen/preview/preview-url-classifier";
import type { VersionSummary } from "./useBuilderDerivedState";

/** Live preview only; no shim fallback. */
export function pickVersionPreviewUrl(
  v: VersionSummary | undefined,
  options?: { allowFailed?: boolean },
): string | null {
  if (!v) return null;
  if (!options?.allowFailed && !canExposeEnginePreview(v)) return null;
  return normalizePreviewUrl(v.previewUrl);
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parsePreviewOverride(
  value: unknown,
): { url: string | null; versionId: string | null } {
  const record = asRecord(value);
  const url =
    typeof record?.url === "string" && record.url.trim().length > 0 ? record.url.trim() : null;
  const versionId =
    typeof record?.versionId === "string" && record.versionId.trim().length > 0
      ? record.versionId.trim()
      : null;
  return { url, versionId };
}

export function versionSummaryHasPreview(
  v: VersionSummary | undefined,
  options?: { allowFailed?: boolean },
): boolean {
  if (!v) return false;
  if (!options?.allowFailed && !canExposeEnginePreview(v)) return false;
  return hasTier2LivePreviewUrl(v.previewUrl);
}

/**
 * Decide whether to keep the current live preview visible when the active
 * version just changed but no preview URL resolves for it yet. Prevents the
 * "white preview" flash on follow-up completion: the client auto-advances to
 * the freshly generated draft the instant the stream ends, seconds before the
 * new version's VM preview is running. Retaining the established tier-2 (VM/live)
 * preview keeps the last-good page on screen (with the "startar preview" /
 * version_mismatch overlay on top) until the new preview arrives.
 *
 * Only retained for an AUTOMATIC advance. When the user has explicitly selected
 * a specific version (`userSelectedActiveVersion`), we NEVER retain — we must
 * show that version's true state (blank/pending), never a different version's
 * frame, otherwise the builder would display the wrong site while another
 * version is selected. A shim/compat or missing current URL is also never
 * retained.
 */
export function shouldRetainLastGoodPreviewOnVersionChange(params: {
  didChangeVersion: boolean;
  nextDemoUrl: string | null;
  currentPreviewUrl: string | null;
  userSelectedActiveVersion: boolean;
}): boolean {
  const { didChangeVersion, nextDemoUrl, currentPreviewUrl, userSelectedActiveVersion } = params;
  if (!didChangeVersion) return false;
  if (userSelectedActiveVersion) return false;
  if (nextDemoUrl) return false;
  if (!currentPreviewUrl) return false;
  return isTier2LivePreviewUrl(currentPreviewUrl);
}
