/**
 * Shared abort budget for wizard competitor/enrich routes (SM-033).
 *
 * Vercel hard-kills the isolate at `maxDuration`, which previously dropped
 * the request with a 504 and no terminal telemetry. Abort a little earlier
 * so the route can emit a content-free terminal event.
 *
 * Do not raise the exported route `maxDuration` literals without p95/p99
 * from those events.
 */

export const WIZARD_COMPETITORS_MAX_DURATION_S = 25;
export const WIZARD_ENRICH_MAX_DURATION_S = 30;
export const WIZARD_ROUTE_ABORT_HEADROOM_MS = 2_000;

export type WizardRouteDeadline = {
  signal: AbortSignal;
  startedAt: number;
  budgetMs: number;
  abortAtMs: number;
  remainingMs: () => number;
  dispose: () => void;
};

export function isWizardAbortError(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (!err || typeof err !== "object") return false;
  const name = "name" in err && typeof err.name === "string" ? err.name : "";
  const message = "message" in err && typeof err.message === "string" ? err.message : "";
  if (name === "AbortError" || name === "TimeoutError") return true;
  if (err instanceof DOMException && err.name === "AbortError") return true;
  return /aborted|aborterror|bodystreambuffer was aborted/i.test(`${name} ${message}`);
}

export function createWizardRouteDeadline(
  maxDurationSeconds: number,
  options?: {
    abortHeadroomMs?: number;
    signal?: AbortSignal;
  },
): WizardRouteDeadline {
  const startedAt = Date.now();
  const headroomMs = options?.abortHeadroomMs ?? WIZARD_ROUTE_ABORT_HEADROOM_MS;
  const budgetMs = Math.max(0, Math.floor(maxDurationSeconds * 1000));
  const abortAtMs = Math.max(0, budgetMs - Math.max(0, headroomMs));
  const controller = new AbortController();

  const abort = () => {
    if (!controller.signal.aborted) controller.abort();
  };

  const parent = options?.signal;
  if (parent?.aborted) abort();
  else parent?.addEventListener("abort", abort, { once: true });

  const remainingMs = () => Math.max(0, abortAtMs - (Date.now() - startedAt));

  let timer: ReturnType<typeof setTimeout> | undefined;
  if (!controller.signal.aborted) {
    timer = setTimeout(abort, remainingMs());
    timer.unref?.();
  }

  return {
    signal: controller.signal,
    startedAt,
    budgetMs,
    abortAtMs,
    remainingMs,
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
      parent?.removeEventListener("abort", abort);
    },
  };
}

export async function raceWizardDeadline<T>(
  signal: AbortSignal,
  work: () => Promise<T>,
): Promise<T> {
  if (signal.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    work().then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}
