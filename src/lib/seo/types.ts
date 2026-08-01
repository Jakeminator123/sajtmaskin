/**
 * SEO publish pass — the shared vocabulary.
 *
 * The chain is deliberately explicit: an audit produces FINDINGS, findings
 * drive IMPROVEMENTS, and the report is derived from the improvements that
 * actually changed a file plus a re-audit of the result. Nothing in the report
 * comes from intent — only from a real before/after difference.
 */

/** Stable finding ids. Used by the improver to decide what it can fix. */
export type SeoFindingId =
  | "missing-metadata"
  | "missing-title"
  | "title-too-short"
  | "title-too-long"
  | "missing-description"
  | "description-too-short"
  | "description-too-long"
  | "missing-metadata-base"
  | "missing-canonical"
  | "missing-open-graph"
  | "missing-robots"
  | "missing-sitemap"
  | "placeholder-site-url"
  | "missing-h1"
  | "multiple-h1"
  | "image-missing-alt"
  | "missing-html-lang"
  | "missing-structured-data";

export type SeoSeverity = "critical" | "important" | "advisory";

export interface SeoFinding {
  id: SeoFindingId;
  severity: SeoSeverity;
  /** File the finding is about, or `"project"` for whole-project findings. */
  file: string;
  /** One sentence, in Swedish, aimed at the site owner rather than a developer. */
  message: string;
  /**
   * `true` when the improver has a deterministic (or LLM-backed) fix for this
   * exact finding. The report separates fixed from merely reported, and a
   * finding nobody can act on must not read as a promise.
   */
  fixable: boolean;
}

export interface SeoAuditResult {
  findings: SeoFinding[];
  /** 0-100. Not a Lighthouse score — a weighted count of what we check. */
  score: number;
  /** Pages the audit actually inspected, for "we looked at N pages" copy. */
  pagesInspected: string[];
}

/** One applied change, traceable back to the finding that motivated it. */
export interface SeoImprovement {
  findingId: SeoFindingId;
  file: string;
  /** Swedish, past tense: what changed. */
  change: string;
  /** How the change was produced. */
  by: "deterministic" | "llm";
}

export interface SeoPublishReport {
  /** Audit of the files as they were before the pass. */
  before: SeoAuditResult;
  /** Audit of the files the deploy will actually ship. */
  after: SeoAuditResult;
  /** Only changes whose file content genuinely differs. */
  improvements: SeoImprovement[];
  /** Findings still open after the pass — honest about what was not fixed. */
  remaining: SeoFinding[];
  /** Set when the optional LLM copy pass could not run. */
  llmSkippedReason: string | null;
}
