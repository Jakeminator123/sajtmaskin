import { OPENCLAW } from "@/lib/config";
import { readLiveReviewGrant } from "@/lib/db/services/live-review-grants";
import {
  abandonLiveReviewRun,
  beginPaidLiveReviewAttempt,
  claimLiveReviewRun,
  completeLiveReviewRun,
  deleteLiveReviewScreenshotUrls,
  deletePreviousLiveReviewBlobs,
  purgeExpiredLiveReviewBlobs,
  waitForLiveReviewRun,
  type ClaimedLiveReview,
} from "@/lib/db/services/live-review-runs";
import {
  resolveLiveReviewAccess,
  type LiveReviewGrantRecord,
} from "@/lib/openclaw/live-review-access";
import { LIVE_REVIEW_MAX_MODEL_ATTEMPTS } from "./live-review-claim";
import { skippedLiveReviewResult } from "./live-review-claim";
import { isLiveReviewEnabled, maybeAttachLiveReview } from "./live-review";
import type {
  LiveReviewResult,
  LiveReviewScreenshotSet,
  ProductDomSummary,
  ReviewFinding,
} from "./live-review-types";

export interface LiveReviewSession {
  captureEnabled: boolean;
  claim: ClaimedLiveReview | null;
  earlyResult: LiveReviewResult | null;
  chatId: string;
  versionId: string;
  filesRevision: string | null;
  userId: string;
}

export interface LiveReviewSessionDeps {
  readGrant?: typeof readLiveReviewGrant;
  claimRun?: typeof claimLiveReviewRun;
  waitForRun?: typeof waitForLiveReviewRun;
  completeRun?: typeof completeLiveReviewRun;
  abandonRun?: typeof abandonLiveReviewRun;
  deleteScreenshotUrls?: typeof deleteLiveReviewScreenshotUrls;
  beginPaidAttempt?: typeof beginPaidLiveReviewAttempt;
  deletePreviousBlobs?: typeof deletePreviousLiveReviewBlobs;
  purgeExpired?: typeof purgeExpiredLiveReviewBlobs;
  attachReview?: typeof maybeAttachLiveReview;
  flagEnabled?: boolean;
  editEnabled?: boolean;
}

/** Scrub URLs immediately when their backing blobs have been discarded. */
export function clearLiveReviewScreenshotUrls(
  screenshots: LiveReviewScreenshotSet | null | undefined,
): void {
  if (!screenshots) return;
  screenshots.desktopUrl = null;
  screenshots.mobileUrl = null;
}

export async function discardLiveReviewScreenshots(
  screenshots: LiveReviewScreenshotSet | null | undefined,
  deleteScreenshotUrls: typeof deleteLiveReviewScreenshotUrls = deleteLiveReviewScreenshotUrls,
): Promise<void> {
  try {
    await deleteScreenshotUrls(screenshots);
  } finally {
    clearLiveReviewScreenshotUrls(screenshots);
  }
}

export async function beginLiveReviewSession(
  input: {
    chatId: string;
    versionId: string;
    filesRevision: string | null | undefined;
    userId: string;
    grant?: LiveReviewGrantRecord | null;
  },
  deps: LiveReviewSessionDeps = {},
): Promise<LiveReviewSession> {
  const flagEnabled = deps.flagEnabled ?? isLiveReviewEnabled();
  const editEnabled = deps.editEnabled ?? OPENCLAW.editEnabled;
  const grant =
    input.grant !== undefined
      ? input.grant
      : await (deps.readGrant ?? readLiveReviewGrant)(input.chatId);
  const access = resolveLiveReviewAccess({ flagEnabled, editEnabled, grant });
  const base = {
    captureEnabled: false,
    claim: null,
    earlyResult: null as LiveReviewResult | null,
    chatId: input.chatId,
    versionId: input.versionId,
    filesRevision: input.filesRevision?.trim() || null,
    userId: input.userId,
  };
  if (!access.allow) {
    return { ...base, earlyResult: skippedLiveReviewResult(access.reason) };
  }
  if (!base.filesRevision) {
    return { ...base, earlyResult: skippedLiveReviewResult("missing_revision") };
  }

  const claim = await (deps.claimRun ?? claimLiveReviewRun)({
    chatId: input.chatId,
    versionId: input.versionId,
    filesRevision: base.filesRevision,
    userId: input.userId,
  });

  // Renew/insert the current revision before sweeping TTL rows. The purge
  // itself is CAS-guarded, but this ordering also prevents our own fresh run
  // from ever appearing in an expired candidate snapshot.
  void Promise.resolve((deps.purgeExpired ?? purgeExpiredLiveReviewBlobs)()).catch(() => undefined);

  if (!claim) {
    return { ...base, earlyResult: skippedLiveReviewResult("review_error", "claim failed") };
  }
  if (claim.kind === "cached" || claim.kind === "cost_capped") {
    return {
      ...base,
      claim,
      earlyResult:
        claim.kind === "cost_capped" && claim.result.status === "skipped"
          ? skippedLiveReviewResult("cost_capped", claim.result.detail)
          : claim.result,
    };
  }
  if (claim.kind === "in_flight") {
    return { ...base, claim };
  }
  return { ...base, captureEnabled: true, claim };
}

