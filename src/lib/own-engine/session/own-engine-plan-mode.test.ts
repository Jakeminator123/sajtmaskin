import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT_SEPARATOR } from "@/lib/gen/system-prompt";
import { computePlanModePlannerPrompts } from "./own-engine-plan-mode";

describe("computePlanModePlannerPrompts", () => {
  it("concatenates preamble, separator, and enrichment context", () => {
    const { planPreamble, planSystemPrompt } = computePlanModePlannerPrompts({
      dynamicContext: "DYNAMIC_CTX",
      resolvedScaffold: null,
    });
    expect(planPreamble.length).toBeGreaterThan(20);
    expect(planSystemPrompt).toBe(`${planPreamble}${SYSTEM_PROMPT_SEPARATOR}DYNAMIC_CTX`);
  });
});
