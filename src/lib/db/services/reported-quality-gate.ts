/**
 * Read-time quality-gate report (SM-017).
 *
 * `generation_telemetry.quality_gate_result` is finalize-only
 * (`preflight_passed` / `preflight_failed` / `verifier_failed`). Product
 * Postcheck writes `product_postcheck.summary` later and never stamps the
 * column. Promote-guard keeps reading the column; this module is the reader
 * overlay so a displayed gate is not green when postcheck blocked.
 */

import type { VersionStatus } from "@/lib/logging/event-bus-types";
import {
  formatProductPostcheckSkippedMessage,
  isInfrastructureSkipReason,
  productPostcheckSkipReasonFromMessage,
} from "@/lib/gen/verify/product-postcheck-skip";
import {
  filesRevisionFromPostcheckMeta,
  verdictFromSummaryMeta,
} from "@/lib/gen/verify/product-postcheck-verdict";

export const REPORTED_PRODUCT_BLOCKED = "product_blocked";
export const REPORTED_PRODUCT_POSTCHECK_DEGRADED = "product_postcheck_degraded";

/**
 * Metanyckeln som märker en skip vars orsak låg i kontrollkedjan, inte i
 * produkten. Bäraren stannar kvar i `degradations[]` så diagnostiken behåller
 * hela historien — men presentationslagret får inte måla versionen amber på
 * den. Se `classifyProductPostcheckSkipReason`.
 */
export const PRODUCT_POSTCHECK_ADVISORY_META_KEY = "infrastructureSkip";

const PRODUCT_POSTCHECK_SUMMARY = "product_postcheck.summary";
const PRODUCT_POSTCHECK_SKIPPED = "product_postcheck.skipped";

export type ProductPostcheckReportLog = {
  category?: string | null;
  message?: string | null;
  meta?: unknown;
  created_at?: Date | string | null;
};

export type ProductPostcheckReportState = {
  /**
   * `advisory` = postchecken kunde inte köras av skäl som ligger i
   * kontrollkedjan. Den är avsiktligt skild från `degraded`: båda betyder
   * "ingen produktdom finns", men bara `degraded` får läsas som ett påstående
   * om sajten.
   * `waiting` = durable dom är `pending`/`indeterminate`/`superseded` — inte
   * "ej blockerad" och inte en färdig produktdom.
   */
  kind: "unknown" | "clear" | "advisory" | "degraded" | "blocked" | "waiting";
  summary: ProductPostcheckReportLog | null;
  skipped: ProductPostcheckReportLog | null;
};

export type ProductPostcheckEventSignal = {
  t?: string | null;
  kind?: string | null;
  message?: string | null;
  meta?: unknown;
  ts?: Date | string | null;
};

/**
 * Product Postcheck bus events are revision-scoped just like their durable
 * error-log rows. Legacy events predate the attestation key and remain visible;
 * a stamped event for N must disappear as soon as the same version becomes N+1.
 */
export function productPostcheckEventMatchesCurrentFilesRevision(
  event: ProductPostcheckEventSignal,
  currentFilesRevision: string | null | undefined,
): boolean {
  if (
    event.t !== "version.degraded" ||
    (event.kind !== "product_postcheck_skipped" &&
      event.kind !== "product_postcheck_blocked")
  ) {
    return true;
  }
  const meta = reportMeta(event.meta);
  if (!meta || !Object.prototype.hasOwnProperty.call(meta, "attestedFilesRevision")) {
    return true;
  }
  const attested = meta.attestedFilesRevision;
  const current = currentFilesRevision?.trim() || "";
  return (
    typeof attested === "string" &&
    attested.trim() !== "" &&
    attested.trim() === current
  );
}

export function filterProductPostcheckEventsForCurrentFilesRevision<
  T extends ProductPostcheckEventSignal,
>(events: readonly T[], currentFilesRevision: string | null | undefined): T[] {
  return events.filter((event) =>
    productPostcheckEventMatchesCurrentFilesRevision(event, currentFilesRevision),
  );
}