export async function finishLiveReviewSession(
  session: LiveReviewSession,
  input: {
    skipped: boolean;
    findings: readonly ReviewFinding[];
    screenshots: LiveReviewScreenshotSet | null | undefined;
    domSummary: ProductDomSummary | null | undefined;
    versionNumber?: number | null;
    previousVersionId?: string | null;
    previousFilesRevision?: string | null;
    filesJson: string | null | undefined;
    userRequest: string;
    briefSummary: string;
  },
  deps: LiveReviewSessionDeps = {},
): Promise<LiveReviewResult> {
  if (session.earlyResult) return session.earlyResult;

  if (session.claim?.kind === "in_flight" && session.filesRevision) {
    return (deps.waitForRun ?? waitForLiveReviewRun)({
      versionId: session.versionId,
      filesRevision: session.filesRevision,
    });
  }

  if (session.claim?.kind !== "acquired") {
    return skippedLiveReviewResult("review_error", "no acquired claim");
  }

  if (session.claim.row.modelAttempts >= LIVE_REVIEW_MAX_MODEL_ATTEMPTS) {
    const capped = skippedLiveReviewResult("cost_capped");
    await discardLiveReviewScreenshots(
      input.screenshots,
      deps.deleteScreenshotUrls ?? deleteLiveReviewScreenshotUrls,
    );
    await (deps.completeRun ?? completeLiveReviewRun)({
      id: session.claim.row.id,
      claimedAt: session.claim.row.claimedAt,
      filesRevision: session.claim.row.filesRevision,
      result: capped,
      screenshots: null,
    });
    return capped;
  }

  const attempts = await (deps.beginPaidAttempt ?? beginPaidLiveReviewAttempt)({
    id: session.claim.row.id,
    claimedAt: session.claim.row.claimedAt,
  });
  if (attempts == null) {
    await discardLiveReviewScreenshots(
      input.screenshots,
      deps.deleteScreenshotUrls ?? deleteLiveReviewScreenshotUrls,
    );
    if (session.filesRevision) {
      return (deps.waitForRun ?? waitForLiveReviewRun)({
        versionId: session.versionId,
        filesRevision: session.filesRevision,
      });
    }
    return skippedLiveReviewResult("claim_busy");
  }

  const attach = deps.attachReview ?? maybeAttachLiveReview;
  const result = await attach({
    enabled: true,
    skipped: input.skipped,
    findings: input.findings,
    screenshots: input.screenshots,
    domSummary: input.domSummary,
    versionId: session.versionId,
    chatId: session.chatId,
    versionNumber: input.versionNumber,
    previousVersionId: input.previousVersionId,
    previousFilesRevision: input.previousFilesRevision,
    filesJson: input.filesJson,
    userRequest: input.userRequest,
    briefSummary: input.briefSummary,
    filesRevision: session.filesRevision,
  });

  const paid =
    result.status === "completed" ||
    (result.status === "skipped" &&
      (result.reason === "review_error" ||
        result.reason === "model_unavailable" ||
        result.reason === "invalid_model_output" ||
        result.reason === "cost_capped"));
  if (!paid) {
    await discardLiveReviewScreenshots(
      input.screenshots,
      deps.deleteScreenshotUrls ?? deleteLiveReviewScreenshotUrls,
    );
    await (deps.abandonRun ?? abandonLiveReviewRun)(
      session.claim.row.id,
      session.claim.row.claimedAt,
    );
    return result;
  }

  const persisted = await (deps.completeRun ?? completeLiveReviewRun)({
    id: session.claim.row.id,
    claimedAt: session.claim.row.claimedAt,
    filesRevision: session.claim.row.filesRevision,
    result,
    screenshots: input.screenshots,
    modelAttempts: attempts,
  });

  if (!persisted) {
    await discardLiveReviewScreenshots(
      input.screenshots,
      deps.deleteScreenshotUrls ?? deleteLiveReviewScreenshotUrls,
    );
    await (deps.abandonRun ?? abandonLiveReviewRun)(
      session.claim.row.id,
      session.claim.row.claimedAt,
    );
    return result;
  }

  if (result.status === "completed" && session.filesRevision) {
    await (deps.deletePreviousBlobs ?? deletePreviousLiveReviewBlobs)({
      chatId: session.chatId,
      keepVersionId: session.versionId,
      keepFilesRevision: session.filesRevision,
      keepRunId: session.claim.row.id,
      keepClaimedAt: session.claim.row.claimedAt,
    });
  }

  return result;
}
