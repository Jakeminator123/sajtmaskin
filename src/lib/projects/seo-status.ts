/**
 * SEO status for the customer portal — the last publish's audit, persisted.
 *
 * The deploy route already runs `runSeoPublishPass` (audit → improve → re-audit)
 * when the project has SEO opted in, but the report only travelled in the deploy
 * response. The portal needs it later, so the deploy route stores a compact
 * summary under `project_data.meta.seoStatus` once Vercel has accepted the
 * deploy. Read by `site-overview.ts`; shown on `/projects/[id]`.
 *
 * This is Sajtmaskin's own 0–100 score over the checks in `src/lib/seo/types.ts`,
 * not Lighthouse or Search Console. The portal copy must say so.
 */
import type { SeoFinding, SeoPublishReport } from "@/lib/seo/types";

export const SEO_STATUS_MAX_FINDINGS = 8;

export type SeoStatusFinding = Pick<SeoFinding, "id" | "severity" | "message">;

export type SeoStatusPersisted = {
  /** Score after the publish pass improved what it could. */
  score: number;
  /** Score before the pass, so the portal can show what publishing fixed. */
  scoreBefore: number;
  /** ISO timestamp of the audit (= the publish that produced it). */
  checkedAt: string;
  siteUrl: string;
  versionId: string;
  pagesInspected: number;
  improvementCount: number;
  remainingCount: number;
  /** Critical + important findings still open, counted over ALL findings. */
  remainingBlockingCount: number;
  /** Most severe open findings first; capped at {@link SEO_STATUS_MAX_FINDINGS}. */
  remaining: SeoStatusFinding[];
};

const SEVERITY_RANK: Record<SeoFinding["severity"], number> = {
  critical: 0,
  important: 1,
  advisory: 2,
};

export function buildSeoStatus(
  report: SeoPublishReport,
  context: { siteUrl: string; versionId: string; checkedAt: string },
): SeoStatusPersisted {
  const remaining = [...report.remaining].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
  return {
    score: report.after.score,
    scoreBefore: report.before.score,
    checkedAt: context.checkedAt,
    siteUrl: context.siteUrl,
    versionId: context.versionId,
    pagesInspected: report.before.pagesInspected.length,
    improvementCount: report.improvements.length,
    remainingCount: remaining.length,
    remainingBlockingCount: remaining.filter(
      (finding) => finding.severity === "critical" || finding.severity === "important",
    ).length,
    remaining: remaining.slice(0, SEO_STATUS_MAX_FINDINGS).map((finding) => ({
      id: finding.id,
      severity: finding.severity,
      message: finding.message,
    })),
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Defensive read of `meta.seoStatus`; anything malformed reads as "no status". */
export function readSeoStatusFromMeta(
  meta: Record<string, unknown> | null | undefined,
): SeoStatusPersisted | null {
  if (!meta || typeof meta !== "object") return null;
  const raw = (meta as Record<string, unknown>).seoStatus;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const status = raw as Record<string, unknown>;
  if (
    !isFiniteNumber(status.score) ||
    typeof status.checkedAt !== "string" ||
    typeof status.siteUrl !== "string" ||
    typeof status.versionId !== "string"
  ) {
    return null;
  }
  const remaining = Array.isArray(status.remaining)
    ? status.remaining
        .filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object" && !Array.isArray(item),
        )
        .filter(
          (item) =>
            typeof item.id === "string" &&
            typeof item.message === "string" &&
            (item.severity === "critical" ||
              item.severity === "important" ||
              item.severity === "advisory"),
        )
        .map((item) => ({
          id: item.id as SeoFinding["id"],
          severity: item.severity as SeoFinding["severity"],
          message: item.message as string,
        }))
    : [];
  return {
    score: status.score,
    scoreBefore: isFiniteNumber(status.scoreBefore) ? status.scoreBefore : status.score,
    checkedAt: status.checkedAt,
    siteUrl: status.siteUrl,
    versionId: status.versionId,
    pagesInspected: isFiniteNumber(status.pagesInspected) ? status.pagesInspected : 0,
    improvementCount: isFiniteNumber(status.improvementCount) ? status.improvementCount : 0,
    remainingCount: isFiniteNumber(status.remainingCount) ? status.remainingCount : remaining.length,
    remainingBlockingCount: isFiniteNumber(status.remainingBlockingCount)
      ? status.remainingBlockingCount
      : remaining.filter((f) => f.severity !== "advisory").length,
    remaining,
  };
}
