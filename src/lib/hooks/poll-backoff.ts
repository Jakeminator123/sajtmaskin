/**
 * Shared client-side polling resilience for the builder's read endpoints
 * (`/version-status`, `/readiness`, `/versions`, `/dossiers`).
 *
 * A2 of the builder runtime-robustness plan: the 2026-07-13 prod incident was
 * self-amplifying. A redeploy exhausted the per-instance pg pool, the reads
 * started failing, and the clients kept polling at their normal 4 s / 10–30 s
 * cadence — adding load to the exact resource that was already starved. These
 * helpers make a failing poll back off exponentially (with jitter, so N open
 * builders don't retry in lockstep) and honour the server's `Retry-After`.
 *
 * Pure functions + a plain fetcher: no React, so both the hand-rolled
 * `useVersionStatus` loop and the SWR hooks can share them.
 */

import { parseRetryAfterMs } from "@/lib/builder/preview-bootstrap-retry";

/** Ceiling for a backed-off poll delay, before jitter. */
export const POLL_BACKOFF_MAX_MS = 60_000;

/** Jitter added on top of the delay, as a share of it (0.25 = up to +25%). */
export const POLL_BACKOFF_JITTER_RATIO = 0.25;

/** Highest doubling applied, so a long outage can't overflow the multiplier. */
const MAX_BACKOFF_EXPONENT = 10;

/**
 * Delay before the next poll: `baseMs` while healthy, then doubling per
 * consecutive failure up to {@link POLL_BACKOFF_MAX_MS}, plus upward jitter.
 *
 * @param consecutiveErrors 0 = last poll succeeded (no backoff, no jitter).
 */
export function pollBackoffDelayMs(
  baseMs: number,
  consecutiveErrors: number,
  options: { maxMs?: number; jitterRatio?: number; random?: () => number } = {},
): number {
  const {
    maxMs = POLL_BACKOFF_MAX_MS,
    jitterRatio = POLL_BACKOFF_JITTER_RATIO,
    random = Math.random,
  } = options;

  if (consecutiveErrors <= 0) return baseMs;

  const exponent = Math.min(consecutiveErrors - 1, MAX_BACKOFF_EXPONENT);
  const backedOff = Math.min(baseMs * 2 ** exponent, maxMs);
  // Jitter is added (never subtracted) so backoff is monotone in expectation.
  return Math.round(backedOff + backedOff * jitterRatio * random());
}

/**
 * A failed poll response. Carries the status and any `Retry-After` so the
 * caller can wait at least as long as the server asked — which is what makes
 * the 503 from `transientDbResponseIfRetryable` more than a cosmetic status
 * code change.
 */
export class PollFetchError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(message: string, status: number, retryAfterMs: number | null) {
    super(message);
    this.name = "PollFetchError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Read `Retry-After` when the server asked us to wait, otherwise `null` (the
 * caller then uses its own backoff). Only 429/503 carry a meaningful hint.
 */
export function pollRetryAfterMs(response: {
  status: number;
  headers: Headers;
}): number | null {
  if (response.status !== 503 && response.status !== 429) return null;
  if (!response.headers.get("Retry-After")) return null;
  return parseRetryAfterMs(response.headers);
}

/**
 * SWR fetcher for the polled read routes. Same contract as the inline fetchers
 * it replaces (throw on non-2xx, message from `error`/`message`), but the thrown
 * error is a {@link PollFetchError} so the hook can back off deliberately.
 */
export async function pollJsonFetcher(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as
      | { error?: string; message?: string }
      | null;
    const message = body?.error || body?.message || `HTTP ${res.status}`;
    throw new PollFetchError(message, res.status, pollRetryAfterMs(res));
  }
  return res.json();
}

/**
 * Poll cadence for an SWR hook: the caller's healthy interval, stretched by
 * backoff while the endpoint is failing. `0` (polling off) stays off.
 *
 * Note that SWR's interval poller **skips** revalidation entirely while the
 * cache holds an error and hands recovery to its error-retry lane, so this
 * mainly governs the healthy cadence. The actual retry pacing after a failure
 * lives in {@link createPollErrorRetry}.
 */
export function swrRefreshIntervalMs(
  baseMs: number,
  consecutiveErrors: number,
  lastError: unknown,
): number {
  if (baseMs <= 0) return 0;
  if (consecutiveErrors <= 0) return baseMs;
  const backedOff = pollBackoffDelayMs(baseMs, consecutiveErrors);
  const retryAfterMs =
    lastError instanceof PollFetchError ? (lastError.retryAfterMs ?? 0) : 0;
  return Math.max(backedOff, retryAfterMs);
}

/**
 * Where an error-retry starts before doubling. Deliberately shorter than the
 * healthy idle cadence (15–60 s): a transient blip should recover quickly, it
 * just must not recover *at full polling speed*.
 */
export const POLL_ERROR_RETRY_BASE_MS = 5_000;

/** Delay before SWR's next error-retry: backoff, but never below `Retry-After`. */
export function pollErrorRetryDelayMs(
  baseMs: number,
  retryCount: number,
  error: unknown,
): number {
  const base = Math.min(baseMs > 0 ? baseMs : POLL_ERROR_RETRY_BASE_MS, POLL_ERROR_RETRY_BASE_MS);
  const backedOff = pollBackoffDelayMs(base, Math.max(retryCount, 1));
  const retryAfterMs = error instanceof PollFetchError ? (error.retryAfterMs ?? 0) : 0;
  return Math.max(backedOff, retryAfterMs);
}

/**
 * Replacement for SWR's default `onErrorRetry`.
 *
 * SWR's own retry lane ignores `Retry-After`, so a degraded 503 from
 * `transientDbResponseIfRetryable` would be retried on SWR's schedule (2.5–7.5 s
 * for the first attempt) instead of the 3 s the server asked for — and, more to
 * the point, the pacing would live in a different place than the rest of A2.
 * The `errorRetryCount` guard mirrors SWR's default so an explicit cap still
 * works; unset (our case) means keep retrying, as before.
 */
export function createPollErrorRetry(baseMs: number) {
  return (
    error: unknown,
    _key: string,
    config: { errorRetryCount?: number },
    revalidate: (opts: { retryCount: number }) => void,
    opts: { retryCount: number },
  ): void => {
    const maxRetryCount = config.errorRetryCount;
    if (maxRetryCount !== undefined && opts.retryCount > maxRetryCount) return;
    setTimeout(() => revalidate(opts), pollErrorRetryDelayMs(baseMs, opts.retryCount, error));
  };
}
