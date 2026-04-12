import { describe, expect, it } from "vitest";
import { resolveOwnEngineMaxSteps } from "./resolve-max-steps";
import type { BuildSpec } from "@/lib/gen/build-spec";

function spec(partial: Partial<BuildSpec> & Pick<BuildSpec, "changeScope" | "contextPolicy">): BuildSpec {
  return {
    buildIntent: "website",
    generationMode: "followUp",
    scaffoldId: "landing-page",
    routePlanSummary: "prompt:one-page:/",
    stylePack: "brand-led",
    qualityTarget: "standard",
    previewPolicy: "fidelity2",
    verificationPolicy: "fast",
    referenceCategories: [],
    forbiddenPatterns: [],
    tokenBudgets: { scaffoldChars: 36_000, refsChars: 12_000, systemContextChars: 48_000 },
    ...partial,
  };
}

describe("resolveOwnEngineMaxSteps", () => {
  it("uses 4 steps for first-generation style calls", () => {
    expect(
      resolveOwnEngineMaxSteps({
        buildSpec: spec({ changeScope: "redesign", contextPolicy: "heavy" }),
        userMessage: "anything",
        isFollowUp: false,
      }),
    ).toBe(4);
  });

  it("bumps to 5 for heavy follow-up context policy", () => {
    expect(
      resolveOwnEngineMaxSteps({
        buildSpec: spec({ changeScope: "copy", contextPolicy: "heavy" }),
        userMessage: "tiny tweak",
        isFollowUp: true,
      }),
    ).toBe(5);
  });

  it("bumps to 5 for design-heavy user wording", () => {
    expect(
      resolveOwnEngineMaxSteps({
        buildSpec: spec({ changeScope: "copy", contextPolicy: "light" }),
        userMessage: "New hero, animations, and color system on the landing page.",
        isFollowUp: true,
      }),
    ).toBe(5);
  });
});
