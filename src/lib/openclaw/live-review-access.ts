import {
  isOpenClawPowerId,
  sanitizeOpenClawPowerIds,
  type OpenClawPowerId,
} from "@/lib/openclaw/powers";
import { getServerEnv } from "@/lib/env";

export type LiveReviewAccessReason = "flag_off" | "grant_off" | "edit_off";

export interface LiveReviewGrantRecord {
  powersOn: boolean;
  granted: readonly OpenClawPowerId[];
}

function isAffirmativeEnv(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

export function isLiveReviewEnabled(): boolean {
  return isAffirmativeEnv(getServerEnv().SAJTMASKIN_LIVE_REVIEW);
}

/** Deployment-wide replacement for the per-chat grant, not for either kill switch. */
export function isLiveReviewAutoGrantEnabled(): boolean {
  return isAffirmativeEnv(getServerEnv().SAJTMASKIN_LIVE_REVIEW_AUTO_GRANT);
}

/**
 * Fail-closed access for Live Review capture + LLM.
 * A client-supplied grant list is not an input here — only a persisted
 * chat grant or the deployment-owned auto-grant env, plus the feature flag
 * and OC_EDIT.
 */
export function resolveLiveReviewAccess(input: {
  flagEnabled: boolean;
  editEnabled: boolean;
  autoGrantEnabled?: boolean;
  grant: LiveReviewGrantRecord | null | undefined;
}): { allow: true } | { allow: false; reason: LiveReviewAccessReason } {
  if (!input.flagEnabled) return { allow: false, reason: "flag_off" };
  if (!input.editEnabled) return { allow: false, reason: "edit_off" };
  if (input.autoGrantEnabled === true) return { allow: true };
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
  flagEnabled: boolean;
  editEnabled: boolean;
  autoGrantEnabled?: boolean;
  grant: LiveReviewGrantRecord | null | undefined;
}): boolean {
  if (input.routingIntent === "review" || input.debug) return true;
  return resolveLiveReviewAccess({
    flagEnabled: input.flagEnabled,
    editEnabled: input.editEnabled,
    autoGrantEnabled: input.autoGrantEnabled,
    grant: input.grant,
  }).allow;
}
