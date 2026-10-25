export function parseBoundedPositiveInteger(
  raw: string | null,
  options: { fallback: number; max: number },
): number {
  if (raw === null || !/^[1-9]\d*$/.test(raw)) return options.fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return options.fallback;
  return Math.min(value, options.max);
}