function signalClock(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function newestSignal(
  logs: readonly ProductPostcheckReportLog[],
  category: string,
): { log: ProductPostcheckReportLog; index: number } | null {
  let newest: { log: ProductPostcheckReportLog; index: number; ms: number | null } | null = null;
  for (let index = 0; index < logs.length; index += 1) {
    const log = logs[index]!;
    if (log.category !== category) continue;
    const ms = signalClock(log.created_at);
    if (!newest || (ms != null && (newest.ms == null || ms > newest.ms))) {
      newest = { log, index, ms };
    }
  }
  return newest ? { log: newest.log, index: newest.index } : null;
}

function isLaterSignal(
  candidate: { log: ProductPostcheckReportLog; index: number },
  baseline: { log: ProductPostcheckReportLog; index: number },
): boolean {
  const candidateMs = signalClock(candidate.log.created_at);
  const baselineMs = signalClock(baseline.log.created_at);
  if (candidateMs != null && baselineMs != null) {
    // Separate writes can land in the same DB millisecond. A skip is the
    // conservative truth at equality: we cannot prove the clean summary came
    // later, so hiding the incomplete run would be a false green.
    return candidateMs >= baselineMs;
  }
  // DB readers return newest first. Keep that deterministic fallback for
  // legacy rows whose timestamps could not be parsed.
  return candidate.index < baseline.index;
}

/**
 * Resolve the durable Product Postcheck report without letting an inconclusive
 * later attempt erase a concrete blocker from the latest completed run.
 * A later completed summary is authoritative and therefore clears an older
 * skip; a later skip only degrades a clean/absent summary.
 */
function newestRevisionKey(
  summary: ProductPostcheckReportLog | null,
  skipped: ProductPostcheckReportLog | null,
): string {
  const summaryMs = signalClock(summary?.created_at);
  const skippedMs = signalClock(skipped?.created_at);
  if (skipped && (summaryMs == null || (skippedMs != null && skippedMs >= summaryMs))) {
    return filesRevisionFromPostcheckMeta(skipped.meta);
  }
  return filesRevisionFromPostcheckMeta(summary?.meta);
}

function newestCompletedSummaryForRevision(
  logs: readonly ProductPostcheckReportLog[],
  revision: string,
): ProductPostcheckReportLog | null {
  let match: ProductPostcheckReportLog | null = null;
  let matchMs: number | null = null;
  for (const log of logs) {
    if (log.category !== PRODUCT_POSTCHECK_SUMMARY) continue;
    if (filesRevisionFromPostcheckMeta(log.meta) !== revision) continue;
    const verdict = verdictFromSummaryMeta(log.meta);
    if (verdict !== "passed" && verdict !== "blocked") continue;
    const ms = signalClock(log.created_at);
    if (!match || (ms != null && (matchMs == null || ms > matchMs))) {
      match = log;
      matchMs = ms;
    }
  }
  return match;
}

export function resolveProductPostcheckReportState(
  logs: readonly ProductPostcheckReportLog[],
): ProductPostcheckReportState {
  const summary = newestSignal(logs, PRODUCT_POSTCHECK_SUMMARY);
  const skipped = newestSignal(logs, PRODUCT_POSTCHECK_SKIPPED);
  if (!summary && !skipped) {
    return { kind: "unknown", summary: null, skipped: null };
  }

  const revision = newestRevisionKey(summary?.log ?? null, skipped?.log ?? null);
  const completedSummary = newestCompletedSummaryForRevision(logs, revision);
  if (completedSummary && verdictFromSummaryMeta(completedSummary.meta) === "blocked") {
    return {
      kind: "blocked",
      summary: completedSummary,
      skipped: skipped?.log ?? null,
    };
  }

  const newestVerdict = summary ? verdictFromSummaryMeta(summary.log.meta) : null;
  if (
    newestVerdict === "pending" ||
    newestVerdict === "indeterminate" ||
    newestVerdict === "superseded"
  ) {
    return {
      kind: "waiting",
      summary: summary!.log,
      skipped: skipped?.log ?? null,
    };
  }

  if (skipped && (!summary || isLaterSignal(skipped, summary))) {
    const kind = isInfrastructureSkipReason(skipReasonFromLog(skipped.log))
      ? "advisory"
      : "degraded";
    return { kind, summary: summary?.log ?? null, skipped: skipped.log };
  }

  return { kind: "clear", summary: summary?.log ?? null, skipped: skipped?.log ?? null };
}

/** `meta.skippedReason` när den finns, annars orsaken inbakad i meddelandet. */
function skipReasonFromLog(log: ProductPostcheckReportLog): string | null {
  const meta = reportMeta(log.meta);
  const fromMeta = typeof meta?.skippedReason === "string" ? meta.skippedReason.trim() : "";
  if (fromMeta) return fromMeta;
  return productPostcheckSkipReasonFromMessage(log.message);
}

function reportMeta(meta: unknown): Record<string, unknown> | null {
  return meta && typeof meta === "object" && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : null;
}

function latestEventSignal(
  events: readonly ProductPostcheckEventSignal[],
  kind: "product_postcheck_skipped" | "product_postcheck_blocked",
): ProductPostcheckEventSignal | null {
  let newest: { event: ProductPostcheckEventSignal; index: number; ms: number | null } | null = null;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    if (event.t !== "version.degraded" || event.kind !== kind) continue;
    const ms = signalClock(event.ts);
    if (
      !newest ||
      (ms != null && (newest.ms == null || ms > newest.ms)) ||
      (ms === newest.ms && index > newest.index)
    ) {
      newest = { event, index, ms };
    }
  }
  return newest?.event ?? null;
}

