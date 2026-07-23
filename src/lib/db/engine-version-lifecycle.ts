export const ENGINE_VERSION_RELEASE_STATES = ["draft", "promoted"] as const;
export type EngineVersionReleaseState = (typeof ENGINE_VERSION_RELEASE_STATES)[number];

export const ENGINE_VERSION_VERIFICATION_STATES = [
  "pending",
  "verifying",
  "repairing",
  "repair_available",
  "passed",
  "failed",
  // Terminal-neutral: verifieringen övergavs för att en NYARE version tog
  // över (supersede) — inte ett fel på innehållet. Renderas "Ersatt" (aldrig
  // rött), startar aldrig repair, och behandlas som `pending` i deploy-gaten
  // (F2 deploybar, F3 kräver fortfarande grön ReleaseGate). Historiska rader
  // före 2026-07 skrevs som `failed` och behåller det.
  "superseded",
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
 * UI consumers: when this returns `false`, do NOT show "Verifierar" or
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
  | "superseded"
  | "promoted";

export type QualityTier = "none" | "preview" | "tier2" | "production";

export type EngineVersionVerificationSurfaceStatus =
  | "verified"
  | "design_ready"
  | "verifying"
  | "repair_available"
  | "failed"
  | "superseded"
  | "unverified";

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
  if (verificationState === "superseded") {
    return "superseded";
  }
  return "draft";
}

export function resolveEngineVersionVerificationSurfaceStatus(
  version: EngineVersionLifecycleLike | null | undefined,
): EngineVersionVerificationSurfaceStatus {
  if (!version) return "unverified";
  const lifecycleStatus = resolveEngineVersionLifecycleStatus(version);
  if (lifecycleStatus === "promoted") return "verified";
  if (lifecycleStatus === "failed") return "failed";
  if (lifecycleStatus === "superseded") return "superseded";
  if (lifecycleStatus === "repair_available") return "repair_available";
  if (lifecycleStatus === "repairing" || lifecycleStatus === "verifying") {
    return isServerVerifyExpectedForLifecycle(version) ? "verifying" : "design_ready";
  }
  const verificationState = version.verificationState ?? version.verification_state ?? null;
  if (verificationState === "passed") return "verified";
  return "unverified";
}

export type DeployReleaseGateResult = {
  allowed: boolean;
  code?: "DEPLOY_VERSION_FAILED" | "DEPLOY_RELEASE_GATE_NOT_GREEN";
  message?: string;
};

/**
 * Publicera-lås (Ö1): avgör om en version får publiceras via
 * `POST /api/v0/deployments`.
 *
 * - F3 (`integrations`): hård gate — deploy tillåts ENDAST när versionen är
 *   bevisat grön, dvs. `verification_state === "passed"` ELLER
 *   `release_state === "promoted"`. Allt annat (pending/verifying/repairing/
 *   repair_available/superseded) blockeras med `DEPLOY_RELEASE_GATE_NOT_GREEN`
 *   — ReleaseGate (typecheck + build) måste passera först.
 * - F2 (`design`): mjuk gate — server-verify körs aldrig
 *   (`design_preview_skip_verify`), så staten stannar typiskt `pending`.
 *   Endast `verification_state === "failed"` blockerar.
 * - `superseded` behandlas som `pending` (neutral, inte fel): F2 deploybar,
 *   F3 fortfarande inte grön.
 * - `failed` blockerar i BÅDA stadierna (även om raden råkar vara promoted):
 *   en underkänd quality gate får aldrig publiceras.
 */
export function resolveDeployReleaseGate(
  version: EngineVersionLifecycleLike | null | undefined,
): DeployReleaseGateResult {
  const verificationState = version?.verificationState ?? version?.verification_state ?? null;
  const releaseState = version?.releaseState ?? version?.release_state ?? null;

  if (verificationState === "failed") {
    return {
      allowed: false,
      code: "DEPLOY_VERSION_FAILED",
      message:
        "Versionen underkändes av quality gate (typecheck/build) och kan inte publiceras. Kör autofix eller en ny förfining och försök igen.",
    };
  }

  if (resolveEngineVersionLifecycleStage(version) === "integrations") {
    if (verificationState === "passed" || releaseState === "promoted") {
      return { allowed: true };
    }
    return {
      allowed: false,
      code: "DEPLOY_RELEASE_GATE_NOT_GREEN",
      message:
        'Integrationsversionen (F3) har inte passerat ReleaseGate (typecheck + build) ännu och kan inte publiceras. Kör "Bygg integrationer" eller verifiera om, och publicera när versionen är grön.',
    };
  }

  return { allowed: true };
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
 * Semantics: newest non-failed, non-superseded version wins. `promoted` is a
 * quality signal (used by deploy via `selectDeployTargetEngineVersion`), NOT
 * a version-selection signal — otherwise a newer draft is silently ignored
 * and follow-ups merge against stale files. `superseded` rows are abandoned
 * mid-verify snapshots that a newer version replaced — never prefer them.
 */
export function selectPreferredEngineVersion<T extends EngineVersionLifecycleLike>(
  versions: T[],
): T | undefined {
  const sorted = sortEngineVersionsNewestFirst(versions);
  if (sorted.length === 0) {
    return undefined;
  }

  return (
    sorted.find((version) => {
      const status = resolveEngineVersionLifecycleStatus(version);
      return status !== "failed" && status !== "superseded";
    }) ?? sorted[0]
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
  const integrations = sorted.find((version) => {
    if (resolveEngineVersionLifecycleStage(version) !== "integrations") return false;
    const status = resolveEngineVersionLifecycleStatus(version);
    return status !== "failed" && status !== "superseded";
  });
  if (integrations) return integrations;
  return selectPreferredEngineVersion(versions);
}
