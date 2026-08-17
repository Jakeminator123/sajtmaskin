import { describe, expect, it } from "vitest";
import {
  hasMeaningfulBaselineChange,
  stripVolatileBaselineFields,
} from "./baseline-meaningful-change.mjs";

// Mirrors `EvalBaseline` in src/lib/gen/eval/baseline.ts. Declared locally so
// the test asserts on the shape the workflow actually compares, without
// importing app code into a plain-node script test.
type Baseline = {
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

function makeBaseline(overrides: Partial<Baseline> = {}): Baseline {
  return {
    timestamp: "2026-07-27T04:11:00.000Z",
    model: "gpt-5.4",
    results: [
      {
        promptId: "coffee-shop",
        totalScore: 92,
        passed: true,
        blockingChecks: [],
        fileCount: 21,
        generationTimeMs: 121_539,
      },
    ],
    summary: {
      total: 1,
      passed: 1,
      avgScore: 92,
      avgTimeMs: 121_539,
      blockingFailures: 0,
      blockingCheckCounts: {},
    },
    ...overrides,
  };
}

describe("baseline-meaningful-change", () => {
  // The whole point: without this, `git diff` is dirty on every run and a
  // repeated eval run would open a draft PR of nothing but wall-clock noise.
  it("treats a rerun with identical outcome but new timings as unchanged", () => {
    const previous = makeBaseline();
    const next = makeBaseline({
      timestamp: "2026-08-03T04:11:00.000Z",
      results: [{ ...makeBaseline().results[0], generationTimeMs: 98_004 }],
      summary: { ...makeBaseline().summary, avgTimeMs: 98_004 },
    });

    expect(hasMeaningfulBaselineChange(previous, next)).toBe(false);
  });

  it("detects a score change", () => {
    const next = makeBaseline();
    next.results[0].totalScore = 95;
    next.summary.avgScore = 95;

    expect(hasMeaningfulBaselineChange(makeBaseline(), next)).toBe(true);
  });

  it("detects a pass -> fail flip", () => {
    const next = makeBaseline();
    next.results[0].passed = false;
    next.summary.passed = 0;

    expect(hasMeaningfulBaselineChange(makeBaseline(), next)).toBe(true);
  });

  it("detects a new blocking check", () => {
    const next = makeBaseline();
    next.results[0].blockingChecks = ["preflight_env"];
    next.summary.blockingCheckCounts = { preflight_env: 1 };

    expect(hasMeaningfulBaselineChange(makeBaseline(), next)).toBe(true);
  });

  it("detects a model change", () => {
    expect(
      hasMeaningfulBaselineChange(makeBaseline(), makeBaseline({ model: "gpt-5.5" })),
    ).toBe(true);
  });

  it("detects an added or removed prompt", () => {
    const next = makeBaseline();
    next.results.push({ ...makeBaseline().results[0], promptId: "dog-daycare" });
    next.summary.total = 2;

    expect(hasMeaningfulBaselineChange(makeBaseline(), next)).toBe(true);
  });

  it("keeps every non-timing field in the comparable projection", () => {
    const stripped = stripVolatileBaselineFields(makeBaseline()) as Baseline;

    expect(stripped).not.toHaveProperty("timestamp");
    expect(stripped.results[0]).not.toHaveProperty("generationTimeMs");
    expect(stripped.summary).not.toHaveProperty("avgTimeMs");
    expect(stripped.results[0]).toMatchObject({
      promptId: "coffee-shop",
      totalScore: 92,
      passed: true,
      fileCount: 21,
    });
    expect(stripped.summary).toMatchObject({ total: 1, passed: 1, avgScore: 92 });
  });
});
