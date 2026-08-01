/**
 * Deploy-route glue for the SEO publish pass.
 *
 * Lives beside the route rather than inside it for the same reason
 * `resolve-seo.ts` does: these are small pure decisions that deserve unit
 * tests without dragging in the whole deploy handler (db client, Vercel SDK,
 * gateway).
 */

import { getWorkloadDefaultModelFromManifest } from "@/lib/ai-models/load-manifest";
import type { SeoFinding, SeoPublishReport } from "@/lib/seo";

/** Manifest workload that owns the model for the title/description rewrite. */
export const SEO_COPY_WORKLOAD_ID = "seo_publish_copy";

/**
 * Model for the copy pass, or `null` to run deterministic improvements only.
 *
 * Returns `null` without a key rather than a model id: the copy pass would
 * immediately skip anyway, and answering `null` here makes the report say
 * "copy_pass_disabled" (a configuration fact) instead of "no_api_key" (which
 * reads like a transient failure).
 */
export function resolveSeoCopyModelId(): string | null {
  if (!process.env.OPENAI_API_KEY?.trim()) return null;
  return getWorkloadDefaultModelFromManifest(SEO_COPY_WORKLOAD_ID) ?? null;
}

/** Trim a finding to what the client needs — no internal severity weights. */
function toFindingPayload(finding: SeoFinding) {
  return {
    id: finding.id,
    severity: finding.severity,
    file: finding.file,
    message: finding.message,
  };
}

/**
 * Shape the report for the deploy response.
 *
 * `improvements` is already filtered to real file changes by the pass; this
 * only reshapes. Capping the lists keeps a pathological project (hundreds of
 * pages without an h1) from bloating the deploy response — the counts stay
 * exact so the UI can say "och 12 till".
 */
export function toSeoReportPayload(report: SeoPublishReport) {
  const MAX_LISTED = 20;
  return {
    scoreBefore: report.before.score,
    scoreAfter: report.after.score,
    pagesInspected: report.before.pagesInspected.length,
    findingsBefore: report.before.findings.length,
    improvements: report.improvements.slice(0, MAX_LISTED).map((improvement) => ({
      findingId: improvement.findingId,
      file: improvement.file,
      change: improvement.change,
      by: improvement.by,
    })),
    improvementCount: report.improvements.length,
    remaining: report.remaining.slice(0, MAX_LISTED).map(toFindingPayload),
    remainingCount: report.remaining.length,
    // Counted server-side over ALL remaining findings, not just the listed
    // slice: the client uses it to decide whether the report is worth opening,
    // and that decision must not change because a project had 21 findings.
    remainingBlockingCount: report.remaining.filter(
      (f) => f.severity === "critical" || f.severity === "important",
    ).length,
    copyPassSkippedReason: report.llmSkippedReason,
  };
}

export type SeoReportPayload = ReturnType<typeof toSeoReportPayload>;
