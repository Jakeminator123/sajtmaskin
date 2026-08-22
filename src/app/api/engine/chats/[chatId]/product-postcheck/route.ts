import { NextResponse } from "next/server";
import { z } from "zod";
import { FEATURES } from "@/lib/config";
import { withRateLimit } from "@/lib/rate-limit";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import {
  runWithLlmUsageContext,
  safeUsageOwnerId,
  setLlmUsageContext,
} from "@/lib/observability/llm-usage";
import { getEngineVersionForChatByIdForRequest, getRequestUserId } from "@/lib/tenant";
import { runProductPostcheck } from "@/lib/gen/verify/product-postcheck";
import { pickUserRequestForVersion, summarizeBrief } from "@/lib/gen/verify/live-review";
import {
  beginLiveReviewSession,
  discardLiveReviewScreenshots,
  finishLiveReviewSession,
  type LiveReviewSession,
} from "@/lib/gen/verify/live-review-session";
import {
  abandonLiveReviewRun,
  deleteLiveReviewScreenshotUrls,
  getLiveReviewRunForVersion,
} from "@/lib/db/services/live-review-runs";
import { skippedLiveReviewResult } from "@/lib/gen/verify/live-review-claim";
import { readGenerationOrchestration } from "@/lib/gen/version-bound-orchestration";
import { emit as emitBusEvent } from "@/lib/logging/event-bus";
import { upsertAssistantMessageUiPart } from "@/lib/db/chat-repository-pg";

export const runtime = "nodejs";
// Postcheck alone can approach ~150s worst case (boot wait, crawl with the
// capture-extended deadline, two 15s JPEG captures, mobile probe); with
// SAJTMASKIN_LIVE_REVIEW on, the review chain adds up to another 90s
// (LIVE_REVIEW_TOTAL_TIMEOUT_MS). 300s (repo precedent: api/template,
// api/audit) keeps the JSON response from being platform-killed mid-flight.
export const maxDuration = 300;

const requestSchema = z.object({
  versionId: z.string().min(1),
  previewUrl: z.string().trim().optional().nullable(),
});

