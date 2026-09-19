export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const message = error instanceof Error ? error.message : String(error);
  const isDup = code === "23505" || message.includes("duplicate key value");
  if (!isDup) return false;
  if (!constraint) return true;
  return message.includes(constraint);
}
