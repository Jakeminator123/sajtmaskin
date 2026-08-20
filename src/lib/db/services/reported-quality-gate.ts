/**
 * Read-time quality-gate report (SM-017).
 *
 * `generation_telemetry.quality_gate_result` is finalize-only
 * (`preflight_passed` / `preflight_failed` / `verifier_failed`). Product
 * Postcheck writes `product_postcheck.summary` later and never stamps the
 * column. Promote-guard keeps reading the column; this module is the reader
 * overlay so a displayed gate is not green when postcheck blocked.
 */

export const REPORTED_PRODUCT_BLOCKED = "product_blocked";

export function isReportedQualityGateGreen(
  result: string | null | undefined,
): boolean {
  return result === "preflight_passed";
}

export function productBlockedFromSummaryMeta(meta: unknown): boolean {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  return (meta as { productBlocked?: unknown }).productBlocked === true;
}

/**
 * Merge finalize `quality_gate_result` with the newest
 * `product_postcheck.summary`. `product_blocked` is a report overlay — not a
 * stored enum and not a promote-guard signal.
 */
export function resolveReportedQualityGateResult(
  qualityGateResult: string | null | undefined,
  productPostcheck?: { productBlocked?: boolean | null } | null,
): string | null {
  const finalize = qualityGateResult ?? null;
  if (finalize === "preflight_passed" && productPostcheck?.productBlocked === true) {
    return REPORTED_PRODUCT_BLOCKED;
  }
  return finalize;
}

export function resolveReportedQualityGateFromSignals(input: {
  qualityGateResult?: string | null;
  productPostcheckSummaryMeta?: unknown;
}): string | null {
  return resolveReportedQualityGateResult(input.qualityGateResult, {
    productBlocked: productBlockedFromSummaryMeta(input.productPostcheckSummaryMeta),
  });
}
