import type { EvalReport } from "./runner";

export type EvalBaseline = {
  timestamp: string;
  model: string;
  results: Array<{
    promptId: string;
    totalScore: number;
    passed: boolean;
    blockingChecks: string[];
    fileCount: number;
    generationTimeMs: number;
  }>;
  summary: {
    total: number;
    passed: number;
    avgScore: number;
    avgTimeMs: number;
    blockingFailures: number;
    blockingCheckCounts: Record<string, number>;
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
      blockingChecks: r.blockingChecks,
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
  passRegressions: Array<{
    promptId: string;
    baselinePassed: boolean;
    currentPassed: boolean;
  }>;
  passImprovements: Array<{
    promptId: string;
    baselinePassed: boolean;
    currentPassed: boolean;
  }>;
  blockingCheckRegressions: Array<{
    promptId: string;
    added: string[];
  }>;
  blockingCheckImprovements: Array<{
    promptId: string;
    removed: string[];
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
  const passRegressions: Array<{
    promptId: string;
    baselinePassed: boolean;
    currentPassed: boolean;
  }> = [];
  const passImprovements: Array<{
    promptId: string;
    baselinePassed: boolean;
    currentPassed: boolean;
  }> = [];
  const blockingCheckRegressions: Array<{
    promptId: string;
    added: string[];
  }> = [];
  const blockingCheckImprovements: Array<{
    promptId: string;
    removed: string[];
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

    if (baselineResult.passed && !current.passed) {
      passRegressions.push({
        promptId,
        baselinePassed: baselineResult.passed,
        currentPassed: current.passed,
      });
    } else if (!baselineResult.passed && current.passed) {
      passImprovements.push({
        promptId,
        baselinePassed: baselineResult.passed,
        currentPassed: current.passed,
      });
    }

    const baselineBlocking = new Set(baselineResult.blockingChecks ?? []);
    const currentBlocking = new Set(current.blockingChecks ?? []);
    const added = [...currentBlocking].filter((check) => !baselineBlocking.has(check));
    const removed = [...baselineBlocking].filter((check) => !currentBlocking.has(check));

    if (added.length > 0) {
      blockingCheckRegressions.push({ promptId, added });
    }
    if (removed.length > 0) {
      blockingCheckImprovements.push({ promptId, removed });
    }
  }

  const overallDelta = baseline.summary.avgScore > 0
    ? (report.summary.avgScore - baseline.summary.avgScore) / baseline.summary.avgScore
    : 0;

  const avgScoreDrop10 = overallDelta <= -0.1;
  const avgScoreDrop5 = overallDelta <= -0.05;
  const promptsRegress20 = regressions.filter((r) => r.delta <= -0.2).length > 2;
  const anyPromptRegress15 = regressions.some((r) => r.delta <= -0.15);
  const anyPassRegression = passRegressions.length > 0;
  const anyBlockingRegression = blockingCheckRegressions.length > 0;

  let gateResult: "pass" | "fail" | "warning" = "pass";
  if (anyPassRegression || avgScoreDrop10 || promptsRegress20) {
    gateResult = "fail";
  } else if (anyBlockingRegression || avgScoreDrop5 || anyPromptRegress15) {
    gateResult = "warning";
  }

  return {
    regressions,
    improvements,
    passRegressions,
    passImprovements,
    blockingCheckRegressions,
    blockingCheckImprovements,
    overallDelta,
    gateResult,
  };
}