async function persistLiveReviewNotice(input: {
  chatId: string;
  messageId: string | null | undefined;
  versionId: string;
  liveReview: unknown;
  screenshots: unknown;
}): Promise<void> {
  const messageId = input.messageId?.trim();
  if (!messageId) return;
  try {
    await upsertAssistantMessageUiPart(input.chatId, messageId, {
      type: "tool:live-review",
      toolName: "Live-granskning",
      toolCallId: `live-review:${input.versionId}`,
      state: "output-available",
      output: {
        liveReview: input.liveReview,
        screenshots: input.screenshots ?? null,
      },
    });
  } catch (error) {
    console.warn(
      "[product-postcheck] live review notice persistence failed:",
      error instanceof Error ? error.message : error,
    );
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return withRateLimit(req, "engine:product-postcheck", () =>
    runWithLlmUsageContext({}, () => handlePOST(req, ctx)),
  );
}

function emitPostcheckDegraded(params: {
  versionId: string;
  chatId: string;
  reason: string;
  checkedUrl: string | null;
  durationMs: number | null;
}): void {
  // `runtime_error` means the postcheck CRASHED, not that it was
  // intentionally skipped. The human-readable `message` must reflect
  // that distinction — `meta.skippedReason` already disambiguates for
  // structured consumers, but devLog/UI readers see `message` directly
  // and "skipped" reads as a planned no-op. Policy/feature/missing-URL
  // skips keep the original phrasing.
  const isRuntimeError = params.reason === "runtime_error";
  const message = isRuntimeError
    ? `F2 Product Postcheck failed at runtime (${params.reason}).`
    : `F2 Product Postcheck skipped (${params.reason}).`;
  try {
    emitBusEvent({
      t: "version.degraded",
      versionId: params.versionId,
      chatId: params.chatId,
      kind: "product_postcheck_skipped",
      message,
      meta: {
        skippedReason: params.reason,
        checkedUrl: params.checkedUrl,
        durationMs: params.durationMs,
      },
    });
  } catch {
    // Bus emit is fire-and-forget telemetry — never let a logging
    // failure break the route response.
  }
}

function emitPostcheckBlocked(params: {
  versionId: string;
  chatId: string;
  warningCount: number;
  blockingCodes: string[];
  checkedUrl: string | null;
  durationMs: number | null;
}): void {
  // The postcheck RAN and judged the product broken (dead mobile menu or
  // 2+ broken in-page anchors). Distinct from a skip: emit a dedicated
  // `product_postcheck_blocked` so the version-status projection degrades
  // (never solid green) and backoffice/telemetry can tell "broke" apart
  // from "never ran".
  const detail =
    params.blockingCodes.length > 0 ? params.blockingCodes.join(", ") : "produktkontroll";
  try {
    emitBusEvent({
      t: "version.degraded",
      versionId: params.versionId,
      chatId: params.chatId,
      kind: "product_postcheck_blocked",
      message: `Product Postcheck hittade blockerande produktfel (${detail}).`,
      meta: {
        warningCount: params.warningCount,
        blockingCodes: params.blockingCodes,
        checkedUrl: params.checkedUrl,
        durationMs: params.durationMs,
      },
    });
  } catch {
    // Bus emit is fire-and-forget telemetry — never let a logging
    // failure break the route response.
  }
}

async function handlePOST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const validation = requestSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", details: validation.error.issues },
      { status: 400 },
    );
  }

  const { versionId, previewUrl } = validation.data;
  if (!FEATURES.f2ProductPostcheck) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      skippedReason: "feature_disabled",
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      routesChecked: 0,
      durationMs: 0,
      checkedUrl: previewUrl?.trim() || null,
      liveReview: skippedLiveReviewResult("postcheck_skipped", "F2 Product Postcheck är avstängd."),
    });
  }

  const usageOwnerId = await safeUsageOwnerId(() => getRequestUserId(req));
  setLlmUsageContext({
    chatId,
    userId: usageOwnerId,
    sessionId: getSessionIdFromRequest(req),
  });

  // Resolve+scope the version BEFORE the missing-preview-url skip so that
  // skip can be surfaced on the version-status projection. Stays AFTER the
  // feature-disabled return above, so default-OFF deployments do no DB read
  // and emit nothing (the client calls this route unconditionally — emitting
  // on `feature_disabled` would mark every version degraded).
  const scopedVersion = await getEngineVersionForChatByIdForRequest(req, chatId, versionId);
  if (!scopedVersion) {
    return NextResponse.json({ ok: false, error: "Version not found for chat" }, { status: 404 });
  }
  const resolvedVersionId = scopedVersion.version.id;
  setLlmUsageContext({ versionId: resolvedVersionId });

  if (!previewUrl?.trim()) {
    // A skipped DOM postcheck must never read as solid green. The common
    // client call passes `previewUrl: null` when the VM URL is not yet
    // resolved; without this emit the version-status badge stayed "ready"
    // even though DOM verification never ran. Mirror the post-run skip path.
    emitPostcheckDegraded({
      versionId: resolvedVersionId,
      chatId,
      reason: "missing_preview_url",
      checkedUrl: null,
      durationMs: 0,
    });
    const liveReview = skippedLiveReviewResult("preview_not_ready", "Preview-URL saknas.");
    await persistLiveReviewNotice({
      chatId,
      messageId: scopedVersion.version.message_id,
      versionId: resolvedVersionId,
      liveReview,
      screenshots: null,
    });
    return NextResponse.json({
      ok: true,
      skipped: true,
      skippedReason: "missing_preview_url",
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      routesChecked: 0,
      durationMs: 0,
      checkedUrl: null,
      liveReview,
    });
  }

  let liveReviewSession: LiveReviewSession | null = null;
  try {
    const filesRevision = scopedVersion.version.files_revision?.trim() || null;
    liveReviewSession = await beginLiveReviewSession({
      chatId,
      versionId: resolvedVersionId,
      filesRevision,
      userId: usageOwnerId ?? "anonymous",
    });

    const result = await runProductPostcheck({
      previewUrl,
      chatId,
      versionId,
      captureEnabled: liveReviewSession.captureEnabled,
      captureUserId: usageOwnerId ?? undefined,
      filesRevision,
    });

    // OMTAG-06 follow-up: emit a `version.degraded` bus event when the
    // product-postcheck never ran. The route already returns
    // `skipped: true` to the caller and post-checks.ts logs an info-level
    // engine_version_error_logs row, but neither surfaced the skip on
    // the version-status projection — so the UI showed "preview ok"
    // with no hint that DOM-level verification was missing.
    if (result.skipped) {
      emitPostcheckDegraded({
        versionId: resolvedVersionId,
        chatId,
        reason: result.skippedReason ?? "unknown",
        checkedUrl: result.checkedUrl ?? null,
        durationMs: result.durationMs ?? null,
      });
    } else if (result.productBlocked) {
      // The check ran and found blocking product defects — surface a
      // distinct degradation so the lifecycle badge stays honest (not solid
      // green) even though the page rendered and the build passed.
      const blockingCodes = Array.from(
        new Set(
          result.warnings
            .map((warning) => warning.code)
            .filter(
              (code) =>
                code === "mobile_menu_failed" ||
                code === "broken_anchor" ||
                code === "runtime_crash",
            ),
        ),
      );
      emitPostcheckBlocked({
        versionId: resolvedVersionId,
        chatId,
        warningCount: result.warningCount,
        blockingCodes,
        checkedUrl: result.checkedUrl ?? null,
        durationMs: result.durationMs ?? null,
      });
    }

    try {
      const versionOrchestration = await readGenerationOrchestration(resolvedVersionId);
      const persistedBaseVersionId =
        typeof versionOrchestration?.snapshot.baseVersionId === "string" &&
        versionOrchestration.snapshot.baseVersionId.trim()
          ? versionOrchestration.snapshot.baseVersionId.trim()
          : null;
      const persistedBaseFilesRevision =
        typeof versionOrchestration?.snapshot.baseFilesRevision === "string" &&
        versionOrchestration.snapshot.baseFilesRevision.trim()
          ? versionOrchestration.snapshot.baseFilesRevision.trim()
          : null;
      const previousVersionId =
        scopedVersion.version.parent_version_id?.trim() || persistedBaseVersionId;
      const exactBriefSummary = summarizeBrief(versionOrchestration?.snapshot);
      result.liveReview = await finishLiveReviewSession(liveReviewSession, {
        skipped: result.skipped,
        findings: result.warnings.map((warning) => ({
          code: warning.code,
          message: warning.message,
        })),
        screenshots: result.screenshots,
        domSummary: result.domSummary,
        versionNumber: scopedVersion.version.version_number,
        previousVersionId,
        previousFilesRevision: persistedBaseFilesRevision,
        filesJson: scopedVersion.version.files_json,
        userRequest: pickUserRequestForVersion(
          scopedVersion.chat?.messages ?? [],
          scopedVersion.version.message_id,
        ),
        briefSummary: exactBriefSummary,
      });
      if (
        liveReviewSession.claim &&
        !result.screenshots?.desktopUrl &&
        !result.screenshots?.mobileUrl
      ) {
        const durableRun = await getLiveReviewRunForVersion(resolvedVersionId, filesRevision);
        if (durableRun?.desktopUrl || durableRun?.mobileUrl) {
          result.screenshots = {
            desktopUrl: durableRun.desktopUrl,
            mobileUrl: durableRun.mobileUrl,
          };
        }
      }
    } catch (reviewError) {
      console.warn(
        "[product-postcheck] live review skipped:",
        reviewError instanceof Error ? reviewError.message : reviewError,
      );
      if (liveReviewSession.claim?.kind === "acquired") {
        await discardLiveReviewScreenshots(
          result.screenshots,
          deleteLiveReviewScreenshotUrls,
        ).catch(() => undefined);
        await abandonLiveReviewRun(
          liveReviewSession.claim.row.id,
          liveReviewSession.claim.row.claimedAt,
        ).catch(() => undefined);
      }
      result.liveReview = skippedLiveReviewResult(
        "review_error",
        reviewError instanceof Error ? reviewError.message : "Live review failed",
      );
    }

    await persistLiveReviewNotice({
      chatId,
      messageId: scopedVersion.version.message_id,
      versionId: resolvedVersionId,
      liveReview: result.liveReview ?? null,
      screenshots: result.screenshots ?? null,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (liveReviewSession?.claim?.kind === "acquired") {
      await abandonLiveReviewRun(
        liveReviewSession.claim.row.id,
        liveReviewSession.claim.row.claimedAt,
      ).catch(() => undefined);
    }
    console.error("[product-postcheck] Error:", err);
    // Mirror the skip emission for the runtime-error branch — same
    // observability surface for "ran but threw" as for the planned
    // skip cases above. Without this the version-status projection
    // can show solid green even when the postcheck blew up.
    emitPostcheckDegraded({
      versionId: resolvedVersionId,
      chatId,
      reason: "runtime_error",
      checkedUrl: null,
      durationMs: null,
    });
    const liveReview = skippedLiveReviewResult(
      "runtime_crash",
      err instanceof Error ? err.message : "Product postcheck failed",
    );
    await persistLiveReviewNotice({
      chatId,
      messageId: scopedVersion.version.message_id,
      versionId: resolvedVersionId,
      liveReview,
      screenshots: null,
    });
    return NextResponse.json({
      ok: true,
      skipped: true,
      skippedReason: "runtime_error",
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      routesChecked: 0,
      durationMs: 0,
      checkedUrl: null,
      error: err instanceof Error ? err.message : "Product postcheck failed",
      liveReview,
    });
  }
}
