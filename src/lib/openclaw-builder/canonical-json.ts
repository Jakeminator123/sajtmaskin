import { createHash } from "node:crypto";

type CanonicalJson = null | boolean | number | string | CanonicalJson[] | { [key: string]: CanonicalJson };

function canonicalize(value: unknown, seen: Set<object>): CanonicalJson {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON only accepts finite numbers");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry, seen));
  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    if (seen.has(objectValue)) throw new TypeError("Canonical JSON cannot contain cycles");
    seen.add(objectValue);
    const result: Record<string, CanonicalJson> = {};
    for (const key of Object.keys(objectValue).sort()) {
      const entry = objectValue[key];
      if (entry !== undefined) result[key] = canonicalize(entry, seen);
    }
    seen.delete(objectValue);
    return result;
  }
  throw new TypeError(`Canonical JSON does not support ${typeof value}`);
}

export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value, new Set()));
}

export function hashCanonicalJson(value: unknown): string {
  return createHash("sha256").update(canonicalJsonStringify(value), "utf8").digest("hex");
}
