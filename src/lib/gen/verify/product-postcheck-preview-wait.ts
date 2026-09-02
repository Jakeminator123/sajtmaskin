import { fetchPreviewHostReadinessVerdict } from "@/lib/gen/preview/preview-host-client";
import { getActivePreviewSessionAsync } from "@/lib/gen/preview/session-store";

/** Bounded wait for a slow Fly VM rebuild before Product Postcheck captures. */
export const PRODUCT_POSTCHECK_PREVIEW_WAIT_MS = 150_000;
/** Leave 20s slack under the route `maxDuration` of 300s. */
export const PRODUCT_POSTCHECK_ROUTE_BUDGET_MS = 280_000;
/** Floor reserved for Playwright crawl + two JPEGs after the wait. */
export const PRODUCT_POSTCHECK_CAPTURE_RESERVE_MS = 45_000;
/** Sparse enough that a 2–3 min budget does not hammer `/status`. */
export const PRODUCT_POSTCHECK_PREVIEW_POLL_INTERVAL_MS = 8_000;

export function productPostcheckPreviewWaitBudgetMs(params: {
  liveReviewReserveMs?: number;
  routeBudgetMs?: number;
  captureReserveMs?: number;
}): number {
  const route = params.routeBudgetMs ?? PRODUCT_POSTCHECK_ROUTE_BUDGET_MS;
  const review = Math.max(0, params.liveReviewReserveMs ?? 0);
  const capture = params.captureReserveMs ?? PRODUCT_POSTCHECK_CAPTURE_RESERVE_MS;
  return Math.max(
    0,
    Math.min(PRODUCT_POSTCHECK_PREVIEW_WAIT_MS, route - review - capture),
  );
}

/**
 * Wait outcomes that must never become a block-free `preview_not_running`
 * attestation. `preview_not_ready` is retryable pending (no attestation).
 * Identity drift is `preview_superseded` (also unattested).
 */
export type ProductPostcheckPreviewWaitReason =
  | "preview_not_ready"
  | "preview_superseded";

export type ProductPostcheckPreviewProbe = {
  running: boolean;
  versionId: string | null;
  filesRevision: string | null;
  previewSessionId: string | null;
  lifecycleToken: string | null;
  /** Host/session mutation receipt. Null on older hosts or untouched sessions. */
  mutationRevision: number | null;
  previewUrl: string | null;
  readinessState: "starting" | "ready" | "failed" | null;
  /** Host traffic gate. `null` when the host omitted the field. */
  httpReady: boolean | null;
};

export type ProductPostcheckPreviewWaitResult =
  | { ok: true; probe: ProductPostcheckPreviewProbe }
  | {
      ok: false;
      reason: ProductPostcheckPreviewWaitReason;
      lastProbe: ProductPostcheckPreviewProbe | null;
    };

