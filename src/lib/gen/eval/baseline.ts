import type { EvalReport } from "./runner";

export type EvalBaseline = {
  timestamp: string;
  model: string;
  results: Array<{
    promptId: string;
    totalScore: number;
    passed: boolean;
    fileCount: number;
    generationTimeMs: number;
  }>;
  summary: {
    total: number;
    passed: number;
    avgScore: number;
    avgTimeMs: number;
  };
};

export async function saveBaseline(report: EvalReport): Promise<void> {
  const fs = await import("fs/promises");
  const path = await import("path");
  const baseline: EvalBaseline = {
    timestamp: report.timestamp,
    model: report.model,
    results: report.results.map((r) => ({
      promptId: r.promptId,
      totalScore: r.totalScore,
      passed: r.passed,
      fileCount: r.fileCount,
      generationTimeMs: r.generationTimeMs,
    })),
    summary: report.summary,
  };
  const filePath = path.join(process.cwd(), "src/lib/gen/eval/eval-baseline.json");
  await fs.writeFile(filePath, JSON.stringify(baseline, null, 2), "utf-8");
}

export async function loadBaseline(): Promise<EvalBaseline | null> {
  const fs = await import("fs/promises");
  const path = await import("path");
  const filePath = path.join(process.cwd(), "src/lib/gen/eval/eval-baseline.json");
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as EvalBaseline;
  } catch {
    return null;
  }
}

export function compareWithBaseline(
  report: EvalReport,
  baseline: EvalBaseline,
): {
  regressions: Array<{
    promptId: string;
    baselineScore: number;
    currentScore: number;
    delta: number;
  }>;
  improvements: Array<{
    promptId: string;
    baselineScore: number;
    currentScore: number;
    delta: number;
  }>;
  overallDelta: number;
  gateResult: "pass" | "fail" | "warning";
} {
  const baselineByPrompt = new Map(baseline.results.map((r) => [r.promptId, r]));
  const currentByPrompt = new Map(report.results.map((r) => [r.promptId, r]));

  const regressions: Array<{
    promptId: string;
    baselineScore: number;
    currentScore: number;
    delta: number;
  }> = [];
  const improvements: Array<{
    promptId: string;
    baselineScore: number;
    currentScore: number;
    delta: number;
  }> = [];

  for (const [promptId, baselineResult] of baselineByPrompt) {
    const current = currentByPrompt.get(promptId);
    if (!current) continue;

    const delta = current.totalScore - baselineResult.totalScore;
    if (delta < 0) {
      regressions.push({
        promptId,
        baselineScore: baselineResult.totalScore,
        currentScore: current.totalScore,
        delta,
      });
    } else if (delta > 0) {
      improvements.push({
        promptId,
        baselineScore: baselineResult.totalScore,
        currentScore: current.totalScore,
        delta,
      });
    }
  }

  const overallDelta = baseline.summary.avgScore > 0
    ? (report.summary.avgScore - baseline.summary.avgScore) / baseline.summary.avgScore
    : 0;

  const avgScoreDrop10 = overallDelta <= -0.1;
  const avgScoreDrop5 = overallDelta <= -0.05;
  const promptsRegress20 = regressions.filter((r) => r.delta <= -0.2).length > 2;
  const anyPromptRegress15 = regressions.some((r) => r.delta <= -0.15);

  let gateResult: "pass" | "fail" | "warning" = "pass";
  if (avgScoreDrop10 || promptsRegress20) {
    gateResult = "fail";
  } else if (avgScoreDrop5 || anyPromptRegress15) {
    gateResult = "warning";
  }

  return {
    regressions,
    improvements,
    overallDelta,
    gateResult,
  };
}
