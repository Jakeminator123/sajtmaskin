import {
  isOpenClawPowerId,
  sanitizeOpenClawPowerIds,
  type OpenClawPowerId,
} from "@/lib/openclaw/powers";

export type LiveReviewAccessReason = "flag_off" | "grant_off" | "edit_off";

export interface LiveReviewGrantRecord {
  powersOn: boolean;
  granted: readonly OpenClawPowerId[];
}

/**
 * Fail-closed AND for Live Review capture + LLM.
 * A client-supplied grant list is not an input here — only a persisted
 * chat grant, the env flag, and OC_EDIT.
 */
export function resolveLiveReviewAccess(input: {
  flagEnabled: boolean;
  editEnabled: boolean;
  grant: LiveReviewGrantRecord | null | undefined;
}): { allow: true } | { allow: false; reason: LiveReviewAccessReason } {
  if (!input.flagEnabled) return { allow: false, reason: "flag_off" };
  if (!input.editEnabled) return { allow: false, reason: "edit_off" };
  const grant = input.grant;
  if (!grant?.powersOn) return { allow: false, reason: "grant_off" };
  if (!grant.granted.includes("live_review")) return { allow: false, reason: "grant_off" };
  return { allow: true };
}

export function parsePersistedLiveReviewGrant(input: {
  powersOn: unknown;
  granted: unknown;
}): LiveReviewGrantRecord {
  return {
    powersOn: input.powersOn === true,
    granted: sanitizeOpenClawPowerIds(input.granted),
  };
}

export function requestedGrantHasLiveReview(requested: unknown): boolean {
  if (!Array.isArray(requested)) return false;
  return requested.some((entry) => isOpenClawPowerId(entry) && entry === "live_review");
}

/**
 * OpenClaw chat may attach the [LIVE-REVIEW] info block from the persisted
 * grant — never from a forged request-body powers list. Review-intent and
 * debug still attach findings regardless of the critic tick.
 */
export function shouldAttachOpenClawLiveReviewContext(input: {
  routingIntent: string;
  debug: boolean;
  editEnabled: boolean;
  grant: LiveReviewGrantRecord | null | undefined;
}): boolean {
  if (input.routingIntent === "review" || input.debug) return true;
  return resolveLiveReviewAccess({
    flagEnabled: true,
    editEnabled: input.editEnabled,
    grant: input.grant,
  }).allow;
}
