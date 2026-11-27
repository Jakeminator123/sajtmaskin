const MAX_POSTGRES_MEDIA_ID = "9223372036854775807";

/** Return the canonical decimal ID without rounding PostgreSQL int8 values. */
export function parseMediaLibraryId(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  if (typeof value !== "string" || !/^[1-9][0-9]{0,18}$/.test(value)) return null;
  return value.length === MAX_POSTGRES_MEDIA_ID.length && value > MAX_POSTGRES_MEDIA_ID
    ? null
    : value;
}
