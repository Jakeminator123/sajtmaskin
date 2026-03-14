export const ENGINE_VERSION_RELEASE_STATES = ["draft", "promoted"] as const;
export type EngineVersionReleaseState = (typeof ENGINE_VERSION_RELEASE_STATES)[number];

export const ENGINE_VERSION_VERIFICATION_STATES = [
  "pending",
  "verifying",
  "passed",
  "failed",
] as const;
export type EngineVersionVerificationState = (typeof ENGINE_VERSION_VERIFICATION_STATES)[number];

export type EngineVersionLifecycleLike = {
  versionNumber?: number | null;
  version_number?: number | null;
  createdAt?: string | Date | null;
  created_at?: string | Date | null;
  releaseState?: string | null;
  release_state?: string | null;
  verificationState?: string | null;
  verification_state?: string | null;
};

export type EngineVersionLifecycleStatus = "draft" | "verifying" | "failed" | "promoted";

export type EngineVersionDisplayStatus = EngineVersionLifecycleStatus | "retrying";

export function resolveEngineVersionLifecycleStatus(
  version: EngineVersionLifecycleLike | null | undefined,
): EngineVersionLifecycleStatus {
  const releaseState = version?.releaseState ?? version?.release_state ?? null;
  const verificationState = version?.verificationState ?? version?.verification_state ?? null;
  if (releaseState === "promoted") {
    return "promoted";
  }
  if (verificationState === "pending" || verificationState === "verifying") {
    return "verifying";
  }
  if (verificationState === "failed") {
    return "failed";
  }
  return "draft";
}

export function resolveEngineVersionDisplayStatus<T extends EngineVersionLifecycleLike>(
  version: T | null | undefined,
  versions: T[] = [],
): EngineVersionDisplayStatus {
  const lifecycleStatus = resolveEngineVersionLifecycleStatus(version);
  if (lifecycleStatus !== "failed" || !version) {
    return lifecycleStatus;
  }

  const currentSortKey = getVersionSortKey(version);
  const hasNewerVersion = versions.some((candidate) => {
    if (!candidate) return false;
    if (candidate === version) return false;
    return getVersionSortKey(candidate) > currentSortKey;
  });

  return hasNewerVersion ? "retrying" : "failed";
}

export function canExposeEnginePreview(
  version: EngineVersionLifecycleLike | null | undefined,
): boolean {
  if (!version) return false;
  return resolveEngineVersionLifecycleStatus(version) !== "failed";
}

function getVersionSortKey(version: EngineVersionLifecycleLike): number {
  const versionNumber = version.versionNumber ?? version.version_number ?? null;
  if (typeof versionNumber === "number" && Number.isFinite(versionNumber)) {
    return versionNumber;
  }
  const createdAt = version.createdAt ?? version.created_at ?? null;
  if (!createdAt) {
    return 0;
  }
  const timestamp = createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function sortEngineVersionsNewestFirst<T extends EngineVersionLifecycleLike>(
  versions: T[],
): T[] {
  return [...versions].sort((a, b) => getVersionSortKey(b) - getVersionSortKey(a));
}

export function selectPreferredEngineVersion<T extends EngineVersionLifecycleLike>(
  versions: T[],
): T | undefined {
  const sorted = sortEngineVersionsNewestFirst(versions);
  if (sorted.length === 0) {
    return undefined;
  }

  const latestPromoted = sorted.find(
    (version) => resolveEngineVersionLifecycleStatus(version) === "promoted",
  );
  if (latestPromoted) {
    return latestPromoted;
  }

  return (
    sorted.find((version) => resolveEngineVersionLifecycleStatus(version) !== "failed") ?? sorted[0]
  );
}
