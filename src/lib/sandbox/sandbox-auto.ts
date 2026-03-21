const AFFIRMATIVE_VALUES = new Set(["yes", "y", "true", "1", "on"]);

function parseSandboxAutoValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && AFFIRMATIVE_VALUES.has(normalized);
}

/**
 * Client-side gate for deferred sandbox runtime startup.
 *
 * `NEXT_PUBLIC_SANDBOX_AUTO` remains the canonical browser env. We also accept
 * server-sent booleans from API responses so the runtime can be controlled by
 * `SANDBOX_AUTO` without requiring the public mirror in every environment.
 */
export function isSandboxAutoEnabled(): boolean {
  return (
    parseSandboxAutoValue(process.env.NEXT_PUBLIC_SANDBOX_AUTO) ||
    parseSandboxAutoValue(process.env.SANDBOX_AUTO)
  );
}

export function resolveSandboxAutoEnabled(...values: unknown[]): boolean {
  return values.some((value) => parseSandboxAutoValue(value));
}
