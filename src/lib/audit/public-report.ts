/**
 * Public contract for the `/analys` lead magnet.
 *
 * `AuditResult` is the internal product shape and carries things an anonymous
 * caller must not get: `site_content` / `color_theme` / `template_data` (a
 * ready-to-use generation payload), `budget_estimate`, competitor analysis and
 * per-run cost. Returning it verbatim turns `/analys` into a free structured
 * scraping-and-prompt API, so the route projects it down to this type instead.
 *
 * Everything here is what the public report actually renders. Strings and
 * arrays are capped so one hostile target site cannot inflate the response.
 */

import type { AuditMode, AuditResult, Improvement } from "@/types/audit";

const PUBLIC_SCORE_KEYS = [
  "seo",
  "technical_seo",
  "ux",
  "content",
  "performance",
  "accessibility",
  "security",
  "mobile",
] as const;

export type PublicScoreKey = (typeof PUBLIC_SCORE_KEYS)[number];

const MAX_TEXT = 600;
const MAX_LIST = 6;
const MAX_IMPROVEMENTS = 8;

export type PublicImprovement = {
  item: string;
  impact: Improvement["impact"];
  effort: Improvement["effort"];
  category?: Improvement["category"];
  why?: string;
  how?: string;
};

export type PublicAnalysReport = {
  company?: string;
  domain?: string;
  timestamp?: string;
  audit_mode?: AuditMode;
  industry?: string;
  audit_scores?: Partial<Record<PublicScoreKey, number>>;
  audience?: {
    primary_segment?: string;
    demographics?: string;
    pain_points?: string;
    customer_needs?: string[];
  };
  seo?: {
    foundation?: string;
    key_pages?: string[];
    conversion_paths?: string[];
  };
  strengths?: string[];
  issues?: string[];
  improvements?: PublicImprovement[];
  quick_wins?: string[];
  major_projects?: string[];
  expected_outcomes?: string[];
  technical?: {
    https_status?: string;
    headers_analysis?: string;
    recommendations?: { area: string; recommendation: string }[];
  };
  data_quality?: {
    pages_sampled?: number;
    aggregated_word_count?: number;
    is_js_rendered?: boolean;
    used_fallback?: boolean;
  };
};

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_TEXT ? `${trimmed.slice(0, MAX_TEXT - 1)}…` : trimmed;
}

function list(value: unknown, limit = MAX_LIST): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value
    .map((entry) => text(entry))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, limit);
  return cleaned.length > 0 ? cleaned : undefined;
}

