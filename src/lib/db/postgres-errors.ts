/** PostgreSQL errors may be nested in DrizzleQueryError.cause. */
export function hasPostgresErrorCode(error: unknown, code: string): boolean {
  const seen = new Set<object>();
  while (error !== null && typeof error === "object" && !seen.has(error)) {
    seen.add(error);
    if ("code" in error && error.code === code) return true;
    error = "cause" in error ? error.cause : undefined;
  }
  return false;
}
