/**
 * Scorecard system for the five Engine 7+ target categories.
 *
 * Maps individual eval checks to categories and computes aggregate
 * scores that can be used for regression gating.
 */

import type { CheckResult } from "./checks";

export type ScoreCategory =
  | "code-quality"
  | "integrations"
  | "orchestration"
  | "autofix"
  | "streaming-ux";

export interface CategoryScore {
  category: ScoreCategory;
  label: string;
  score: number;
  target: number;
  passed: boolean;
  checks: CheckResult[];
}

export interface Scorecard {
  timestamp: string;
  categories: CategoryScore[];
  overallScore: number;
  allTargetsMet: boolean;
}

const CATEGORY_LABELS: Record<ScoreCategory, string> = {
  "code-quality": "Genererad kodkvalitet",
  integrations: "Integrationshantering",
  orchestration: "Plan/orchestration",
  autofix: "Feldetektering/autofix",
  "streaming-ux": "Streaming UX/transparens",
};

const CATEGORY_TARGET = 0.7;

const CHECK_TO_CATEGORY: Record<string, ScoreCategory> = {
  "file-count": "code-quality",
  "required-files": "code-quality",
  exports: "code-quality",
  imports: "code-quality",
  syntax: "autofix",
  responsive: "code-quality",
  accessibility: "code-quality",
  "semantic-tokens": "code-quality",
  generation: "code-quality",
  "integration-detection": "integrations",
  "env-var-coverage": "integrations",
  "provider-guide": "integrations",
  "plan-structure": "orchestration",
  "plan-blockers": "orchestration",
  "plan-steps": "orchestration",
  "autofix-improvement": "autofix",
  "multi-pass": "autofix",
  "validation-passes": "autofix",
  "streaming-events": "streaming-ux",
  "progress-visibility": "streaming-ux",
  "tool-call-rendering": "streaming-ux",
};

export function buildScorecard(checks: CheckResult[]): Scorecard {
  const byCategory = new Map<ScoreCategory, CheckResult[]>();
  for (const category of Object.keys(CATEGORY_LABELS) as ScoreCategory[]) {
    byCategory.set(category, []);
  }

  for (const check of checks) {
    const cat = CHECK_TO_CATEGORY[check.name] ?? "code-quality";
    byCategory.get(cat)?.push(check);
  }

  const categories: CategoryScore[] = [];
  for (const [category, catChecks] of byCategory.entries()) {
    const score =
      catChecks.length > 0
        ? catChecks.reduce((sum, c) => sum + c.score, 0) / catChecks.length
        : 0;

    categories.push({
      category,
      label: CATEGORY_LABELS[category],
      score,
      target: CATEGORY_TARGET,
      passed: score >= CATEGORY_TARGET,
      checks: catChecks,
    });
  }

  const overallScore =
    categories.length > 0
      ? categories.reduce((sum, c) => sum + c.score, 0) / categories.length
      : 0;

  return {
    timestamp: new Date().toISOString(),
    categories,
    overallScore,
    allTargetsMet: categories.every((c) => c.passed),
  };
}

export function formatScorecardReport(card: Scorecard): string {
  const lines: string[] = [
    `# Engine Scorecard — ${card.timestamp}`,
    "",
    `Overall: ${(card.overallScore * 10).toFixed(1)}/10 ${card.allTargetsMet ? "PASS" : "FAIL"}`,
    "",
    "| Category | Score | Target | Status |",
    "|----------|-------|--------|--------|",
  ];

  for (const cat of card.categories) {
    const status = cat.passed ? "PASS" : "FAIL";
    lines.push(
      `| ${cat.label} | ${(cat.score * 10).toFixed(1)}/10 | ${(cat.target * 10).toFixed(1)}/10 | ${status} |`,
    );
  }

  lines.push("", "## Detail");
  for (const cat of card.categories) {
    lines.push(``, `### ${cat.label}`);
    if (cat.checks.length === 0) {
      lines.push("_No checks in this category yet._");
      continue;
    }
    for (const check of cat.checks) {
      const icon = check.passed ? "[OK]" : "[!!]";
      lines.push(`- ${icon} ${check.name}: ${check.message} (${(check.score * 100).toFixed(0)}%)`);
    }
  }

  return lines.join("\n");
}
