import { FEATURES } from "@/lib/config";
import {
  acquireVersionLease, getChat, getVersionById, leaseTableExists,
  releaseVersionLease, renewVersionLease,
} from "@/lib/db/chat-repository-pg";
import {
  claimProductPostcheckRun, lookupProductPostcheckRun,
  normalizeProductPostcheckMutationRevision, type ProductPostcheckClaimKey,
} from "@/lib/db/services/product-postcheck-runs";
import { commitProductPostcheckResult, storeProductPostcheckPolicySkip } from "@/lib/db/services/version-errors";
import {
  abandonLiveReviewRun, deleteLiveReviewScreenshotUrls,
  isLiveReviewHeldContext, type LiveReviewHeldContext,
} from "@/lib/db/services/live-review-runs";
import { emit as emitBusEvent } from "@/lib/logging/event-bus";
import { getActivePreviewSessionAsync } from "@/lib/gen/preview/session-store";
import { getPreviewHostBaseUrl } from "@/lib/gen/preview/tier2-config";
import { readProductPostcheckVerdictForVersion } from "@/lib/integrations/tier3-readiness-gate";
import { isLiveReviewEnabled } from "@/lib/openclaw/live-review-access";
import { runProductPostcheck, type ProductPostcheckResult } from "./product-postcheck";
import { beginLiveReviewSession, finishLiveReviewSession, type LiveReviewSession } from "./live-review-session";
import { LIVE_REVIEW_TOTAL_TIMEOUT_MS, resolveUserRequestForVersion, summarizeBrief } from "./live-review";
import {
  PRODUCT_POSTCHECK_ROUTE_BUDGET_MS, productPostcheckPreviewWaitBudgetMs,
  readProductPostcheckPreviewProbe, waitForProductPostcheckPreviewRunning,
  type ProductPostcheckPreviewProbe,
} from "./product-postcheck-preview-wait";
import { formatProductPostcheckSkippedMessage, isNonFinalProductPostcheckSkipReason } from "./product-postcheck-skip";
import { isNonBlockingPreviewBootResult, productPostcheckResultFromVerdict } from "./product-postcheck-verdict";

export type VersionProductPostcheckOutcome =
  | { kind: "result"; result: ProductPostcheckResult }
  | { kind: "unavailable"; code: "claim_unavailable" | "lease_unavailable" }
  | { kind: "not_found" };

type VersionProductPostcheckInput = {
  chatId: string;
  versionId: string;
  userId: string;
  previewUrl?: string | null;
  filesRevision?: string;
  deadlineAt?: number;
};

// Within the existing 280s budget, leave time for bounded persistence + release.
const PERSIST_RELEASE_RESERVE_MS = 10_000;
const unavailable = (code: "claim_unavailable" | "lease_unavailable"): VersionProductPostcheckOutcome => ({ kind: "unavailable", code });
const outcome = (result: ProductPostcheckResult): VersionProductPostcheckOutcome => ({ kind: "result", result });
function skipped(reason: ProductPostcheckResult["skippedReason"], previewUrl: string | null, durationMs = 0): ProductPostcheckResult {
  return { ok: true, skipped: true, skippedReason: reason, warnings: [], warningCount: 0,
    productBlocked: false, routesChecked: 0, durationMs, checkedUrl: previewUrl,
    screenshots: null, domSummary: null, attestation: null };
}

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


function claimKey(versionId: string, target: ProductPostcheckTarget, mutationRevision: number): ProductPostcheckClaimKey {
  return { versionId, filesRevision: target.filesRevision, previewSession: target.previewSessionId,
    lifecycleToken: target.lifecycleToken, mutationRevision };
}

async function replay(versionId: string, runId: string, status: string, previewUrl: string, target: ProductPostcheckTarget): Promise<VersionProductPostcheckOutcome> {
  const read = await readProductPostcheckVerdictForVersion(versionId, { claim: { status } });
  return outcome(productPostcheckResultFromVerdict({
    verdict: read.verdict, runId, claimStatus: status as ProductPostcheckResult["claimStatus"], previewUrl,
    attestation: ["passed", "blocked", "allowed_skip"].includes(read.verdict) ? target : null,
  }));
}

