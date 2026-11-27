import { dbConfigured } from "@/lib/db/client";
import { formatOpenClawFindingsBlock } from "./findings-context";
import { formatOpenClawTimelineBlock } from "./timeline-context";

/**
 * OpenClaw review context (Fas 1 + Fas 4, consolidated).
 *
 * Findings and timeline both derive from the same persisted
 * `engine_version_error_logs` rows, so read them ONCE here and feed both pure
 * formatters — instead of two separate DB round-trips per review-intent turn.
 * DB-guarded and never throws; missing/unconfigured returns `{ null, null }`
 * so normal chat keeps working.
 */

const ROW_READ_LIMIT = 80;

export interface OpenClawReviewContext {
  findings: string | null;
  timeline: string | null;
  liveReview: string | null;
}

export async function buildOpenClawReviewContext(params: {
  versionId: string | null | undefined;
  chatId?: string | null;
  filesRevision?: string | null;
}): Promise<OpenClawReviewContext> {
  const versionId = (params.versionId ?? "").trim();
  if (!versionId || !dbConfigured) {
    return { findings: null, timeline: null, liveReview: null };
  }

  try {
    const { getLatestEngineVersionErrorLogs } = await import(
      "@/lib/db/services/version-errors"
    );
    const { getLiveReviewRunForVersion } = await import(
      "@/lib/db/services/live-review-runs"
    );
    const { formatOpenClawLiveReviewBlock } = await import("./live-review-context");
    const [rows, liveReviewRow] = await Promise.all([
      getLatestEngineVersionErrorLogs(versionId, ROW_READ_LIMIT),
      getLiveReviewRunForVersion(versionId),
    ]);
    const currentReview = liveReviewRow && liveReviewRow.chatId === params.chatId &&
      liveReviewRow.versionId === versionId &&
      Boolean(params.filesRevision) && liveReviewRow.filesRevision === params.filesRevision &&
      liveReviewRow.expiresAt.getTime() > Date.now() ? liveReviewRow : null;
    return {
      findings: formatOpenClawFindingsBlock(
        rows.map((row) => ({
          level: row.level,
          category: row.category,
          message: row.message,
          meta: row.meta,
        })),
      ),
      timeline: formatOpenClawTimelineBlock(
        rows.map((row) => ({
          createdAt: row.created_at,
          level: row.level,
          category: row.category,
          message: row.message,
          meta: row.meta,
        })),
      ),
      liveReview: formatOpenClawLiveReviewBlock(currentReview),
    };
  } catch (error) {
    console.warn(
      "[openclaw/review-context] read failed:",
      error instanceof Error ? error.message : error,
    );
    return { findings: null, timeline: null, liveReview: null };
  }
}
