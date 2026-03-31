import { canExposeEnginePreview } from "@/lib/db/engine-version-lifecycle";
import { hasSandboxPreviewUrl, normalizePreviewUrl } from "@/lib/gen/preview/legacy/compatibility-shim";
import type { VersionSummary } from "./useBuilderDerivedState";

/** Sandbox (fidelity 2) only; legacy `demoUrl` shim URLs are ignored. */
export function pickVersionPreviewUrl(
  v: VersionSummary | undefined,
  options?: { allowFailed?: boolean },
): string | null {
  if (!v) return null;
  if (!options?.allowFailed && !canExposeEnginePreview(v)) return null;
  return normalizePreviewUrl(v.sandboxUrl);
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
