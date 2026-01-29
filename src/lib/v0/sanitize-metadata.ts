const NULL_BYTE = /\u0000/g;

function sanitizeString(value: string): string {
  return value.replace(NULL_BYTE, "");
}

function sanitizeFileEntry(value: unknown, depth: number): unknown {
  if (!value || typeof value !== "object") return value;
  if (depth > 6) return "[truncated]";

  const entry = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(entry)) {
    if (key === "content") continue;
    sanitized[key] = sanitizeV0Metadata(val, depth + 1);
  }
  return sanitized;
}

export function sanitizeV0Metadata(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (typeof value === "string") return sanitizeString(value);
  if (!value || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeV0Metadata(entry, depth + 1));
  }

  const obj = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key === "files" && Array.isArray(val)) {
      sanitized[key] = val.map((entry) => sanitizeFileEntry(entry, depth + 1));
      continue;
    }
    sanitized[key] = sanitizeV0Metadata(val, depth + 1);
  }
  return sanitized;
}
