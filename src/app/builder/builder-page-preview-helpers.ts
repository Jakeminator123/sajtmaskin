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
 * Gated on `activeVersionIsFreshOrLatest` — true when the active version is
 * EITHER not yet resolved in the loaded `/versions` list (a just-generated
 * follow-up version whose row hasn't arrived from the refetch yet) OR the newest
 * non-failed version. Both are the "preview is imminent" case. It is false when
 * the user manually selected an OLDER version already in the list (or a failed
 * latest) — there we must show that version's true state (blank/pending), never
 * a different version's frame.
 *
 * The OR is important: on the very first render after stream `done` the client
 * has already set the new version active while `latestVersionId` still reflects
 * the stale versions list, so an `=== latest` check alone would be false on the
 * one `didChangeVersion` pass and (because `didChangeVersion` is a one-shot ref)
 * never retain. The "not yet in the list" arm covers exactly that window.
 *
 * A shim/compat or missing current URL is also never retained.
 */
export function shouldRetainLastGoodPreviewOnVersionChange(params: {
  didChangeVersion: boolean;
  nextDemoUrl: string | null;
  currentPreviewUrl: string | null;
  activeVersionIsFreshOrLatest: boolean;
}): boolean {
  const { didChangeVersion, nextDemoUrl, currentPreviewUrl, activeVersionIsFreshOrLatest } = params;
  if (!didChangeVersion) return false;
  if (!activeVersionIsFreshOrLatest) return false;
  if (nextDemoUrl) return false;
  if (!currentPreviewUrl) return false;
  return isTier2LivePreviewUrl(currentPreviewUrl);
}