function summaryStrictlyLaterThanEvent(
  summary: ProductPostcheckReportLog | null,
  event: ProductPostcheckEventSignal | null,
): boolean {
  if (!summary || !event) return false;
  const summaryMs = signalClock(summary.created_at);
  const eventMs = signalClock(event.ts);
  return summaryMs != null && eventMs != null && summaryMs > eventMs;
}

function eventDegradation(
  event: ProductPostcheckEventSignal,
  kind: "product_postcheck_skipped" | "product_postcheck_blocked",
): VersionStatus["degradations"][number] {
  const meta = reportMeta(event.meta);
  const advisory =
    kind === "product_postcheck_skipped" &&
    isInfrastructureSkipReason(
      typeof meta?.skippedReason === "string"
        ? meta.skippedReason
        : productPostcheckSkipReasonFromMessage(event.message),
    );
  return {
    kind,
    message:
      event.message?.trim() ||
      (kind === "product_postcheck_blocked"
        ? "Product Postcheck hittade blockerande produktfel."
        : "F2 Product Postcheck gav inget verifierbart resultat."),
    meta: withAdvisoryFlag(meta, advisory),
  };
}

/** Overlay persisted postcheck truth onto an in-memory event-bus projection. */
export function applyProductPostcheckReportToVersionStatus(
  status: VersionStatus,
  logs: readonly ProductPostcheckReportLog[],
  events: readonly ProductPostcheckEventSignal[] = [],
): VersionStatus {
  const report = resolveProductPostcheckReportState(logs);
  if (report.kind === "unknown" || report.kind === "waiting") return status;

  const blockedEvent = latestEventSignal(events, "product_postcheck_blocked");
  const skippedEvent = latestEventSignal(events, "product_postcheck_skipped");
  const unresolvedBlockedEvent =
    blockedEvent && !summaryStrictlyLaterThanEvent(report.summary, blockedEvent)
      ? blockedEvent
      : null;
  const unresolvedSkippedEvent =
    skippedEvent && !summaryStrictlyLaterThanEvent(report.summary, skippedEvent)
      ? skippedEvent
      : null;

  const degradations = status.degradations.filter(
    (item) =>
      item.kind !== "product_postcheck_skipped" &&
      item.kind !== "product_postcheck_blocked",
  );
  if (report.kind === "blocked" || unresolvedBlockedEvent) {
    if (report.kind !== "blocked" && unresolvedBlockedEvent) {
      degradations.push(
        eventDegradation(unresolvedBlockedEvent, "product_postcheck_blocked"),
      );
      return { ...status, degradations };
    }
    degradations.push({
      kind: "product_postcheck_blocked",
      message:
        report.summary?.message?.trim() ||
        "Product Postcheck hittade blockerande produktfel.",
      meta: reportMeta(report.summary?.meta) ?? null,
    });
  } else if (report.kind === "degraded" || report.kind === "advisory") {
    const meta = reportMeta(report.skipped?.meta);
    const reason =
      typeof meta?.skippedReason === "string" && meta.skippedReason.trim()
        ? meta.skippedReason.trim()
        : "unknown";
    degradations.push({
      kind: "product_postcheck_skipped",
      message: formatProductPostcheckSkippedMessage(reason),
      // Noteringen bevaras oavsett klass — diagnostiken ska kunna visa exakt
      // vad som hände. Flaggan styr bara hur badgen får läsa den.
      meta: withAdvisoryFlag(meta, report.kind === "advisory"),
    });
  } else if (unresolvedSkippedEvent) {
    degradations.push(
      eventDegradation(unresolvedSkippedEvent, "product_postcheck_skipped"),
    );
  }
  return { ...status, degradations };
}

