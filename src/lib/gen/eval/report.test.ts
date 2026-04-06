import { describe, expect, it } from "vitest";
import { formatEvalReport } from "./report";
import type { EvalReport } from "./runner";

describe("formatEvalReport", () => {
  it("prints blocking failure summary when blockers exist", () => {
    const report: EvalReport = {
      timestamp: "2026-04-03T12:00:00.000Z",
      model: "gpt-5.4",
      results: [
        {
          promptId: "coffee-shop",
          generationTimeMs: 900,
          fileCount: 4,
          checks: [],
          totalScore: 0.6,
          passed: false,
          blockingChecks: ["tier2-readiness"],
        },
      ],
      summary: {
        total: 1,
        passed: 0,
        avgScore: 0.6,
        avgTimeMs: 900,
        blockingFailures: 1,
        blockingCheckCounts: {
          "tier2-readiness": 1,
        },
      },
    };

    const output = formatEvalReport(report);
    expect(output).toContain("Blocking failures: 1/1");
    expect(output).toContain("Top blockers: tier2-readiness (1)");
  });
});
