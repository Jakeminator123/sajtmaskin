/**
 * Client-side retry policy for POST `/api/engine/chats/.../preview-session` bootstrap
 * (v0 route is compat).
 * Must match docs/architecture/preview-deploy.md and server `retryable` semantics.
 */

/** Default delay before bootstrap retries (matches `parseRetryAfterMs` fallback). */
export const PREVIEW_BOOTSTRAP_RETRY_FALLBACK_MS = 6_000;

const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 120_000;

/**
 * Parse `Retry-After` (seconds) from response headers; clamp and convert to ms.
 */
export function parseRetryAfterMs(
  headers: Headers,
  fallbackMs = PREVIEW_BOOTSTRAP_RETRY_FALLBACK_MS,
): number {
  const raw = headers.get("Retry-After")?.trim();
  if (!raw) return fallbackMs;
  const sec = Number.parseInt(raw, 10);
  if (!Number.isFinite(sec) || sec < 0) return fallbackMs;
  const ms = sec * 1000;
  return Math.min(Math.max(ms, MIN_RETRY_MS), MAX_RETRY_MS);
}

export type PreviewBootstrapRetryInput = {
  httpStatus: number;
  /** From JSON body; `false` means never auto-retry this failure. */
  retryable?: boolean;
};

/**
 * Whether bootstrap should schedule another attempt (backoff), not mark the version key "done".
 * - `retryable === false` → no retry (permanent client / validation errors).
 * - `408`, `429`, or **5xx** where bare **500** requires `retryable === true` (matches server catch).
 */
export function shouldRetryPreviewBootstrapFetch(input: PreviewBootstrapRetryInput): boolean {
  const { httpStatus: status, retryable } = input;
  if (retryable === false) return false;

  const transient5xx =
    status >= 500 && status < 600 && (status !== 500 || retryable === true);

  return status === 429 || status === 408 || transient5xx;
}