function withAdvisoryFlag(
  meta: Record<string, unknown> | null,
  advisory: boolean,
): Record<string, unknown> | null {
  if (!advisory) return meta;
  return { ...(meta ?? {}), [PRODUCT_POSTCHECK_ADVISORY_META_KEY]: true };
}

/** A failed durable-log read is itself an inconclusive verification signal. */
export function applyProductPostcheckLogReadFailureToVersionStatus(
  status: VersionStatus,
): VersionStatus {
  if (
    status.degradations.some(
      (item) =>
        item.kind === "product_postcheck_blocked" ||
        item.kind === "product_postcheck_skipped",
    )
  ) {
    return status;
  }
  return {
    ...status,
    degradations: [
      ...status.degradations,
      {
        kind: "product_postcheck_skipped",
        message: formatProductPostcheckSkippedMessage("log_read_error"),
        // Medvetet INTE advisory. Vid en misslyckad loggläsning vet vi inte vad
        // loggen innehöll — där kan ha legat ett `product_postcheck_blocked`.
        // Att visa Publicerad då vore fail-open på precis den signal som ska
        // stoppa en trasig sajt. Advisory kräver att vi vet att ingen dom finns.
        meta: { skippedReason: "log_read_error", transient: true },
      },
    ],
  };
}

export function isReportedQualityGateGreen(
  result: string | null | undefined,
): boolean {
  return result === "preflight_passed";
}

export function productBlockedFromSummaryMeta(meta: unknown): boolean {
  const verdict = verdictFromSummaryMeta(meta);
  if (verdict) return verdict === "blocked";
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
  productPostcheck?: {
    productBlocked?: boolean | null;
    degraded?: boolean | null;
  } | null,
): string | null {
  const finalize = qualityGateResult ?? null;
  if (finalize === "preflight_passed" && productPostcheck?.productBlocked === true) {
    return REPORTED_PRODUCT_BLOCKED;
  }
  if (finalize === "preflight_passed" && productPostcheck?.degraded === true) {
    return REPORTED_PRODUCT_POSTCHECK_DEGRADED;
  }
  return finalize;
}

export function resolveReportedQualityGateFromSignals(input: {
  qualityGateResult?: string | null;
  productPostcheckSummaryMeta?: unknown;
  productPostcheckLogs?: readonly ProductPostcheckReportLog[];
}): string | null {
  const report = input.productPostcheckLogs
    ? resolveProductPostcheckReportState(input.productPostcheckLogs)
    : null;
  return resolveReportedQualityGateResult(input.qualityGateResult, {
    productBlocked: report
      ? report.kind === "blocked"
      : productBlockedFromSummaryMeta(input.productPostcheckSummaryMeta),
    degraded: report?.kind === "degraded",
  });
}
