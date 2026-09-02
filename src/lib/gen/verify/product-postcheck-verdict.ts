/**
 * Explicit Product Postcheck domain (L2).
 *
 * The F3 lift used to treat a missing `product_postcheck.summary` as "not
 * blocked" — a boolean fail-open. A lock race (`503 row_contention`) could
 * drop the write, after which F3 read the absence as pass.
 *
 * Invariant: a missing or unreadable verdict is never `passed`. F3 may
 * release only on `passed` or `allowed_skip`.
 */

import {
  isInfrastructureSkipReason,
} from "@/lib/gen/verify/product-postcheck-skip";
import type { ProductPostcheckResult } from "@/lib/gen/verify/product-postcheck";

export const PRODUCT_POSTCHECK_VERDICTS = [
  "passed",
  "blocked",
  "allowed_skip",
  "pending",
  "indeterminate",
  "superseded",
] as const;

export type ProductPostcheckVerdict = (typeof PRODUCT_POSTCHECK_VERDICTS)[number];

export const PRODUCT_POSTCHECK_SUMMARY_CATEGORY = "product_postcheck.summary";
export const PRODUCT_POSTCHECK_SKIPPED_CATEGORY = "product_postcheck.skipped";
export const PRODUCT_POSTCHECK_VERDICT_META_KEY = "verdict";

const F3_RELEASE_VERDICTS: ReadonlySet<ProductPostcheckVerdict> = new Set([
  "passed",
  "allowed_skip",
]);

const F3_RETRYABLE_VERDICTS: ReadonlySet<ProductPostcheckVerdict> = new Set([
  "pending",
  "indeterminate",
  "superseded",
]);

const UNATTESTED_WRITABLE_VERDICTS: ReadonlySet<ProductPostcheckVerdict> = new Set([
  "allowed_skip",
  "pending",
  "indeterminate",
  "superseded",
]);

export type ProductPostcheckF3GateReason =
  | "product_postcheck_blocked"
  | "product_postcheck_pending"
  | "product_postcheck_indeterminate"
  | "product_postcheck_superseded";

export type ProductPostcheckVerdictLog = {
  category?: string | null;
  meta?: unknown;
  created_at?: Date | string | null;
};

export type ProductPostcheckClaimSignal = {
  status?: string | null;
};

export function isProductPostcheckVerdict(
  value: unknown,
): value is ProductPostcheckVerdict {
  return (
    typeof value === "string" &&
    (PRODUCT_POSTCHECK_VERDICTS as readonly string[]).includes(value)
  );
}

export function f3MayReleaseOnVerdict(verdict: ProductPostcheckVerdict): boolean {
  return F3_RELEASE_VERDICTS.has(verdict);
}

export function isRetryableProductPostcheckVerdict(
  verdict: ProductPostcheckVerdict,
): boolean {
  return F3_RETRYABLE_VERDICTS.has(verdict);
}

export function productPostcheckF3GateReason(
  verdict: ProductPostcheckVerdict,
): ProductPostcheckF3GateReason | null {
  switch (verdict) {
    case "blocked":
      return "product_postcheck_blocked";
    case "pending":
      return "product_postcheck_pending";
    case "indeterminate":
      return "product_postcheck_indeterminate";
    case "superseded":
      return "product_postcheck_superseded";
    default:
      return null;
  }
}

export function verdictFromProductPostcheckResult(
  result: ProductPostcheckResult | null,
): ProductPostcheckVerdict {
  if (!result) return "pending";
  if (result.skippedReason === "preview_superseded") return "superseded";
  if (result.skipped) {
    if (
      result.skippedReason === "feature_disabled" ||
      isInfrastructureSkipReason(result.skippedReason)
    ) {
      return "allowed_skip";
    }
    return "pending";
  }
  if (result.skippedReason !== "feature_disabled" && !result.attestation) {
    return "pending";
  }
  return result.productBlocked === true ? "blocked" : "passed";
}

