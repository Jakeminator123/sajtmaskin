/**
 * Minimal debug helper.
 * Uses only process.env.DEBUG (truthy: 1/true/yes/y/on).
 * Safe in both client and server bundles.
 */

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

export function isDebugEnabled(): boolean {
  return isTruthy(process.env.DEBUG);
}

export function debugLog(message: string, meta?: unknown): void {
  if (!isDebugEnabled()) return;
  if (meta !== undefined) {
    console.log(message, meta);
  } else {
    console.log(message);
  }
}