/** Public server wrapper. Authorization belongs to its HTTP/parent caller. */
export async function runVersionProductPostcheck(input: VersionProductPostcheckInput): Promise<VersionProductPostcheckOutcome> {
  const deadlineAt = input.deadlineAt ?? Date.now() + PRODUCT_POSTCHECK_ROUTE_BUDGET_MS;
  try {
    const version = await getVersionById(input.versionId);
    if (!version || version.chat_id !== input.chatId) return { kind: "not_found" };
    const revision = version.files_revision?.trim() || null;
    if (input.filesRevision && input.filesRevision !== revision) return outcome(skipped("preview_superseded", input.previewUrl?.trim() || ""));
    if (!revision) return outcome(skipped("preview_not_running", input.previewUrl?.trim() || null));
    if (!FEATURES.f2ProductPostcheck) return await storedPolicySkip(input, revision);
    const session = await getActivePreviewSessionAsync(input.chatId);
    const target = bindProductPostcheckTarget(session, input.versionId, revision);
    // Replay takes neither versionslease nor new productclaim.
    if (target) {
      const lookup = await lookupProductPostcheckRun({ chatId: input.chatId,
        key: claimKey(input.versionId, target, normalizeProductPostcheckMutationRevision(session?.mutationRevision)) });
      if (lookup.kind === "unavailable") return unavailable("claim_unavailable");
      if (lookup.kind === "busy" || lookup.kind === "settled") {
        return await replay(input.versionId, lookup.runId, lookup.status, session?.previewUrl?.trim() || input.previewUrl?.trim() || "", target);
      }
    }
    if (!Number.isFinite(deadlineAt) || Date.now() >= deadlineAt - PERSIST_RELEASE_RESERVE_MS) return outcome(skipped("preview_not_ready", input.previewUrl?.trim() || null));
    if (await leaseTableExists() !== "exists") return unavailable("lease_unavailable");
    const lease = await acquireVersionLease(input.versionId, "server_verify");
    if (!lease) return unavailable("lease_unavailable");
    try {
      return await runHeldVersionProductPostcheck({ ...input, deadlineAt,
        held: { chatId: input.chatId, versionId: input.versionId, filesRevision: revision, holderRunId: lease.runId },
        expectedPreview: target ? { ...target, mutationRevision: normalizeProductPostcheckMutationRevision(session?.mutationRevision) } : undefined });
    } finally {
      await releaseVersionLease(input.versionId, lease.runId);
    }
  } catch (error) {
    console.warn("[product-postcheck] versionslease/read failed:", error);
    return unavailable("lease_unavailable");
  }
}

async function storedPolicySkip(input: VersionProductPostcheckInput, revision: string): Promise<VersionProductPostcheckOutcome> {
  const receipt = await storeProductPostcheckPolicySkip({ chatId: input.chatId, versionId: input.versionId, expectedFilesRevision: revision });
  if (receipt.status === "superseded") return outcome(skipped("preview_superseded", input.previewUrl?.trim() || null));
  if (receipt.status !== "stored") return unavailable("claim_unavailable");
  return outcome({ ...skipped("feature_disabled", input.previewUrl?.trim() || null),
    storageReceipt: { status: "stored", versionId: input.versionId, filesRevision: revision } });
}

