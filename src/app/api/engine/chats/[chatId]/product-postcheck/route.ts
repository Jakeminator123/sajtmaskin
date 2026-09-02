import { randomUUID } from "node:crypto";
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
import {
  runProductPostcheck,
  type ProductPostcheckResult,
} from "@/lib/gen/verify/product-postcheck";
import { pickUserRequest, summarizeBrief } from "@/lib/gen/verify/live-review";
import {
  beginLiveReviewSession,
  finishLiveReviewSession,
  type LiveReviewSession,
} from "@/lib/gen/verify/live-review-session";
import {
  abandonLiveReviewRun,
  deleteLiveReviewScreenshotUrls,
} from "@/lib/db/services/live-review-runs";
import { emit as emitBusEvent } from "@/lib/logging/event-bus";
import { getActivePreviewSessionAsync } from "@/lib/gen/preview/session-store";
import { getPreviewHostBaseUrl } from "@/lib/gen/preview/tier2-config";
import { LIVE_REVIEW_TOTAL_TIMEOUT_MS } from "@/lib/gen/verify/live-review";
import { isLiveReviewEnabled } from "@/lib/openclaw/live-review-access";
import {
  PRODUCT_POSTCHECK_ROUTE_BUDGET_MS,
  productPostcheckPreviewWaitBudgetMs,
  readProductPostcheckPreviewProbe,
  waitForProductPostcheckPreviewRunning,
  type ProductPostcheckPreviewProbe,
} from "@/lib/gen/verify/product-postcheck-preview-wait";
import { formatProductPostcheckSkippedMessage } from "@/lib/gen/verify/product-postcheck-skip";

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
  /**
   * Exact `files_revision` the caller confirmed persisted. When set, a DB
   * mismatch is `preview_superseded` — never an attestation of a stale
   * client snapshot.
   */
  filesRevision: z.string().trim().min(1).max(160).optional(),
});

type ProductPostcheckTarget = {
  previewSessionId: string;
  lifecycleToken: string | null;
  filesRevision: string;
};

function bindProductPostcheckTarget(
  session: {
    previewSessionId?: string | null;
    lifecycleToken?: string | null;
    filesRevision?: string | null;
    versionId?: string | null;
  } | null,
  versionId: string,
  filesRevision: string | null,
): ProductPostcheckTarget | null {
  const previewSessionId = session?.previewSessionId?.trim() || "";
  const lifecycleToken = session?.lifecycleToken?.trim() || null;
  const sessionFilesRevision = session?.filesRevision?.trim() || "";
  if (
    !filesRevision ||
    session?.versionId !== versionId ||
    !previewSessionId ||
    previewSessionId === "unbound" ||
    sessionFilesRevision !== filesRevision
  ) {
    return null;
  }
  return { previewSessionId, lifecycleToken, filesRevision };
}

