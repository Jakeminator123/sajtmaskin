import type { CodeFile } from "./parser";

/** Atomic stored-file shape guard: one malformed entry invalidates the snapshot. */
export function isStoredCodeFileArray(value: unknown): CodeFile[] | null {
  if (!Array.isArray(value)) return null;
  if (
    value.some(
      (entry) =>
        !entry ||
        typeof entry !== "object" ||
        Array.isArray(entry) ||
        (Object.getPrototypeOf(entry) !== Object.prototype &&
          Object.getPrototypeOf(entry) !== null) ||
        typeof (entry as Record<string, unknown>).path !== "string" ||
        typeof (entry as Record<string, unknown>).content !== "string" ||
        ("language" in (entry as Record<string, unknown>) &&
          typeof (entry as Record<string, unknown>).language !== "string"),
    )
  ) {
    return null;
  }
  return value as CodeFile[];
}

export function parseStoredCodeFilesJson(value: string): CodeFile[] | null {
  try {
    return isStoredCodeFileArray(JSON.parse(value));
  } catch {
    return null;
  }
}
