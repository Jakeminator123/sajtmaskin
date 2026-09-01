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

export type ProductPostcheckPreviewWaitReason =
  | "preview_not_running"
  | "preview_superseded";

export type ProductPostcheckPreviewProbe = {
  running: boolean;
  versionId: string | null;
  filesRevision: string | null;
  previewSessionId: string | null;
  lifecycleToken: string | null;
  previewUrl: string | null;
  readinessState: "starting" | "ready" | "failed" | null;
  /** Host traffic gate. `null` when an older host omitted the field. */
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
  expectedFilesRevision: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  probe: () => Promise<ProductPostcheckPreviewProbe>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isHostRuntimeReady(probe: ProductPostcheckPreviewProbe): boolean {
  // Mirror product-postcheck `isHostRuntimeReady`. `httpReady` is the host
  // traffic gate (`publicRunning && ready`). An explicit `false` means the
  // runtime is not accepting traffic — never override that with
  // `readinessState === "ready"` (false-green after a hot patch: previous
  // boot still serves while the async probe is in flight).
  if (probe.httpReady === false) return false;
  if (probe.httpReady === true) return true;
  // Host omitted `httpReady` (older deploy). Fall back to the fields it did send.
  if (probe.readinessState === "ready") return true;
  // Older hosts omitted both signals. `null` readinessState = legacy host →
  // callers fall back to treating `running` as ready
  // (preview-host-client.ts: `null` readinessState = legacy host). Current
  // hosts always emit readinessState after a hot patch (`starting` until the
  // async probe finishes), so this path is not the stale-HTML hole.
  return probe.readinessState === null && probe.running;
}

function isExpectedVersionRunning(
  probe: ProductPostcheckPreviewProbe,
  expectedVersionId: string,
  expectedFilesRevision: string,
): boolean {
  // A missing probe revision is not a match. Treating it as OK let the wait
  // succeed and the later bind classify the same snapshot as preview_superseded.
  const revisionOk =
    Boolean(expectedFilesRevision) && probe.filesRevision === expectedFilesRevision;
  return (
    probe.running &&
    probe.versionId === expectedVersionId &&
    revisionOk &&
    isHostRuntimeReady(probe)
  );
}

function isSupersededByOtherVersion(
  probe: ProductPostcheckPreviewProbe,
  expectedVersionId: string,
): boolean {
  return Boolean(probe.versionId && probe.versionId !== expectedVersionId);
}

/**
 * Poll read-only preview status until the host is running *and* runtime-ready
 * for this versionId (and filesRevision when the session has one), or the
 * budget ends. `running` alone is not enough: a hot patch leaves the previous
 * boot serving while readiness is `starting`.
 *
 * A session already bound to another version is treated as superseded
 * immediately — waiting would only delay the current version's skip.
 */
export async function waitForProductPostcheckPreviewRunning(
  params: WaitForProductPostcheckPreviewRunningParams,
): Promise<ProductPostcheckPreviewWaitResult> {
  const timeoutMs = params.timeoutMs ?? PRODUCT_POSTCHECK_PREVIEW_WAIT_MS;
  const pollIntervalMs =
    params.pollIntervalMs ?? PRODUCT_POSTCHECK_PREVIEW_POLL_INTERVAL_MS;
  const now = params.now ?? Date.now;
  const sleep = params.sleep ?? defaultSleep;
  const expectedVersionId = params.expectedVersionId.trim();
  const expectedFilesRevision = params.expectedFilesRevision.trim();
  const deadlineAt = now() + Math.max(0, timeoutMs);

  let lastProbe: ProductPostcheckPreviewProbe | null = null;
  while (true) {
    const probe = await params.probe();
    lastProbe = probe;

    if (isSupersededByOtherVersion(probe, expectedVersionId)) {
      return { ok: false, reason: "preview_superseded", lastProbe: probe };
    }
    if (probe.readinessState === "failed") {
      return { ok: false, reason: "preview_not_running", lastProbe: probe };
    }
    if (isExpectedVersionRunning(probe, expectedVersionId, expectedFilesRevision)) {
      return { ok: true, probe };
    }

    const remainingMs = deadlineAt - now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }

  if (lastProbe && isSupersededByOtherVersion(lastProbe, expectedVersionId)) {
    return { ok: false, reason: "preview_superseded", lastProbe };
  }
  return { ok: false, reason: "preview_not_running", lastProbe };
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
    }
  }

  return {
    running,
    versionId,
    filesRevision: session.filesRevision?.trim() || null,
    previewSessionId,
    lifecycleToken: session.lifecycleToken?.trim() || null,
    previewUrl: session.previewUrl?.trim() || null,
    readinessState,
    httpReady,
  };
}
