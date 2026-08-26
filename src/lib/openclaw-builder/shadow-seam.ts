/**
 * Fail-closed dispatch seam for a frozen package that may start a shadow
 * plan *beside* classic. Pure: no I/O, no env, no model start. Shadow is
 * additive only — a successful decision never skips classic.
 */

export type ShadowSeamInput = {
  requestedLane: "classic" | "openclaw_shadow" | "openclaw_candidate" | string;
  packageFrozen: boolean;
  generationInputPackageHash: string; // 64 hex
  jobStatus:
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "stale"
    | "cancelled"
    | "superseded"
    | "expired";
  shadowAvailable: boolean;
};

export type ShadowSeamDecision =
  | {
      ok: true;
      dispatch: "classic_only" | "classic_plus_shadow";
      reason: "default_classic" | "lane_unavailable" | "shadow_armed";
      generationInputPackageHash: string;
    }
  | { ok: false; code: "package_not_frozen" | "invalid_hash" | "job_not_running" | "invalid_input" };

const HEX64_RE = /^[0-9a-f]{64}$/;

const JOB_STATUSES = new Set([
  "pending",
  "running",
  "completed",
  "failed",
  "stale",
  "cancelled",
  "superseded",
  "expired",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function classicOnly(
  reason: "default_classic" | "lane_unavailable",
  generationInputPackageHash: string,
): ShadowSeamDecision {
  return {
    ok: true,
    dispatch: "classic_only",
    reason,
    generationInputPackageHash,
  };
}

export function decideShadowSeam(input: ShadowSeamInput): ShadowSeamDecision {
  if (!isRecord(input)) {
    return { ok: false, code: "invalid_input" };
  }
  if (typeof input.requestedLane !== "string") {
    return { ok: false, code: "invalid_input" };
  }
  if (typeof input.packageFrozen !== "boolean") {
    return { ok: false, code: "invalid_input" };
  }
  if (typeof input.generationInputPackageHash !== "string") {
    return { ok: false, code: "invalid_input" };
  }
  if (typeof input.jobStatus !== "string" || !JOB_STATUSES.has(input.jobStatus)) {
    return { ok: false, code: "invalid_input" };
  }
  if (typeof input.shadowAvailable !== "boolean") {
    return { ok: false, code: "invalid_input" };
  }

  if (!input.packageFrozen) {
    return { ok: false, code: "package_not_frozen" };
  }
  if (!HEX64_RE.test(input.generationInputPackageHash)) {
    return { ok: false, code: "invalid_hash" };
  }
  if (input.jobStatus !== "running") {
    return { ok: false, code: "job_not_running" };
  }

  const hash = input.generationInputPackageHash;

  if (input.requestedLane === "openclaw_shadow") {
    if (input.shadowAvailable) {
      return {
        ok: true,
        dispatch: "classic_plus_shadow",
        reason: "shadow_armed",
        generationInputPackageHash: hash,
      };
    }
    return classicOnly("lane_unavailable", hash);
  }

  if (input.requestedLane === "openclaw_candidate") {
    return classicOnly("lane_unavailable", hash);
  }

  return classicOnly("default_classic", hash);
}
