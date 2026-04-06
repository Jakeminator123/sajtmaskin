import {
  canExposeEnginePreview,
  resolveEngineVersionLifecycleStatus,
} from "@/lib/db/engine-version-lifecycle";
import { hasSandboxPreviewUrl, normalizePreviewUrl } from "@/lib/gen/preview/legacy/compatibility-shim";
import type { VersionSummary } from "./useBuilderDerivedState";

/**
 * Prefer sandbox (fidelity 2), but while a just-saved own-engine version is still
 * verifying we allow the legacy shim as an interim preview so the iframe does not stay blank.
 */
export function pickVersionPreviewUrl(
  v: VersionSummary | undefined,
  options?: { allowFailed?: boolean },
): string | null {
  if (!v) return null;
  if (!options?.allowFailed && !canExposeEnginePreview(v)) return null;
  const sandboxUrl = normalizePreviewUrl(v.sandboxUrl);
  if (sandboxUrl) return sandboxUrl;

  const lifecycleStatus = resolveEngineVersionLifecycleStatus(v);
  if (lifecycleStatus === "verifying") {
    return normalizePreviewUrl(v.legacyShimPreviewUrl ?? v.previewUrl ?? v.demoUrl);
  }

  return null;
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

export function versionSummaryHasSandbox(
  v: VersionSummary | undefined,
  options?: { allowFailed?: boolean },
): boolean {
  if (!v) return false;
  if (!options?.allowFailed && !canExposeEnginePreview(v)) return false;
  return hasSandboxPreviewUrl(v.sandboxUrl);
}
