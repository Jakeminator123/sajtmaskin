import { z } from "zod";

export const ReviewVerdictSchema = z.enum([
  "pass",
  "micro_fix",
  "targeted_repair",
  "advisory",
]);

export const ReviewIssueSchema = z.object({
  severity: z.enum(["low", "medium", "high"]),
  evidence: z.string().min(1).max(800),
  target: z.string().max(400).optional(),
  suggestedOperation: z.string().max(800).optional(),
});

export const ReviewDecisionSchema = z.object({
  verdict: ReviewVerdictSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1).max(600),
  reasoning: z.string().max(4000).optional().default(""),
  issues: z.array(ReviewIssueSchema).max(12).default([]),
});

export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;
export type ReviewIssue = z.infer<typeof ReviewIssueSchema>;
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;

export type LiveReviewScreenshotSet = {
  desktopUrl: string | null;
  mobileUrl: string | null;
  previousDesktopUrl?: string | null;
  previousMobileUrl?: string | null;
};

export type ProductDomSummary = {
  title: string | null;
  headings: string[];
  ctaLabels: string[];
  imageCount: number;
  formCount: number;
};

export type ReviewFinding = {
  code: string;
  message: string;
};

export type ReviewBundle = {
  versionId: string;
  parentVersionId: string | null;
  userRequest: string;
  briefSummary: string;
  changedFiles: string[];
  screenshots: LiveReviewScreenshotSet;
  consoleErrors: string[];
  nextOverlayErrors: string[];
  failedRequests: string[];
  findings: ReviewFinding[];
  domSummary: ProductDomSummary | null;
};

export type LiveReviewSkipReason =
  | "flag_off"
  | "grant_off"
  | "edit_off"
  | "missing_revision"
  | "cost_capped"
  | "claim_busy"
  | "postcheck_skipped"
  | "preview_not_ready"
  | "preview_unreadable"
  | "runtime_crash"
  | "followup_no_sensor"
  | "no_screenshots"
  | "model_unavailable"
  | "invalid_model_output"
  | "review_error";

export type LiveReviewResult =
  | { status: "completed"; decision: ReviewDecision; durationMs: number; modelId: string }
  | { status: "skipped"; reason: LiveReviewSkipReason; detail?: string };

export const SAFE_FALLBACK_DECISION: ReviewDecision = {
  verdict: "advisory",
  confidence: 0,
  rationale: "Modellen gav ett ogiltigt svar. Ingen automatisk åtgärd.",
  reasoning: "",
  issues: [],
};

export function parseReviewDecision(raw: unknown): ReviewDecision {
  const parsed = ReviewDecisionSchema.safeParse(raw);
  return parsed.success ? parsed.data : SAFE_FALLBACK_DECISION;
}

/**
 * Null on schema failure instead of the sentinel. `runLiveReview` needs the
 * explicit signal: a REAL advisory decision with confidence 0 and no issues is
 * schema-valid and must complete, not be shape-matched into
 * `invalid_model_output` (bugbot medium, 2026-08-19).
 */
export function tryParseReviewDecision(raw: unknown): ReviewDecision | null {
  const parsed = ReviewDecisionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
