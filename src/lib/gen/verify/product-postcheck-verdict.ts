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
import type {
  ProductPostcheckAttestation,
  ProductPostcheckResult,
} from "@/lib/gen/verify/product-postcheck";

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
  "pending",
  "indeterminate",
  "superseded",
]);

/**
 * Strictest durable domain for one filesRevision.
 * A later skip/`allowed_skip` must not erase `blocked` on the same revision.
 */
const VERDICT_STRICTNESS: Record<ProductPostcheckVerdict, number> = {
  blocked: 4,
  pending: 3,
  indeterminate: 3,
  superseded: 3,
  allowed_skip: 1,
  passed: 1,
};

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

export function isAttestedAllowedSkipReason(
  reason: string | null | undefined,
): boolean {
  const normalized = reason?.trim() || "";
  return normalized === "feature_disabled" || isInfrastructureSkipReason(normalized);
}

export function verdictFromProductPostcheckResult(
  result: ProductPostcheckResult | null,
): ProductPostcheckVerdict {
  if (!result) return "pending";
  if (result.skippedReason === "preview_superseded") return "superseded";
  if (result.skipped) {
    // Server-config `feature_disabled` is itself the attestation — no preview
    // tuple exists when the gate is off. Other release skips need the tuple.
    if (result.skippedReason === "feature_disabled") return "allowed_skip";
    if (result.attestation && isAttestedAllowedSkipReason(result.skippedReason)) {
      return "allowed_skip";
    }
    return "pending";
  }
  if (!result.attestation) return "pending";
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

function skippedReasonFromMeta(meta: unknown): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const reason = (meta as { skippedReason?: unknown }).skippedReason;
  return typeof reason === "string" && reason.trim() ? reason.trim() : null;
}

export function filesRevisionFromPostcheckMeta(meta: unknown): string {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return "";
  const record = meta as Record<string, unknown>;
  for (const key of ["attestedFilesRevision", "filesRevision"] as const) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function isAttestedPostcheckMeta(meta: unknown): boolean {
  if (filesRevisionFromPostcheckMeta(meta)) return true;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  const session = (meta as { attestedPreviewSessionId?: unknown }).attestedPreviewSessionId;
  return typeof session === "string" && session.trim().length > 0;
}

function verdictFromSkippedLog(meta: unknown): ProductPostcheckVerdict {
  const reason = skippedReasonFromMeta(meta);
  if (reason === "preview_superseded") return "superseded";
  if (reason === "feature_disabled") return "allowed_skip";
  if (isAttestedPostcheckMeta(meta) && isAttestedAllowedSkipReason(reason)) {
    return "allowed_skip";
  }
  return "pending";
}

function stricterVerdict(
  left: ProductPostcheckVerdict,
  right: ProductPostcheckVerdict,
): ProductPostcheckVerdict {
  return VERDICT_STRICTNESS[left] >= VERDICT_STRICTNESS[right] ? left : right;
}

/**
 * L6 persists a running claim. A `running`/`pending` signal is `pending`.
 * Terminal claim statuses are not a pass by themselves — missing logs stay
 * `pending` (L2: a missing summary is never pass).
 */
export function interpretProductPostcheckClaim(
  claim: ProductPostcheckClaimSignal | null | undefined,
): ProductPostcheckVerdict | null {
  const status = claim?.status?.trim().toLowerCase();
  if (status === "running" || status === "pending") return "pending";
  return null;
}

type CollectedVerdict = {
  verdict: ProductPostcheckVerdict;
  revision: string;
  createdAt: number | null;
};

function pickNewestCollected(rows: readonly CollectedVerdict[]): CollectedVerdict {
  let newest = rows[0]!;
  for (const row of rows) {
    if (row.createdAt != null && (newest.createdAt == null || row.createdAt > newest.createdAt)) {
      newest = row;
    }
  }
  return newest;
}

function collectRevisionVerdicts(
  logs: readonly ProductPostcheckVerdictLog[],
): CollectedVerdict[] {
  const collected: CollectedVerdict[] = [];
  for (const log of logs) {
    if (log.category === PRODUCT_POSTCHECK_SUMMARY_CATEGORY) {
      collected.push({
        verdict: verdictFromSummaryMeta(log.meta) ?? "pending",
        revision: filesRevisionFromPostcheckMeta(log.meta),
        createdAt: createdAtMs(log),
      });
      continue;
    }
    if (log.category === PRODUCT_POSTCHECK_SKIPPED_CATEGORY) {
      collected.push({
        verdict: verdictFromSkippedLog(log.meta),
        revision: filesRevisionFromPostcheckMeta(log.meta),
        createdAt: createdAtMs(log),
      });
    }
  }
  return collected;
}

/**
 * Client/server log interpreter. A missing summary is `pending`, never pass.
 * A failed read must be passed as `readFailed: true` → `indeterminate`.
 *
 * For one filesRevision: a later skip/`allowed_skip` never erases `blocked`.
 * Newest completed `passed`/`blocked` wins among those two; a later incomplete
 * skip (`pending`) after `passed` still holds F3. Among non-completed domains
 * the strictest wins (`pending`/`indeterminate`/`superseded` > `allowed_skip`).
 */
export function interpretProductPostcheckLogs(
  logs: readonly ProductPostcheckVerdictLog[],
  options?: {
    readFailed?: boolean;
    claim?: ProductPostcheckClaimSignal | null;
  },
): ProductPostcheckVerdict {
  if (options?.readFailed) return "indeterminate";
  const collected = collectRevisionVerdicts(logs);
  if (collected.length === 0) {
    return interpretProductPostcheckClaim(options?.claim) ?? "pending";
  }
  const newest = pickNewestCollected(collected);
  const sameRevision = collected.filter((row) => row.revision === newest.revision);
  const completed = sameRevision.filter(
    (row) => row.verdict === "passed" || row.verdict === "blocked",
  );
  if (completed.length > 0) {
    const newestCompleted = pickNewestCollected(completed);
    if (newestCompleted.verdict === "blocked") return "blocked";
    const laterIncomplete = sameRevision.filter(
      (row) =>
        (row.verdict === "pending" ||
          row.verdict === "indeterminate" ||
          row.verdict === "superseded") &&
        row.createdAt != null &&
        newestCompleted.createdAt != null &&
        row.createdAt > newestCompleted.createdAt,
    );
    if (laterIncomplete.length > 0) {
      return laterIncomplete.reduce(
        (acc, row) => stricterVerdict(acc, row.verdict),
        laterIncomplete[0]!.verdict,
      );
    }
    return "passed";
  }
  return sameRevision.reduce(
    (acc, row) => stricterVerdict(acc, row.verdict),
    sameRevision[0]!.verdict,
  );
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
 * Attestation still guards `passed`/`blocked` and non-config `allowed_skip`.
 * `allowed_skip` is an F3-release domain: writable unattested only when
 * `skippedReason` is `feature_disabled` (server-config). Infra skips need a
 * preview tuple. Other unattested writes are `pending`/`indeterminate`/`superseded`.
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
    if (verdict == null) return false;
    if (UNATTESTED_WRITABLE_VERDICTS.has(verdict)) return true;
    return (
      verdict === "allowed_skip" &&
      skippedReasonFromMeta(log.meta) === "feature_disabled"
    );
  });
}

