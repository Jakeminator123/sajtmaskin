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
/**
 * Redis `filesRevision` is written after the host patch. A present-but-different
 * pointer can still be the previous generation catching up — poll this grace
 * before treating it as `preview_superseded`. `files_revision` is md5(files_json)
 * and is not ordered; "older" uses `mutationRevision` when the caller pins it.
 */
export const PRODUCT_POSTCHECK_FILES_REVISION_GRACE_MS = 4_000;
export const PRODUCT_POSTCHECK_FILES_REVISION_GRACE_POLL_MS = 1_000;
export const PRODUCT_POSTCHECK_FILES_REVISION_GRACE_MAX_PROBES = 5;

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
  /** Override for tests. Production default is 4s. */
  filesRevisionGraceMs?: number;
  filesRevisionGracePollMs?: number;
  filesRevisionGraceMaxProbes?: number;
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
 * Identity drift that is never a Redis catch-up race. A missing probe field
 * is still pending. Present-but-different `filesRevision` is *not* here:
 * `files_revision` is an unordered md5, so a stale pointer waits a short
 * grace unless `mutationRevision` proves the session is older than expected.
 */
function isProductPostcheckPreviewTupleSuperseded(
  probe: ProductPostcheckPreviewProbe,
  expected: PreviewTupleExpectation,
): boolean {
  if (probe.versionId && probe.versionId !== expected.versionId) return true;
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

function isFilesRevisionOlderThanExpected(
  probe: ProductPostcheckPreviewProbe,
  expected: PreviewTupleExpectation,
): boolean {
  return (
    expected.hasMutationExpectation &&
    expected.mutationRevision != null &&
    probe.mutationRevision != null &&
    probe.mutationRevision < expected.mutationRevision
  );
}

function isFilesRevisionCatchUpCandidate(
  probe: ProductPostcheckPreviewProbe,
  expected: PreviewTupleExpectation,
): boolean {
  if (!probe.filesRevision || probe.filesRevision === expected.filesRevision) {
    return false;
  }
  if (probe.versionId && probe.versionId !== expected.versionId) return false;
  if (isFilesRevisionOlderThanExpected(probe, expected)) return false;
  return true;
}

/**
 * Full readiness tuple. `running` alone is the stale-HTML hole: a hot patch
 * writes files, flips `readinessState` to `starting`, and re-probes
 * asynchronously while the previous boot still serves.
 */
/**
 * L7 exact preview identity. `running` alone is not ready — the host must
 * also be `readinessState=ready`, `httpReady=true`, same version/filesRevision,
 * and a real session. Session/lifecycle/mutation are matched only when the
 * caller supplies them.
 */
export function matchesExactPreviewReadinessTuple(
  probe: ProductPostcheckPreviewProbe,
  expected: {
    versionId: string;
    filesRevision: string;
    previewSessionId?: string | null;
    lifecycleToken?: string | null;
    mutationRevision?: number | null;
  },
): boolean {
  return isProductPostcheckPreviewTupleReady(probe, {
    versionId: expected.versionId.trim(),
    filesRevision: expected.filesRevision.trim(),
    previewSessionId: normalizeToken(expected.previewSessionId),
    hasSessionExpectation: Object.prototype.hasOwnProperty.call(
      expected,
      "previewSessionId",
    ),
    lifecycleToken: normalizeToken(expected.lifecycleToken),
    hasLifecycleExpectation: Object.prototype.hasOwnProperty.call(
      expected,
      "lifecycleToken",
    ),
    mutationRevision: parseExpectedMutationRevision(expected.mutationRevision),
    hasMutationExpectation: Object.prototype.hasOwnProperty.call(
      expected,
      "mutationRevision",
    ),
  });
}

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
 * (retryable, never an attestation). A different version / session /
 * lifecycle / mutation, an *older* mutation receipt, or a filesRevision
 * pointer that stays wrong after a short Redis-catch-up grace →
 * `preview_superseded`.
 */
export async function waitForProductPostcheckPreviewRunning(
  params: WaitForProductPostcheckPreviewRunningParams,
): Promise<ProductPostcheckPreviewWaitResult> {
  const timeoutMs = params.timeoutMs ?? PRODUCT_POSTCHECK_PREVIEW_WAIT_MS;
  const pollIntervalMs =
    params.pollIntervalMs ?? PRODUCT_POSTCHECK_PREVIEW_POLL_INTERVAL_MS;
  const filesRevisionGraceMs =
    params.filesRevisionGraceMs ?? PRODUCT_POSTCHECK_FILES_REVISION_GRACE_MS;
  const filesRevisionGracePollMs =
    params.filesRevisionGracePollMs ?? PRODUCT_POSTCHECK_FILES_REVISION_GRACE_POLL_MS;
  const filesRevisionGraceMaxProbes =
    params.filesRevisionGraceMaxProbes ?? PRODUCT_POSTCHECK_FILES_REVISION_GRACE_MAX_PROBES;
  const now = params.now ?? Date.now;
  const sleep = params.sleep ?? defaultSleep;
  const expected = readTupleExpectation(params);
  const deadlineAt = now() + Math.max(0, timeoutMs);

  let lastProbe: ProductPostcheckPreviewProbe | null = null;
  let filesRevisionGraceDeadlineMs: number | null = null;
  let filesRevisionMismatchProbes = 0;
  while (true) {
    const probe = await params.probe();
    lastProbe = probe;

    if (isProductPostcheckPreviewTupleSuperseded(probe, expected)) {
      return { ok: false, reason: "preview_superseded", lastProbe: probe };
    }
    if (isFilesRevisionCatchUpCandidate(probe, expected)) {
      if (filesRevisionGraceDeadlineMs == null) {
        filesRevisionGraceDeadlineMs = now() + Math.max(0, filesRevisionGraceMs);
      }
      filesRevisionMismatchProbes += 1;
      const graceElapsed =
        now() >= filesRevisionGraceDeadlineMs ||
        filesRevisionMismatchProbes >= filesRevisionGraceMaxProbes;
      if (graceElapsed) {
        return { ok: false, reason: "preview_superseded", lastProbe: probe };
      }
    } else {
      filesRevisionGraceDeadlineMs = null;
      filesRevisionMismatchProbes = 0;
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
    const intervalMs = isFilesRevisionCatchUpCandidate(probe, expected)
      ? Math.min(filesRevisionGracePollMs, pollIntervalMs)
      : pollIntervalMs;
    const graceRemainingMs =
      filesRevisionGraceDeadlineMs != null
        ? filesRevisionGraceDeadlineMs - now()
        : remainingMs;
    await sleep(Math.min(intervalMs, remainingMs, Math.max(0, graceRemainingMs)));
  }

  if (lastProbe && isProductPostcheckPreviewTupleSuperseded(lastProbe, expected)) {
    return { ok: false, reason: "preview_superseded", lastProbe };
  }
  if (lastProbe && isFilesRevisionCatchUpCandidate(lastProbe, expected)) {
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
