import { describe, expect, it } from "vitest";
import { computePlanModePlannerPrompts } from "./own-engine-plan-mode";

describe("computePlanModePlannerPrompts", () => {
  it("concatenates preamble, separator, and enrichment context", () => {
    const { planPreamble, planSystemPrompt } = computePlanModePlannerPrompts({
      dynamicContext: "DYNAMIC_CTX",
      resolvedScaffold: null,
    });
    expect(planPreamble.length).toBeGreaterThan(20);
    expect(planSystemPrompt).toContain(planPreamble);
    expect(planSystemPrompt).toContain("---");
    expect(planSystemPrompt).toContain("DYNAMIC_CTX");
  });
});
