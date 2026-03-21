import { describe, expect, it } from "vitest";
import {
  briefQualifiesForExpansion,
  measureBriefSignalStrength,
  shouldAttemptBriefExpansion,
} from "./promptBriefExpander";

describe("measureBriefSignalStrength", () => {
  it("sums nested string content", () => {
    const strength = measureBriefSignalStrength({
      a: "hello",
      b: { c: "world" },
      d: ["x", "yy"],
    });
    expect(strength).toBe(5 + 5 + 1 + 2);
  });
});

describe("briefQualifiesForExpansion", () => {
  it("rejects empty brief", () => {
    expect(briefQualifiesForExpansion(null)).toBe(false);
    expect(briefQualifiesForExpansion({})).toBe(false);
  });

  it("accepts brief with enough text", () => {
    const filler = "x".repeat(60);
    expect(briefQualifiesForExpansion({ projectTitle: filler })).toBe(true);
  });
});

describe("shouldAttemptBriefExpansion", () => {
  const brief = { projectTitle: "x".repeat(60) };

  it("requires initial build turn", () => {
    expect(
      shouldAttemptBriefExpansion({
        message: "short",
        brief,
        strategy: "direct",
        initialBuildTurn: false,
      }),
    ).toBe(false);
  });

  it("requires direct strategy", () => {
    expect(
      shouldAttemptBriefExpansion({
        message: "short",
        brief,
        strategy: "summarize",
        initialBuildTurn: true,
      }),
    ).toBe(false);
  });

  it("skips when promptAssistDeep is true", () => {
    expect(
      shouldAttemptBriefExpansion({
        message: "short",
        brief,
        strategy: "direct",
        initialBuildTurn: true,
        meta: { promptAssistDeep: true },
      }),
    ).toBe(false);
  });

  it("skips long user messages", () => {
    expect(
      shouldAttemptBriefExpansion({
        message: "x".repeat(1000),
        brief,
        strategy: "direct",
        initialBuildTurn: true,
      }),
    ).toBe(false);
  });
});
