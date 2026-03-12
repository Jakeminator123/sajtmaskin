import path from "node:path";
import type { TemplateLibraryEntry } from "../src/lib/gen/template-library/types";
import { writeJson } from "./template-library-discovery";

export interface ScaffoldCandidateRecord {
  id: string;
  title: string;
  categorySlug: string;
  categoryName: string;
  verdict: TemplateLibraryEntry["verdict"];
  qualityScore: number;
  relevance_score: number;
  relevance_tier: "high" | "medium" | "low";
  summary: string;
  templateUrl: string;
  demoUrl: string | null;
  recommendedScaffoldFamilies: string[];
  strengths: string[];
  weaknesses: string[];
  representativeFiles: Array<{
    path: string;
    reason: string;
  }>;
}

export interface ScaffoldCandidateReportFile {
  _meta: {
    generated: string;
    source: string;
    input: string | null;
    total: number;
    high: number;
    medium: number;
    ignored: number;
  };
  high_priority: ScaffoldCandidateRecord[];
  medium_priority: ScaffoldCandidateRecord[];
  low_priority_ignored: Array<{
    id: string;
    title: string;
    slug: string;
    reason: string;
  }>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeRelevanceScore(entry: TemplateLibraryEntry): number {
  let score = entry.qualityScore;
  if (entry.verdict === "valid") score += 4;
  if (entry.repo.hasNext) score += 3;
  if (entry.repo.hasAppDir || entry.repo.hasSrcAppDir) score += 2;
  score += Math.min(6, entry.selectedFiles.length * 1.5);
  score += Math.min(4, entry.strengths.length);
  score += Math.min(3, entry.recommendedScaffoldFamilies.length);
  if (entry.repo.isMonorepo) score -= 6;
  score -= Math.min(12, entry.weaknesses.length * 3);
  return clamp(score, 0, 100);
}

function computeTier(entry: TemplateLibraryEntry, relevanceScore: number): "high" | "medium" | "low" {
  if (entry.verdict === "valid" && relevanceScore >= 88) return "high";
  if (
    !["bad_repo_link", "non_next_template", "missing_repo"].includes(entry.verdict) &&
    relevanceScore >= 68
  ) {
    return "medium";
  }
  return "low";
}

function buildCandidateRecord(entry: TemplateLibraryEntry): ScaffoldCandidateRecord {
  const relevanceScore = computeRelevanceScore(entry);
  return {
    id: entry.id,
    title: entry.title,
    categorySlug: entry.categorySlug,
    categoryName: entry.categoryName,
    verdict: entry.verdict,
    qualityScore: entry.qualityScore,
    relevance_score: relevanceScore,
    relevance_tier: computeTier(entry, relevanceScore),
    summary: entry.summary,
    templateUrl: entry.templateUrl,
    demoUrl: entry.demoUrl,
    recommendedScaffoldFamilies: entry.recommendedScaffoldFamilies,
    strengths: entry.strengths.slice(0, 4),
    weaknesses: entry.weaknesses.slice(0, 4),
    representativeFiles: entry.selectedFiles.slice(0, 4).map((file) => ({
      path: file.path,
      reason: file.reason,
    })),
  };
}

export function buildScaffoldCandidateReport(
  entries: TemplateLibraryEntry[],
  options?: {
    source?: string;
    input?: string | null;
  },
): ScaffoldCandidateReportFile {
  const ranked = entries
    .map(buildCandidateRecord)
    .sort((a, b) => {
      if (b.relevance_score !== a.relevance_score) return b.relevance_score - a.relevance_score;
      return b.qualityScore - a.qualityScore || a.title.localeCompare(b.title);
    });

  const high = ranked.filter((entry) => entry.relevance_tier === "high");
  const medium = ranked.filter((entry) => entry.relevance_tier === "medium");
  const low = ranked.filter((entry) => entry.relevance_tier === "low");

  return {
    _meta: {
      generated: new Date().toISOString(),
      source: options?.source ?? "scripts/scaffold-candidate-report.ts",
      input: options?.input ?? null,
      total: ranked.length,
      high: high.length,
      medium: medium.length,
      ignored: low.length,
    },
    high_priority: high,
    medium_priority: medium,
    low_priority_ignored: low.map((entry) => ({
      id: entry.id,
      title: entry.title,
      slug: entry.id,
      reason: entry.weaknesses[0] ?? "Lower research priority for runtime scaffold promotion",
    })),
  };
}

export function writeScaffoldCandidateReport(
  entries: TemplateLibraryEntry[],
  options?: {
    outputPath?: string;
    source?: string;
    input?: string | null;
  },
): { outputPath: string; report: ScaffoldCandidateReportFile } {
  const outputPath = options?.outputPath ?? path.resolve(process.cwd(), "data", "scaffold-candidates-curated.json");
  const report = buildScaffoldCandidateReport(entries, {
    source: options?.source,
    input: options?.input,
  });
  writeJson(outputPath, report);
  return { outputPath, report };
}