/** Shared core for an already-held versionslease. Never acquires/releases it. */
export async function runHeldVersionProductPostcheck(input: VersionProductPostcheckInput & {
  held: LiveReviewHeldContext; deadlineAt: number;
  /** Trusted server policy; never forwarded from the HTTP body. */
  liveReviewPolicy?: "default" | "disabled";
  /** Snapshot read by this wrapper, never supplied by a browser. */
  expectedPreview?: ProductPostcheckTarget & { mutationRevision: number };
}): Promise<VersionProductPostcheckOutcome> {
  const startedAt = Date.now();
  const workDeadlineAt = input.deadlineAt - PERSIST_RELEASE_RESERVE_MS;
  let previewUrl = input.previewUrl?.trim() || "";
  let target: ProductPostcheckTarget | null = null;
  let mutationRevision = 0;
  let liveReviewSession: LiveReviewSession | null = null;
  let productResult: ProductPostcheckResult | null = null;
  if (!isLiveReviewHeldContext(input.held) || input.held.chatId !== input.chatId ||
      input.held.versionId !== input.versionId || !Number.isFinite(input.deadlineAt)) {
    return outcome(skipped("preview_superseded", previewUrl));
  }
  const current = async (deadline = workDeadlineAt): Promise<boolean> => {
    if (Date.now() >= deadline) return false;
    try {
      if (!(await renewVersionLease(input.versionId, input.held.holderRunId))) return false;
      const [version, session] = await Promise.all([getVersionById(input.versionId), getActivePreviewSessionAsync(input.chatId)]);
      if (Date.now() >= deadline || version?.chat_id !== input.chatId || version.files_revision?.trim() !== input.held.filesRevision) return false;
      if (!target) {
        if (!input.expectedPreview) return true;
        const latest = bindProductPostcheckTarget(session, input.versionId, input.held.filesRevision);
        return latest?.previewSessionId === input.expectedPreview.previewSessionId &&
          latest.lifecycleToken === input.expectedPreview.lifecycleToken &&
          normalizeProductPostcheckMutationRevision(session?.mutationRevision) === input.expectedPreview.mutationRevision;
      }
      const latest = bindProductPostcheckTarget(session, input.versionId, input.held.filesRevision);
      return latest?.previewSessionId === target.previewSessionId && latest.lifecycleToken === target.lifecycleToken &&
        normalizeProductPostcheckMutationRevision(session?.mutationRevision) === mutationRevision;
    } catch { return false; }
  };
  const discard = async () => {
    await deleteLiveReviewScreenshotUrls(productResult?.screenshots).catch(() => undefined);
    if (liveReviewSession?.claim?.kind === "acquired") {
      // Existing owner deletes only zero-attempt claims. Never refund paid work.
      await abandonLiveReviewRun(liveReviewSession.claim.row.id, liveReviewSession.claim.row.claimedAt).catch(() => undefined);
    }
    return outcome(skipped("preview_superseded", previewUrl, Date.now() - startedAt));
  };
  try {
    // Omläsning under the actual holder precedes both claims and all work.
    if (!(await current())) return await discard();
    const version = await getVersionById(input.versionId);
    if (!version || version.chat_id !== input.chatId || version.files_revision?.trim() !== input.held.filesRevision) return await discard();
    if (input.filesRevision && input.filesRevision !== input.held.filesRevision) return await discard();
    if (!FEATURES.f2ProductPostcheck) return await storedPolicySkip(input, input.held.filesRevision);
    let waitedProbe: ProductPostcheckPreviewProbe | null = null;
    const reviewAllowed = input.liveReviewPolicy !== "disabled";
    const reviewReserveMs = reviewAllowed && isLiveReviewEnabled() ? LIVE_REVIEW_TOTAL_TIMEOUT_MS : 0;
    if (getPreviewHostBaseUrl()) {
      const sessionHint = await getActivePreviewSessionAsync(input.chatId);
      const pin = bindProductPostcheckTarget(sessionHint, input.versionId, input.held.filesRevision);
      const previewWait = await waitForProductPostcheckPreviewRunning({
        expectedVersionId: input.versionId, expectedFilesRevision: input.held.filesRevision,
        ...(pin ? { expectedPreviewSessionId: pin.previewSessionId, expectedLifecycleToken: pin.lifecycleToken } : {}),
        timeoutMs: productPostcheckPreviewWaitBudgetMs({ liveReviewReserveMs: reviewReserveMs,
          routeBudgetMs: Math.max(0, workDeadlineAt - Date.now()) }),
        probe: async () => {
          if (!(await current())) throw new Error("versionslease or deadline lost");
          return readProductPostcheckPreviewProbe({ chatId: input.chatId, expectedVersionId: input.versionId, deadlineEpochMs: workDeadlineAt });
        },
      });
      if (!previewWait.ok) return outcome(skipped(previewWait.reason === "preview_superseded" ? "preview_superseded" : "preview_not_ready",
        previewWait.lastProbe?.previewUrl?.trim() || previewUrl || null, Date.now() - startedAt));
      waitedProbe = previewWait.probe;
    }
    const activeSession = await getActivePreviewSessionAsync(input.chatId);
    const session = waitedProbe ?? activeSession;
    target = bindProductPostcheckTarget(session, input.versionId, input.held.filesRevision);
    if (!target) return await discard();
    mutationRevision = normalizeProductPostcheckMutationRevision(session?.mutationRevision ?? activeSession?.mutationRevision);
    previewUrl = session?.previewUrl?.trim() || previewUrl;
    if (!(await current())) return await discard();
    const key = claimKey(input.versionId, target, mutationRevision);
    const claim = await claimProductPostcheckRun({ chatId: input.chatId, owner: input.userId, key });
    if (claim.kind === "unavailable") return unavailable("claim_unavailable");
    if (claim.kind === "busy" || claim.kind === "settled") return await replay(input.versionId, claim.runId, claim.status, previewUrl, target);
    const verificationRunId = claim.runId;
    const commit = async (result: ProductPostcheckResult): Promise<VersionProductPostcheckOutcome> => {
      if (!(await current(input.deadlineAt))) return await discard();
      result.verificationRunId = verificationRunId;
      const stored = await commitProductPostcheckResult({ held: input.held, key, claim, result, deadlineAt: input.deadlineAt });
      if (stored.status === "superseded") return await discard();
      if (stored.status !== "stored") return unavailable("claim_unavailable");
      result.storageReceipt = { status: "stored", versionId: input.versionId, filesRevision: input.held.filesRevision };
      if (result.skipped && result.attestation && !isNonFinalProductPostcheckSkipReason(result.skippedReason) && result.skippedReason !== "preview_not_ready") {
        emitPostcheckDegraded({ versionId: input.versionId, chatId: input.chatId,
          reason: result.skippedReason ?? "unknown", checkedUrl: result.checkedUrl ?? null,
          durationMs: result.durationMs, attestation: result.attestation ?? null, verificationRunId });
      } else if (result.productBlocked && result.attestation) {
        emitPostcheckBlocked({ versionId: input.versionId, chatId: input.chatId, warningCount: result.warningCount,
          blockingCodes: Array.from(new Set(result.warnings.map(w => w.code).filter(code =>
            ["mobile_menu_failed", "broken_anchor", "runtime_crash", "preview_boot_page", "hydration_dom_loss"].includes(code)))),
          checkedUrl: result.checkedUrl ?? null, durationMs: result.durationMs,
          attestation: result.attestation, verificationRunId });
      }
      return outcome(result);
    };
    if (!previewUrl) {
      const result = skipped("missing_preview_url", null);
      result.attestation = target;
      return await commit(result);
    }
    liveReviewSession = reviewAllowed ? await beginLiveReviewSession({ chatId: input.chatId, versionId: input.versionId,
      filesRevision: input.held.filesRevision, userId: input.userId, held: input.held, deadlineAt: workDeadlineAt }) : null;
    if (!(await current())) return await discard();
    // No minimum duration can manufacture time after an exhausted deadline.
    const timeoutMs = workDeadlineAt - Date.now() - reviewReserveMs;
    if (timeoutMs <= 0) {
      if (liveReviewSession?.claim?.kind === "acquired") {
        await abandonLiveReviewRun(liveReviewSession.claim.row.id, liveReviewSession.claim.row.claimedAt);
      }
      return await commit(skipped("preview_not_ready", previewUrl));
    }
    try {
      productResult = await runProductPostcheck({ previewUrl, chatId: input.chatId, versionId: input.versionId,
        verificationRunId, timeoutMs, captureEnabled: liveReviewSession?.captureEnabled ?? false,
        captureUserId: input.userId === "anonymous" ? undefined : input.userId,
        filesRevision: input.held.filesRevision, previewSessionId: target.previewSessionId,
        lifecycleToken: target.lifecycleToken, versionNumber: version.version_number,
        liveReviewAllowed: liveReviewSession?.allowed === true });
      if (!(await current())) return await discard();
      if (liveReviewSession) {
        const chat = await getChat(input.chatId);
        if (!chat || chat.id !== input.chatId) return await discard();
        const userRequest = resolveUserRequestForVersion({ messages: chat.messages,
          versionMessageId: version.message_id, versionCreatedAt: version.created_at, versionId: version.id });
        productResult.liveReview = await finishLiveReviewSession(liveReviewSession, {
          skipped: productResult.skipped, findings: productResult.warnings.map(w => ({ code: w.code, message: w.message })),
          screenshots: productResult.screenshots, domSummary: productResult.domSummary,
          versionNumber: version.version_number, filesJson: version.files_json,
          userRequest: userRequest.text, userRequestSource: userRequest.source,
          briefSummary: summarizeBrief(chat.orchestration_snapshot), isTargetCurrent: current,
        });
      }
    } catch (error) {
      if (!(await current())) return await discard();
      console.warn("[product-postcheck] execution failed:", error);
      if (liveReviewSession?.claim?.kind === "acquired") {
        await deleteLiveReviewScreenshotUrls(productResult?.screenshots).catch(() => undefined);
        await abandonLiveReviewRun(liveReviewSession.claim.row.id, liveReviewSession.claim.row.claimedAt).catch(() => undefined);
      }
      // A critic failure must not erase deterministic blockers already found.
      productResult ??= skipped("runtime_error", previewUrl, Date.now() - startedAt);
    }
    if (!(await current())) return await discard();
    if (isNonBlockingPreviewBootResult(productResult)) {
      await deleteLiveReviewScreenshotUrls(productResult.screenshots).catch(() => undefined);
      productResult = skipped("preview_not_ready", previewUrl, productResult.durationMs);
    } else {
      productResult.attestation = target;
    }
    return await commit(productResult);
  } catch (error) {
    console.warn("[product-postcheck] claim/persistence failed:", error);
    await deleteLiveReviewScreenshotUrls(productResult?.screenshots).catch(() => undefined);
    return unavailable("claim_unavailable");
  }
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
