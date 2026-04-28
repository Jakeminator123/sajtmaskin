export const ENGINE_VERSION_RELEASE_STATES = ["draft", "promoted"] as const;
export type EngineVersionReleaseState = (typeof ENGINE_VERSION_RELEASE_STATES)[number];

export const ENGINE_VERSION_VERIFICATION_STATES = [
  "pending",
  "verifying",
  "repairing",
  "repair_available",
  "passed",
  "failed",
] as const;
export type EngineVersionVerificationState = (typeof ENGINE_VERSION_VERIFICATION_STATES)[number];

/**
 * Lifecycle stage of an engine version row. Stored in
 * `engine_versions.lifecycle_stage` and derived from
 * `BuildSpec.previewPolicy` at row-insert time.
 */
export const ENGINE_VERSION_LIFECYCLE_STAGES = ["design", "integrations"] as const;
export type EngineVersionLifecycleStage = (typeof ENGINE_VERSION_LIFECYCLE_STAGES)[number];

export type EngineVersionLifecycleLike = {
  versionNumber?: number | null;
  version_number?: number | null;
  createdAt?: string | Date | null;
  created_at?: string | Date | null;
  releaseState?: string | null;
  release_state?: string | null;
  verificationState?: string | null;
  verification_state?: string | null;
  lifecycleStage?: string | null;
  lifecycle_stage?: string | null;
  parentVersionId?: string | null;
  parent_version_id?: string | null;
};

/** Read the lifecycle stage from a row, defaulting to `"design"` for legacy rows. */
export function resolveEngineVersionLifecycleStage(
  version: EngineVersionLifecycleLike | null | undefined,
): EngineVersionLifecycleStage {
  const raw = version?.lifecycleStage ?? version?.lifecycle_stage ?? null;
  if (raw === "integrations") return "integrations";
  return "design";
}

/** Read the parent version id (F2 row that this F3 row was forked from). */
export function resolveEngineVersionParentId(
  version: EngineVersionLifecycleLike | null | undefined,
): string | null {
  return version?.parentVersionId ?? version?.parent_version_id ?? null;
}

/**
 * True when this version's lifecycle stage triggers server-verify on save.
 *
 * Runtime-truth: `verificationPolicy: "design_preview_skip_verify"` is set
 * for F2 design rows (lifecycleStage `"design"`) — server-verify never
 * runs there. F3 integrations rows run `verificationPolicy: "standard"`
 * which executes server-verify after persist.
 *
 * UI consumers: when this returns `false`, do NOT show "Verifying" or
 * "Server-verify kör i bakgrunden..." for a `verificationState: "pending"`
 * row — the row has reached its terminal display state for design preview.
 *
 * Postmortem 2026-04-28 (run `20260428-041927-freeform`): the
 * version-diagnostics tooltip claimed "Server-verify kör i bakgrunden"
 * for a version where the policy was already
 * `design_preview_skip_verify`. This helper closes that lie at the source.
 */
export function isServerVerifyExpectedForLifecycle(
  version: EngineVersionLifecycleLike | null | undefined,
): boolean {
  return resolveEngineVersionLifecycleStage(version) === "integrations";
}

export type EngineVersionLifecycleStatus =
  | "draft"
  | "verifying"
  | "repairing"
  | "repair_available"
  | "failed"
  | "promoted";

export type EngineVersionDisplayStatus = EngineVersionLifecycleStatus | "retrying";

export type QualityTier = "none" | "preview" | "tier2" | "production";

export function resolveQualityTier(
  version: EngineVersionLifecycleLike | null | undefined,
  opts?: { hasDemoUrl?: boolean; hasTier2LivePreviewUrl?: boolean; sandboxPassed?: boolean },
): QualityTier {
  if (!version) return "none";
  const lifecycle = resolveEngineVersionLifecycleStatus(version);
  if (lifecycle === "failed") return "none";

  if (opts?.sandboxPassed) return "tier2";
  if (lifecycle === "promoted") return "tier2";
  if (opts && "hasTier2LivePreviewUrl" in opts && opts.hasTier2LivePreviewUrl !== undefined) {
    return opts.hasTier2LivePreviewUrl ? "preview" : "none";
  }
  if (opts?.hasDemoUrl !== false) return "preview";
  return "none";
}

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
  if (verificationState === "repairing") {
    return "repairing";
  }
  if (verificationState === "repair_available") {
    return "repair_available";
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
  if (!version) {
    return lifecycleStatus;
  }

  const currentSortKey = getVersionSortKey(version);
  const hasNewerVersion = versions.some((candidate) => {
    if (!candidate) return false;
    if (candidate === version) return false;
    return getVersionSortKey(candidate) > currentSortKey;
  });

  if (!hasNewerVersion) {
    return lifecycleStatus;
  }

  const verificationState = version?.verificationState ?? version?.verification_state ?? null;

  if (lifecycleStatus === "verifying" && verificationState === "pending") {
    return "draft";
  }

  if (
    lifecycleStatus === "failed" ||
    lifecycleStatus === "repairing" ||
    lifecycleStatus === "verifying" ||
    lifecycleStatus === "repair_available"
  ) {
    return "retrying";
  }

  return lifecycleStatus;
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

/**
 * Pick the preferred version for follow-ups and UI display.
 *
 * Semantics: newest non-failed version wins. `promoted` is a quality
 * signal (used by deploy via `selectDeployTargetEngineVersion`), NOT a
 * version-selection signal — otherwise a newer draft is silently ignored
 * and follow-ups merge against stale files.
 */
export function selectPreferredEngineVersion<T extends EngineVersionLifecycleLike>(
  versions: T[],
): T | undefined {
  const sorted = sortEngineVersionsNewestFirst(versions);
  if (sorted.length === 0) {
    return undefined;
  }

  return (
    sorted.find((version) => resolveEngineVersionLifecycleStatus(version) !== "failed") ?? sorted[0]
  );
}

/**
 * Pick the preferred deploy target. Latest non-failed `integrations` (F3)
 * row beats the latest design (F2) row — the F2 row may still be the
 * builder's currently-edited surface, but deploys should ship the
 * integrations build when one exists.
 */
export function selectDeployTargetEngineVersion<T extends EngineVersionLifecycleLike>(
  versions: T[],
): T | undefined {
  const sorted = sortEngineVersionsNewestFirst(versions);
  const integrations = sorted.find(
    (version) =>
      resolveEngineVersionLifecycleStage(version) === "integrations" &&
      resolveEngineVersionLifecycleStatus(version) !== "failed",
  );
  if (integrations) return integrations;
  return selectPreferredEngineVersion(versions);
}
