type DeployErrorSource = "internal" | "upstream" | "unknown";

export function classifyDeployError(err: unknown): { source: DeployErrorSource; message: string } {
  const message = err instanceof Error ? err.message : String(err);
  const normalized = message.toLowerCase();

  if (
    normalized.includes("chat not found") ||
    normalized.includes("version not found") ||
    normalized.includes("validation failed") ||
    normalized.includes("no files returned from v0")
  ) {
    return { source: "internal", message };
  }

  if (
    normalized.includes("vercel") ||
    normalized.includes("v0") ||
    normalized.includes("rate limit") ||
    normalized.includes("timeout") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden")
  ) {
    return { source: "upstream", message };
  }

  return { source: "unknown", message };
}
