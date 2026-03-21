import { canExposeEnginePreview, type EngineVersionLifecycleLike } from "@/lib/db/engine-version-lifecycle";
import { isLegacyPreviewShimsEnabled } from "@/lib/env";
import { buildPreviewUrl } from "@/lib/gen/preview";

export type EngineDemoUrlVersionLike = EngineVersionLifecycleLike & {
  id?: string | null;
  sandboxUrl?: string | null;
  sandbox_url?: string | null;
};

export type EngineDemoUrlResolutionMode = "legacy-preview" | "runtime" | "pending-runtime" | "none";

export type EngineDemoUrlResolution = {
  demoUrl: string | null;
  legacyPreviewUrl: string | null;
  mode: EngineDemoUrlResolutionMode;
};

function normalizeUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveEngineDemoUrl(
  chatId: string,
  version: EngineDemoUrlVersionLike | null | undefined,
  projectId?: string | null,
): string | null {
  return resolveEngineDemoUrlDetails(chatId, version, projectId).demoUrl;
}

export function resolveEngineDemoUrlDetails(
  chatId: string,
  version: EngineDemoUrlVersionLike | null | undefined,
  projectId?: string | null,
): EngineDemoUrlResolution {
  const versionId = normalizeUrl(version?.id);
  if (!version || !versionId || !canExposeEnginePreview(version)) {
    return { demoUrl: null, legacyPreviewUrl: null, mode: "none" };
  }

  const legacyPreviewUrl = buildPreviewUrl(chatId, versionId, projectId);
  if (isLegacyPreviewShimsEnabled()) {
    return { demoUrl: legacyPreviewUrl, legacyPreviewUrl, mode: "legacy-preview" };
  }

  const sandboxUrl = normalizeUrl(version.sandboxUrl ?? version.sandbox_url);
  if (sandboxUrl) {
    return { demoUrl: sandboxUrl, legacyPreviewUrl, mode: "runtime" };
  }

  return { demoUrl: null, legacyPreviewUrl, mode: "pending-runtime" };
}