/**
 * Report-state for an L6 loser poll. Derived from the L2 domain, not from
 * inventing a new Chromium result. `activeRunId` stays the winner pointer.
 */
export function productPostcheckResultFromVerdict(params: {
  verdict: ProductPostcheckVerdict;
  runId: string;
  claimStatus?: ProductPostcheckResult["claimStatus"];
  previewUrl: string;
  durationMs?: number | null;
  attestation?: ProductPostcheckAttestation | null;
}): ProductPostcheckResult {
  const pointer = {
    verificationRunId: params.runId,
    activeRunId: params.runId,
    claimStatus: params.claimStatus ?? null,
  };
  const base = {
    ok: true as const,
    warnings: [] as ProductPostcheckResult["warnings"],
    warningCount: 0,
    routesChecked: 0,
    durationMs: params.durationMs ?? 0,
    checkedUrl: params.previewUrl,
    screenshots: null,
    domSummary: null,
    ...pointer,
  };
  switch (params.verdict) {
    case "passed":
      return {
        ...base,
        skipped: false,
        skippedReason: null,
        productBlocked: false,
        attestation: params.attestation ?? null,
      };
    case "blocked":
      return {
        ...base,
        skipped: false,
        skippedReason: null,
        productBlocked: true,
        attestation: params.attestation ?? null,
      };
    case "allowed_skip":
      return {
        ...base,
        skipped: true,
        skippedReason: "claim_settled",
        productBlocked: false,
        attestation: params.attestation ?? null,
      };
    case "superseded":
      return {
        ...base,
        skipped: true,
        skippedReason: "preview_superseded",
        productBlocked: false,
        attestation: null,
      };
    case "pending":
    case "indeterminate":
      if (params.claimStatus === "running") {
        return {
          ...base,
          skipped: true,
          skippedReason: "claim_busy",
          productBlocked: false,
          attestation: null,
        };
      }
      return {
        ...base,
        skipped: true,
        skippedReason: "claim_settled",
        productBlocked: false,
        attestation: null,
      };
  }
}
