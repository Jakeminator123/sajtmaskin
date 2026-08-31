/**
 * Shared Product Postcheck skip wording. Kept out of `product-postcheck.ts`
 * so labels and the quality-gate overlay can format a skip without pulling
 * Playwright / capture.
 */

export const PRODUCT_POSTCHECK_SKIPPED_KIND = "product_postcheck_skipped" as const;

export function formatProductPostcheckSkippedMessage(reason: string): string {
  const trimmed = reason.trim() || "unknown";
  return `F2 Product Postcheck skipped (${PRODUCT_POSTCHECK_SKIPPED_KIND}: ${trimmed}).`;
}

export function productPostcheckSkipReasonFromMessage(
  message: string | null | undefined,
): string | null {
  if (!message) return null;
  const structured = message.match(
    /product_postcheck_skipped:\s*([a-z0-9_]+)/i,
  );
  if (structured?.[1]) return structured[1];
  const wrapped = message.match(
    /Product Postcheck skipped \(([a-z0-9_]+)\)/i,
  );
  return wrapped?.[1] ?? null;
}
