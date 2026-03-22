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

const SANDBOX_EXPIRY_HASH_KEY = "sajtmaskinSandboxExpires";

function normalizeUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSandboxRuntimeUrl(value: string | null | undefined, now = Date.now()): string | null {
  const normalized = normalizeUrl(value);
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    const hashParams = new URLSearchParams(parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash);
    const expiresAtRaw = hashParams.get(SANDBOX_EXPIRY_HASH_KEY);
    if (expiresAtRaw) {
      const expiresAt = Number(expiresAtRaw);
      if (!Number.isFinite(expiresAt) || expiresAt <= now) {
        return null;
      }
      hashParams.delete(SANDBOX_EXPIRY_HASH_KEY);
      parsed.hash = hashParams.toString();
    }
    return parsed.toString();
  } catch {
    return normalized;
  }
}

export function withSandboxUrlExpiry(url: string, ttlMs: number, now = Date.now()): string {
  const parsed = new URL(url);
  const hashParams = new URLSearchParams(parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash);
  hashParams.set(SANDBOX_EXPIRY_HASH_KEY, String(now + Math.max(0, ttlMs)));
  parsed.hash = hashParams.toString();
  return parsed.toString();
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

  const sandboxUrl = normalizeSandboxRuntimeUrl(version.sandboxUrl ?? version.sandbox_url);
  if (sandboxUrl) {
    return { demoUrl: sandboxUrl, legacyPreviewUrl, mode: "runtime" };
  }

  // No live sandbox URL yet (missing, still booting, or expired): still expose legacy
  // `/api/preview-render` so the builder iframe shows an approximate preview instead
  // of a blank panel. True Next runtime remains preferred when `sandboxUrl` exists.
  return { demoUrl: legacyPreviewUrl, legacyPreviewUrl, mode: "pending-runtime" };
}
