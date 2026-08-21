import type { LiveReviewResult, LiveReviewSkipReason } from "./live-review-types";

export const LIVE_REVIEW_TTL_DAYS = 7;
export const LIVE_REVIEW_TTL_MS = LIVE_REVIEW_TTL_DAYS * 24 * 60 * 60 * 1000;
export const LIVE_REVIEW_CLAIM_LEASE_MS = 4 * 60 * 1000;
export const LIVE_REVIEW_CLAIM_WAIT_MS = 90_000;
export const LIVE_REVIEW_MAX_MODEL_ATTEMPTS = 2;

export type LiveReviewRunStatus = "running" | "completed" | "skipped";

export interface LiveReviewRunRow {
  id: string;
  chatId: string;
  versionId: string;
  filesRevision: string;
  userId: string;
  status: LiveReviewRunStatus;
  skipReason: string | null;
  result: LiveReviewResult | null;
  desktopUrl: string | null;
  mobileUrl: string | null;
  desktopBlobPath: string | null;
  mobileBlobPath: string | null;
  modelAttempts: number;
  claimedAt: Date;
  completedAt: Date | null;
  expiresAt: Date;
}

export type LiveReviewClaimDecision =
  | { kind: "acquired" }
  | { kind: "cached"; result: LiveReviewResult }
  | { kind: "in_flight" }
  | { kind: "takeover" }
  | { kind: "cost_capped"; result: LiveReviewResult };

export function liveReviewExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + LIVE_REVIEW_TTL_MS);
}

export function isLiveReviewClaimLeaseStale(
  claimedAt: Date,
  now: Date = new Date(),
): boolean {
  return now.getTime() - claimedAt.getTime() >= LIVE_REVIEW_CLAIM_LEASE_MS;
}

/**
 * Pure claim policy. The DB layer inserts first; this decides what a
 * conflicting existing row means. Fail-closed: unknown status is in-flight
 * (do not start a second paid review).
 */
export function decideLiveReviewClaim(
  existing: LiveReviewRunRow,
  now: Date = new Date(),
): LiveReviewClaimDecision {
  if (
    existing.modelAttempts >= LIVE_REVIEW_MAX_MODEL_ATTEMPTS &&
    existing.result
  ) {
    return { kind: "cost_capped", result: existing.result };
  }
  if (existing.status === "completed" && existing.result) {
    return { kind: "cached", result: existing.result };
  }
  if (existing.status === "skipped" && existing.result) {
    return { kind: "cached", result: existing.result };
  }
  if (existing.status === "running") {
    return isLiveReviewClaimLeaseStale(existing.claimedAt, now)
      ? { kind: "takeover" }
      : { kind: "in_flight" };
  }
  return { kind: "in_flight" };
}

export function liveReviewResultFromRow(row: LiveReviewRunRow): LiveReviewResult | null {
  return row.result;
}

export function skippedLiveReviewResult(
  reason: LiveReviewSkipReason,
  detail?: string,
): LiveReviewResult {
  return detail ? { status: "skipped", reason, detail } : { status: "skipped", reason };
}