function scores(value: AuditResult["audit_scores"]): PublicAnalysReport["audit_scores"] {
  if (!value) return undefined;
  const out: Partial<Record<PublicScoreKey, number>> = {};
  for (const key of PUBLIC_SCORE_KEYS) {
    const score = value[key];
    if (typeof score !== "number" || Number.isNaN(score)) continue;
    out[key] = Math.max(0, Math.min(100, Math.round(score)));
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function improvements(value: AuditResult["improvements"]): PublicImprovement[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const impactRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  // Marketing/Content before Tech: a small-business owner reading a free
  // report acts on message and visibility long before header hardening.
  const categoryRank: Record<string, number> = {
    Marketing: 0,
    Content: 0,
    UX: 1,
    Tech: 2,
    Security: 3,
  };

  const cleaned = value
    .filter((item): item is Improvement => Boolean(item) && typeof item.item === "string")
    .map((item) => {
      const projected: PublicImprovement = {
        item: text(item.item) ?? "",
        impact: item.impact === "high" || item.impact === "medium" ? item.impact : "low",
        effort: item.effort === "low" || item.effort === "medium" ? item.effort : "high",
      };
      const category = item.category;
      if (category) projected.category = category;
      const why = text(item.why);
      if (why) projected.why = why;
      const how = text(item.how);
      if (how) projected.how = how;
      return projected;
    })
    .filter((item) => item.item.length > 0)
    .sort((a, b) => {
      const byCategory =
        (categoryRank[a.category ?? ""] ?? 2) - (categoryRank[b.category ?? ""] ?? 2);
      if (byCategory !== 0) return byCategory;
      return (impactRank[a.impact] ?? 3) - (impactRank[b.impact] ?? 3);
    })
    .slice(0, MAX_IMPROVEMENTS);

  return cleaned.length > 0 ? cleaned : undefined;
}

function technical(result: AuditResult): PublicAnalysReport["technical"] {
  const recommendations = Array.isArray(result.technical_recommendations)
    ? result.technical_recommendations
        .map((rec) => ({
          area: text(rec?.area),
          recommendation: text(rec?.recommendation),
        }))
        .filter(
          (rec): rec is { area: string; recommendation: string } =>
            Boolean(rec.area) && Boolean(rec.recommendation),
        )
        .slice(0, 3)
    : undefined;

  const out: NonNullable<PublicAnalysReport["technical"]> = {};
  const https = text(result.security_analysis?.https_status);
  if (https) out.https_status = https;
  const headers = text(result.security_analysis?.headers_analysis);
  if (headers) out.headers_analysis = headers;
  if (recommendations && recommendations.length > 0) out.recommendations = recommendations;
  return Object.keys(out).length > 0 ? out : undefined;
}

function pruned<T extends object>(value: T): T | undefined {
  return Object.keys(value).length > 0 ? value : undefined;
}

/**
 * Project an internal `AuditResult` onto the public `/analys` contract.
 * Unknown or oversized model output is dropped, never forwarded.
 */
export function toPublicAnalysReport(
  result: AuditResult,
  meta?: { usedFallback?: boolean },
): PublicAnalysReport {
  const report: PublicAnalysReport = {};

  const company = text(result.company);
  if (company) report.company = company;
  const domain = text(result.domain);
  if (domain) report.domain = domain;
  if (typeof result.timestamp === "string") report.timestamp = result.timestamp;
  if (result.audit_mode === "basic" || result.audit_mode === "advanced") {
    report.audit_mode = result.audit_mode;
  }
  const industry = text(result.business_profile?.industry);
  if (industry) report.industry = industry;

  const auditScores = scores(result.audit_scores);
  if (auditScores) report.audit_scores = auditScores;

  const audience = pruned({
    ...(text(result.customer_segments?.primary_segment)
      ? { primary_segment: text(result.customer_segments?.primary_segment) }
      : {}),
    ...(text(result.target_audience_analysis?.demographics)
      ? { demographics: text(result.target_audience_analysis?.demographics) }
      : {}),
    ...(text(result.target_audience_analysis?.pain_points)
      ? { pain_points: text(result.target_audience_analysis?.pain_points) }
      : {}),
    ...(list(result.customer_segments?.customer_needs, 4)
      ? { customer_needs: list(result.customer_segments?.customer_needs, 4) }
      : {}),
  });
  if (audience) report.audience = audience;

  const seo = pruned({
    ...(text(result.content_strategy?.seo_foundation)
      ? { foundation: text(result.content_strategy?.seo_foundation) }
      : {}),
    ...(list(result.content_strategy?.key_pages, 5)
      ? { key_pages: list(result.content_strategy?.key_pages, 5) }
      : {}),
    ...(list(result.content_strategy?.conversion_paths, 3)
      ? { conversion_paths: list(result.content_strategy?.conversion_paths, 3) }
      : {}),
  });
  if (seo) report.seo = seo;

  const strengths = list(result.strengths, 5);
  if (strengths) report.strengths = strengths;
  const issues = list(result.issues, 5);
  if (issues) report.issues = issues;

  const projectedImprovements = improvements(result.improvements);
  if (projectedImprovements) report.improvements = projectedImprovements;

  const quickWins = list(result.priority_matrix?.quick_wins, 4);
  if (quickWins) report.quick_wins = quickWins;
  const majorProjects = list(result.priority_matrix?.major_projects, 3);
  if (majorProjects) report.major_projects = majorProjects;
  const outcomes = list(result.expected_outcomes, 4);
  if (outcomes) report.expected_outcomes = outcomes;

  const tech = technical(result);
  if (tech) report.technical = tech;

  const dataQuality = pruned({
    ...(typeof result.scrape_summary?.pages_sampled === "number"
      ? { pages_sampled: result.scrape_summary.pages_sampled }
      : {}),
    ...(typeof result.scrape_summary?.aggregated_word_count === "number"
      ? { aggregated_word_count: result.scrape_summary.aggregated_word_count }
      : {}),
    ...(typeof result.scrape_summary?.is_js_rendered === "boolean"
      ? { is_js_rendered: result.scrape_summary.is_js_rendered }
      : {}),
    ...(meta?.usedFallback ? { used_fallback: true } : {}),
  });
  if (dataQuality) report.data_quality = dataQuality;

  return report;
}