export function verdictFromSummaryMeta(meta: unknown): ProductPostcheckVerdict | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const record = meta as Record<string, unknown>;
  if (isProductPostcheckVerdict(record.verdict)) return record.verdict;
  if (record.productBlocked === true) return "blocked";
  if (record.productBlocked === false) return "passed";
  return null;
}

function createdAtMs(log: ProductPostcheckVerdictLog): number | null {
  if (!log.created_at) return null;
  const ms = new Date(log.created_at).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function pickNewest(
  logs: readonly ProductPostcheckVerdictLog[],
  category: string,
): ProductPostcheckVerdictLog | null {
  const matches = logs.filter((log) => log.category === category);
  if (matches.length === 0) return null;
  let newest = matches[0]!;
  let newestMs = createdAtMs(newest);
  for (const candidate of matches) {
    const ms = createdAtMs(candidate);
    if (ms != null && (newestMs == null || ms > newestMs)) {
      newest = candidate;
      newestMs = ms;
    }
  }
  return newest;
}

function skippedReasonFromMeta(meta: unknown): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const reason = (meta as { skippedReason?: unknown }).skippedReason;
  return typeof reason === "string" && reason.trim() ? reason.trim() : null;
}

/**
 * L6 (unmerged) will persist a running claim. Until then this only maps an
 * explicit `pending`/`running` signal — missing claim is not a pass.
 */
export function interpretProductPostcheckClaim(
  claim: ProductPostcheckClaimSignal | null | undefined,
): ProductPostcheckVerdict | null {
  const status = claim?.status?.trim().toLowerCase();
  if (status === "running" || status === "pending") return "pending";
  return null;
}

/**
 * Client/server log interpreter. A missing summary is `pending`, never pass.
 * A failed read must be passed as `readFailed: true` → `indeterminate`.
 */
export function interpretProductPostcheckLogs(
  logs: readonly ProductPostcheckVerdictLog[],
  options?: {
    readFailed?: boolean;
    claim?: ProductPostcheckClaimSignal | null;
  },
): ProductPostcheckVerdict {
  if (options?.readFailed) return "indeterminate";
  const summary = pickNewest(logs, PRODUCT_POSTCHECK_SUMMARY_CATEGORY);
  if (summary) {
    return verdictFromSummaryMeta(summary.meta) ?? "pending";
  }
  const claimVerdict = interpretProductPostcheckClaim(options?.claim);
  if (claimVerdict) return claimVerdict;
  const skipped = pickNewest(logs, PRODUCT_POSTCHECK_SKIPPED_CATEGORY);
  if (skipped) {
    const reason = skippedReasonFromMeta(skipped.meta);
    if (reason === "preview_superseded") return "superseded";
    if (reason === "feature_disabled" || isInfrastructureSkipReason(reason)) {
      return "allowed_skip";
    }
    return "pending";
  }
  return "pending";
}

export function interpretProductPostcheckSummaryRead(input: {
  status: "ok" | "missing" | "error";
  meta?: unknown;
  claim?: ProductPostcheckClaimSignal | null;
}): ProductPostcheckVerdict {
  if (input.status === "error") return "indeterminate";
  if (input.status === "missing") {
    return interpretProductPostcheckClaim(input.claim) ?? "pending";
  }
  return verdictFromSummaryMeta(input.meta) ?? "pending";
}

/**
 * Attestation still guards `passed`/`blocked` (a false PASS after N+1).
 * Non-release verdicts may be written without a preview tuple so F3 can
 * see `pending`/`superseded`/`allowed_skip` instead of a missing row.
 */
export function isUnattestedProductPostcheckVerdictWriteAllowed(
  logs: readonly { category?: string | null; meta?: unknown }[],
): boolean {
  const productLogs = logs.filter((log) =>
    typeof log.category === "string" && log.category.startsWith("product_postcheck."),
  );
  if (productLogs.length === 0) return false;
  return productLogs.every((log) => {
    if (log.category !== PRODUCT_POSTCHECK_SUMMARY_CATEGORY) return false;
    const verdict = verdictFromSummaryMeta(log.meta);
    return verdict != null && UNATTESTED_WRITABLE_VERDICTS.has(verdict);
  });
}