export type WaitForProductPostcheckPreviewRunningParams = {
  expectedVersionId: string;
  /** Exact `files_revision` L3 confirms persisted and sends to this wait. */
  expectedFilesRevision: string;
  expectedPreviewSessionId?: string | null;
  expectedLifecycleToken?: string | null;
  /**
   * Forward-compatible with L3. Required only when the caller supplies a
   * positive integer — a present-but-different probe receipt is superseded.
   */
  expectedMutationRevision?: number | null;
  timeoutMs?: number;
  pollIntervalMs?: number;
  probe: () => Promise<ProductPostcheckPreviewProbe>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

type PreviewTupleExpectation = {
  versionId: string;
  filesRevision: string;
  previewSessionId: string | null;
  hasSessionExpectation: boolean;
  lifecycleToken: string | null;
  hasLifecycleExpectation: boolean;
  mutationRevision: number | null;
  hasMutationExpectation: boolean;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeToken(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseExpectedMutationRevision(raw: number | null | undefined): number | null {
  return typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0 ? raw : null;
}

function readTupleExpectation(
  params: WaitForProductPostcheckPreviewRunningParams,
): PreviewTupleExpectation {
  const hasSessionExpectation = Object.prototype.hasOwnProperty.call(
    params,
    "expectedPreviewSessionId",
  );
  const hasLifecycleExpectation = Object.prototype.hasOwnProperty.call(
    params,
    "expectedLifecycleToken",
  );
  const hasMutationExpectation = Object.prototype.hasOwnProperty.call(
    params,
    "expectedMutationRevision",
  );
  return {
    versionId: params.expectedVersionId.trim(),
    filesRevision: params.expectedFilesRevision.trim(),
    previewSessionId: normalizeToken(params.expectedPreviewSessionId),
    hasSessionExpectation,
    lifecycleToken: normalizeToken(params.expectedLifecycleToken),
    hasLifecycleExpectation,
    mutationRevision: parseExpectedMutationRevision(params.expectedMutationRevision),
    hasMutationExpectation,
  };
}

/**
 * Identity drift on any supplied tuple component. A missing probe field is
 * not drift — it is still pending. A *different* known value is superseded.
 */
function isProductPostcheckPreviewTupleSuperseded(
  probe: ProductPostcheckPreviewProbe,
  expected: PreviewTupleExpectation,
): boolean {
  if (probe.versionId && probe.versionId !== expected.versionId) return true;
  if (probe.filesRevision && probe.filesRevision !== expected.filesRevision) {
    return true;
  }
  if (
    expected.hasSessionExpectation &&
    expected.previewSessionId &&
    probe.previewSessionId &&
    probe.previewSessionId !== expected.previewSessionId
  ) {
    return true;
  }
  if (expected.hasLifecycleExpectation && probe.lifecycleToken !== null) {
    if (probe.lifecycleToken !== expected.lifecycleToken) return true;
  }
  if (
    expected.hasMutationExpectation &&
    expected.mutationRevision != null &&
    probe.mutationRevision != null &&
    probe.mutationRevision !== expected.mutationRevision
  ) {
    return true;
  }
  return false;
}

/**
 * Full readiness tuple. `running` alone is the stale-HTML hole: a hot patch
 * writes files, flips `readinessState` to `starting`, and re-probes
 * asynchronously while the previous boot still serves.
 */
function isProductPostcheckPreviewTupleReady(
  probe: ProductPostcheckPreviewProbe,
  expected: PreviewTupleExpectation,
): boolean {
  if (probe.running !== true) return false;
  if (probe.readinessState !== "ready") return false;
  if (probe.httpReady !== true) return false;
  if (probe.versionId !== expected.versionId) return false;
  if (!expected.filesRevision || probe.filesRevision !== expected.filesRevision) {
    return false;
  }
  if (!probe.previewSessionId) return false;
  if (
    expected.hasSessionExpectation &&
    expected.previewSessionId &&
    probe.previewSessionId !== expected.previewSessionId
  ) {
    return false;
  }
  if (expected.hasLifecycleExpectation) {
    if (probe.lifecycleToken !== expected.lifecycleToken) return false;
  }
  if (expected.hasMutationExpectation && expected.mutationRevision != null) {
    if (probe.mutationRevision !== expected.mutationRevision) return false;
  }
  return true;
}

/**
 * Poll read-only preview status until the host matches the full readiness
 * tuple for this version + filesRevision, or the budget ends.
 *
 * `starting`, `httpReady: false`, or timeout → `preview_not_ready`
 * (retryable, never an attestation). A different version / filesRevision /
 * session / lifecycle / mutation → `preview_superseded`.
 */
export async function waitForProductPostcheckPreviewRunning(
  params: WaitForProductPostcheckPreviewRunningParams,
): Promise<ProductPostcheckPreviewWaitResult> {
  const timeoutMs = params.timeoutMs ?? PRODUCT_POSTCHECK_PREVIEW_WAIT_MS;
  const pollIntervalMs =
    params.pollIntervalMs ?? PRODUCT_POSTCHECK_PREVIEW_POLL_INTERVAL_MS;
  const now = params.now ?? Date.now;
  const sleep = params.sleep ?? defaultSleep;
  const expected = readTupleExpectation(params);
  const deadlineAt = now() + Math.max(0, timeoutMs);

  let lastProbe: ProductPostcheckPreviewProbe | null = null;
  while (true) {
    const probe = await params.probe();
    lastProbe = probe;

    if (isProductPostcheckPreviewTupleSuperseded(probe, expected)) {
      return { ok: false, reason: "preview_superseded", lastProbe: probe };
    }
    if (probe.readinessState === "failed") {
      // Host gave up on this boot. Still pending — never a
      // `preview_not_running` attestation that releases the quality gate.
      return { ok: false, reason: "preview_not_ready", lastProbe: probe };
    }
    if (isProductPostcheckPreviewTupleReady(probe, expected)) {
      return { ok: true, probe };
    }

    const remainingMs = deadlineAt - now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }

  if (lastProbe && isProductPostcheckPreviewTupleSuperseded(lastProbe, expected)) {
    return { ok: false, reason: "preview_superseded", lastProbe };
  }
  return { ok: false, reason: "preview_not_ready", lastProbe };
}

/**
 * Read-only snapshot of the active preview session + host `/status`.
 * Does not resume or boot a VM.
 */
export async function readProductPostcheckPreviewProbe(params: {
  chatId: string;
  expectedVersionId: string;
}): Promise<ProductPostcheckPreviewProbe> {
  const session = await getActivePreviewSessionAsync(params.chatId);
  if (!session) {
    return {
      running: false,
      versionId: null,
      filesRevision: null,
      previewSessionId: null,
      lifecycleToken: null,
      mutationRevision: null,
      previewUrl: null,
      readinessState: null,
      httpReady: null,
    };
  }

  const sessionVersionId = session.versionId?.trim() || null;
  const previewSessionId = session.previewSessionId?.trim() || null;
  let running = false;
  let readinessState: ProductPostcheckPreviewProbe["readinessState"] = null;
  let httpReady: boolean | null = null;
  let versionId = sessionVersionId;
  let lifecycleToken = session.lifecycleToken?.trim() || null;
  let mutationRevision = session.mutationRevision ?? null;

  if (previewSessionId && sessionVersionId === params.expectedVersionId) {
    const verdict = await fetchPreviewHostReadinessVerdict(previewSessionId, {
      expectedVersionId: params.expectedVersionId,
      expectedLifecycleToken: session.lifecycleToken?.trim() || null,
    });
    if (verdict) {
      readinessState = verdict.readinessState;
      httpReady = verdict.httpReady;
      versionId = verdict.versionId?.trim() || sessionVersionId;
      running =
        verdict.running === true && versionId === params.expectedVersionId;
      if (verdict.lifecycleToken !== undefined) {
        lifecycleToken = verdict.lifecycleToken?.trim() || null;
      }
      if (verdict.mutationRevision != null) {
        mutationRevision = verdict.mutationRevision;
      }
    }
  }

  return {
    running,
    versionId,
    filesRevision: session.filesRevision?.trim() || null,
    previewSessionId,
    lifecycleToken,
    mutationRevision,
    previewUrl: session.previewUrl?.trim() || null,
    readinessState,
    httpReady,
  };
}