/** Origin + pathname only — query/hash must not fake a different preview. */
function previewUrlOriginAndPath(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

/**
 * Session URL is authoritative. Client URL is fallback only when the
 * bound session has none. A client URL that differs on origin+path is
 * ignored — that is a stale hint, not `preview_superseded` (supersede
 * means the bind/target itself rotated).
 */
function resolveAuthoritativePreviewUrl(params: {
  sessionPreviewUrl?: string | null;
  clientPreviewUrl?: string | null;
}): string {
  const sessionUrl = params.sessionPreviewUrl?.trim() || "";
  const clientUrl = params.clientPreviewUrl?.trim() || "";
  if (!sessionUrl) return clientUrl;
  if (!clientUrl) return sessionUrl;
  const sessionKey = previewUrlOriginAndPath(sessionUrl);
  const clientKey = previewUrlOriginAndPath(clientUrl);
  if (sessionKey && clientKey && sessionKey !== clientKey) {
    // Sessionen vinner ändå, men divergensen är värd att se: den betyder att
    // klienten satt kvar på en äldre preview-adress än den bundna sessionen.
    console.warn(
      `[product-postcheck] Ignorerar klientens preview-URL (${clientKey}) — bunden session pekar på ${sessionKey}.`,
    );
  }
  return sessionUrl;
}

function supersededPostcheckResult(params: {
  previewUrl: string;
  durationMs?: number | null;
  routesChecked?: number | null;
}): ProductPostcheckResult {
  return {
    ok: true,
    skipped: true,
    skippedReason: "preview_superseded",
    warnings: [],
    warningCount: 0,
    productBlocked: false,
    routesChecked: params.routesChecked ?? 0,
    durationMs: params.durationMs ?? 0,
    checkedUrl: params.previewUrl,
    screenshots: null,
    domSummary: null,
    attestation: null,
  };
}

/**
 * Wait budget ended, host still starting, or `httpReady: false`.
 * No attestation and no `version.degraded` emit — L3's
 * `productPostcheckNeedsRetry` treats a missing attestation as pending.
 */
function pendingPreviewNotReadyResult(params: {
  previewUrl: string | null;
  durationMs?: number | null;
  verificationRunId?: string | null;
}): ProductPostcheckResult {
  return {
    ok: true,
    skipped: true,
    skippedReason: "preview_not_ready",
    warnings: [],
    warningCount: 0,
    productBlocked: false,
    routesChecked: 0,
    durationMs: params.durationMs ?? 0,
    checkedUrl: params.previewUrl,
    screenshots: null,
    domSummary: null,
    attestation: null,
    verificationRunId: params.verificationRunId ?? null,
  };
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
  attestation?: ProductPostcheckTarget | null;
  verificationRunId?: string | null;
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
    : formatProductPostcheckSkippedMessage(params.reason);
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
        attestedPreviewSessionId: params.attestation?.previewSessionId ?? null,
        attestedLifecycleToken: params.attestation?.lifecycleToken ?? null,
        attestedFilesRevision: params.attestation?.filesRevision ?? null,
        verificationRunId: params.verificationRunId ?? null,
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
  attestation: ProductPostcheckTarget;
  verificationRunId?: string | null;
}): void {
  // The postcheck RAN and judged the product broken (dead mobile menu or
  // 2+ broken in-page anchors). Distinct from a skip: emit a dedicated
  // `product_postcheck_blocked` so the version-status projection degrades
  // (never solid green) and backoffice/telemetry can tell "broke" apart
  // from "never ran".
  const detail = params.blockingCodes.length > 0 ? params.blockingCodes.join(", ") : "produktkontroll";
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
        attestedPreviewSessionId: params.attestation.previewSessionId,
        attestedLifecycleToken: params.attestation.lifecycleToken,
        attestedFilesRevision: params.attestation.filesRevision,
        verificationRunId: params.verificationRunId ?? null,
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

  const { versionId, previewUrl, filesRevision: requestedFilesRevision } = validation.data;
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

  let liveReviewSession: LiveReviewSession | null = null;
  let target: ProductPostcheckTarget | null = null;
  let targetIsCurrent: (() => Promise<boolean>) | null = null;
  let resolvedPreviewUrl = "";
  const routeStartedAt = Date.now();
  // Ett id per verifieringskörning. Alla persisterade rader, bus-events och
  // svaret bär samma id så en omkörning aldrig kan förväxlas med en tidigare.
  const verificationRunId = randomUUID();
  try {
    const dbFilesRevision = scopedVersion.version.files_revision?.trim() || null;
    if (requestedFilesRevision && requestedFilesRevision !== dbFilesRevision) {
      return NextResponse.json(
        supersededPostcheckResult({
          previewUrl: previewUrl?.trim() || "",
        }),
      );
    }
    const filesRevision = requestedFilesRevision ?? dbFilesRevision;
    if (!filesRevision) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        skippedReason: "preview_not_running",
        warnings: [],
        warningCount: 0,
        productBlocked: false,
        routesChecked: 0,
        durationMs: Date.now() - routeStartedAt,
        checkedUrl: previewUrl?.trim() || null,
      });
    }
    // Slow Fly rebuilds used to hit bind/capture immediately and skip with
    // no visible reason. Wait read-only until the host is running for this
    // versionId (or the budget ends) before Playwright starts. Without a
    // configured host there is nothing to poll — keep the legacy bind path.
    let waitedProbe: ProductPostcheckPreviewProbe | null = null;
    const liveReviewReserveMs = isLiveReviewEnabled() ? LIVE_REVIEW_TOTAL_TIMEOUT_MS : 0;
    if (getPreviewHostBaseUrl()) {
      const sessionHint = await getActivePreviewSessionAsync(chatId);
      const pinnedSessionId = sessionHint?.previewSessionId?.trim() || "";
      const pinIdentity = Boolean(
        pinnedSessionId &&
          sessionHint?.versionId === resolvedVersionId &&
          sessionHint.filesRevision === filesRevision,
      );
      const previewWait = await waitForProductPostcheckPreviewRunning({
        expectedVersionId: resolvedVersionId,
        expectedFilesRevision: filesRevision,
        ...(pinIdentity
          ? {
              expectedPreviewSessionId: pinnedSessionId,
              expectedLifecycleToken: sessionHint?.lifecycleToken ?? null,
            }
          : {}),
        timeoutMs: productPostcheckPreviewWaitBudgetMs({ liveReviewReserveMs }),
        probe: () =>
          readProductPostcheckPreviewProbe({
            chatId,
            expectedVersionId: resolvedVersionId,
          }),
      });
      if (!previewWait.ok && previewWait.reason === "preview_superseded") {
        return NextResponse.json(
          supersededPostcheckResult({
            previewUrl:
              previewWait.lastProbe?.previewUrl?.trim() || previewUrl?.trim() || "",
          }),
        );
      }
      if (!previewWait.ok) {
        // starting / httpReady:false / timeout / failed. Never attest —
        // an attested `preview_not_running` used to release the quality gate.
        return NextResponse.json(
          pendingPreviewNotReadyResult({
            previewUrl:
              previewWait.lastProbe?.previewUrl?.trim() || previewUrl?.trim() || null,
            durationMs: Date.now() - routeStartedAt,
            verificationRunId,
          }),
        );
      }
      waitedProbe = previewWait.probe;
    }

    const previewSession = waitedProbe
      ? {
          previewSessionId: waitedProbe.previewSessionId,
          lifecycleToken: waitedProbe.lifecycleToken,
          versionId: waitedProbe.versionId,
          filesRevision: waitedProbe.filesRevision,
          previewUrl: waitedProbe.previewUrl,
        }
      : await getActivePreviewSessionAsync(chatId);
    const boundTarget = bindProductPostcheckTarget(
      previewSession,
      resolvedVersionId,
      filesRevision,
    );
    if (!boundTarget) {
      return NextResponse.json(
        supersededPostcheckResult({
          previewUrl:
            previewSession?.previewUrl?.trim() || previewUrl?.trim() || "",
        }),
      );
    }
    target = boundTarget;

    const isTargetCurrent = async (): Promise<boolean> => {
      const [latestScopedVersion, latestSession] = await Promise.all([
        getEngineVersionForChatByIdForRequest(req, chatId, versionId),
        getActivePreviewSessionAsync(chatId),
      ]);
      return Boolean(
        latestScopedVersion?.version.id === resolvedVersionId &&
          latestScopedVersion.version.files_revision?.trim() === boundTarget.filesRevision &&
          bindProductPostcheckTarget(
            latestSession,
            resolvedVersionId,
            boundTarget.filesRevision,
          )?.previewSessionId === boundTarget.previewSessionId &&
          (latestSession?.lifecycleToken?.trim() || null) === boundTarget.lifecycleToken,
      );
    };
    targetIsCurrent = isTargetCurrent;

    resolvedPreviewUrl = resolveAuthoritativePreviewUrl({
      sessionPreviewUrl: previewSession?.previewUrl,
      clientPreviewUrl: previewUrl,
    });
    if (!resolvedPreviewUrl) {
      // This is a real failure to run against the CURRENT preview target, so it
      // may be projected and persisted with the same attestation. A request
      // without a current target was returned as a silent supersession above.
      emitPostcheckDegraded({
        versionId: resolvedVersionId,
        chatId,
        reason: "missing_preview_url",
        checkedUrl: null,
        durationMs: 0,
        attestation: boundTarget,
        verificationRunId,
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
        attestation: boundTarget,
        verificationRunId,
      });
    }

    liveReviewSession = await beginLiveReviewSession({
      chatId,
      versionId: resolvedVersionId,
      filesRevision,
      userId: usageOwnerId ?? "anonymous",
    });

    const remainingAfterWaitMs = Math.max(
      0,
      PRODUCT_POSTCHECK_ROUTE_BUDGET_MS - (Date.now() - routeStartedAt),
    );
    const postcheckTimeoutMs = Math.max(
      8_000,
      remainingAfterWaitMs - liveReviewReserveMs,
    );
    const result = await runProductPostcheck({
      previewUrl: resolvedPreviewUrl,
      chatId,
      versionId,
      timeoutMs: postcheckTimeoutMs,
      captureEnabled: liveReviewSession.captureEnabled,
      captureUserId: usageOwnerId ?? undefined,
      filesRevision,
      previewSessionId: boundTarget.previewSessionId,
      lifecycleToken: boundTarget.lifecycleToken,
    });

    if (!(await isTargetCurrent().catch(() => false))) {
      if (result.screenshots) {
        await deleteLiveReviewScreenshotUrls(result.screenshots).catch(() => undefined);
      }
      if (liveReviewSession.claim?.kind === "acquired") {
        await abandonLiveReviewRun(
          liveReviewSession.claim.row.id,
          liveReviewSession.claim.row.claimedAt,
        ).catch(() => undefined);
      }
      return NextResponse.json(
        supersededPostcheckResult({
          previewUrl: resolvedPreviewUrl,
          durationMs: result.durationMs,
          routesChecked: result.routesChecked,
        }),
      );
    }

    try {
      result.liveReview = await finishLiveReviewSession(liveReviewSession, {
        skipped: result.skipped,
        findings: result.warnings.map((warning) => ({
          code: warning.code,
          message: warning.message,
        })),
        screenshots: result.screenshots,
        domSummary: result.domSummary,
        versionNumber: scopedVersion.version.version_number,
        filesJson: scopedVersion.version.files_json,
        userRequest: pickUserRequest(scopedVersion.chat?.messages ?? []),
        briefSummary: summarizeBrief(scopedVersion.chat?.orchestration_snapshot),
        isTargetCurrent,
      });
    } catch (reviewError) {
      console.warn(
        "[product-postcheck] live review skipped:",
        reviewError instanceof Error ? reviewError.message : reviewError,
      );
      if (liveReviewSession.claim?.kind === "acquired") {
        await deleteLiveReviewScreenshotUrls(result.screenshots).catch(() => undefined);
        await abandonLiveReviewRun(
          liveReviewSession.claim.row.id,
          liveReviewSession.claim.row.claimedAt,
        ).catch(() => undefined);
      }
    }

    // The critic can take another minute. Re-check immediately before the
    // HTTP result becomes durable client-side evidence; no pass/block event
    // is emitted until this fence succeeds.
    if (!(await isTargetCurrent().catch(() => false))) {
      return NextResponse.json(
        supersededPostcheckResult({
          previewUrl: resolvedPreviewUrl,
          durationMs: result.durationMs,
          routesChecked: result.routesChecked,
        }),
      );
    }

    // OMTAG-06 follow-up: emit a `version.degraded` bus event when the
    // product-postcheck never ran. The route already returns
    // `skipped: true` to the caller and post-checks.ts persists the skip,
    // but neither surface may attest a superseded lifecycle/revision.
    if (result.skipped && result.skippedReason !== "preview_superseded") {
      emitPostcheckDegraded({
        versionId: resolvedVersionId,
        chatId,
        reason: result.skippedReason ?? "unknown",
        checkedUrl: result.checkedUrl ?? null,
        durationMs: result.durationMs ?? null,
        attestation: boundTarget,
        verificationRunId,
      });
    } else if (result.productBlocked) {
      const blockingCodes = Array.from(
        new Set(
          result.warnings
            .map((warning) => warning.code)
            .filter(
              (code) =>
                code === "mobile_menu_failed" ||
                code === "broken_anchor" ||
                code === "runtime_crash" ||
                code === "preview_boot_page" ||
                code === "hydration_dom_loss",
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
        attestation: boundTarget,
        verificationRunId,
      });
    }

    result.attestation = boundTarget;
    result.verificationRunId = verificationRunId;
    return NextResponse.json(result);
  } catch (err) {
    if (liveReviewSession?.claim?.kind === "acquired") {
      await abandonLiveReviewRun(
        liveReviewSession.claim.row.id,
        liveReviewSession.claim.row.claimedAt,
      ).catch(() => undefined);
    }
    console.error("[product-postcheck] Error:", err);
    if (
      target &&
      targetIsCurrent &&
      !(await targetIsCurrent().catch(() => false))
    ) {
      return NextResponse.json(
        supersededPostcheckResult({
          previewUrl: resolvedPreviewUrl || previewUrl?.trim() || "",
        }),
      );
    }
    // Mirror the skip emission for the runtime-error branch — same
    // observability surface for "ran but threw" as for the planned
    // skip cases above. Without this the version-status projection
    // can show solid green even when the postcheck blew up.
    const runtimeCheckedUrl = resolvedPreviewUrl || previewUrl?.trim() || null;
    if (target) {
      emitPostcheckDegraded({
        versionId: resolvedVersionId,
        chatId,
        reason: "runtime_error",
        checkedUrl: runtimeCheckedUrl,
        durationMs: null,
        attestation: target,
        verificationRunId,
      });
    }
    return NextResponse.json({
      ok: true,
      skipped: true,
      skippedReason: "runtime_error",
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      routesChecked: 0,
      durationMs: 0,
      checkedUrl: runtimeCheckedUrl,
      error: err instanceof Error ? err.message : "Product postcheck failed",
      attestation: target,
      verificationRunId,
    });
  }
}
