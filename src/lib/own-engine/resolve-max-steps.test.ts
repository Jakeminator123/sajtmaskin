import { describe, expect, it } from "vitest";
import { resolveOwnEngineMaxSteps } from "./resolve-max-steps";
import type { BuildSpec } from "@/lib/gen/build-spec";

function spec(partial: Partial<BuildSpec> & Pick<BuildSpec, "changeScope" | "contextPolicy">): BuildSpec {
  return {
    buildIntent: "website",
    generationMode: "followUp",
    scaffoldFamily: "landing-page",
    routePlanSummary: "prompt:one-page:/",
    stylePack: "brand-led",
    qualityTarget: "standard",
    previewPolicy: "fidelity2",
    verificationPolicy: "fast",
    referenceCategories: [],
    forbiddenPatterns: [],
    tokenBudgets: { scaffoldChars: 12_000, refsChars: 4_000, systemContextChars: 18_000 },
    ...partial,
  };
}

describe("resolveOwnEngineMaxSteps", () => {
  it("uses 2 steps for first-generation style calls", () => {
    expect(
      resolveOwnEngineMaxSteps({
        buildSpec: spec({ changeScope: "redesign", contextPolicy: "heavy" }),
        userMessage: "anything",
        isFollowUp: false,
      }),
    ).toBe(2);
  });

  it("bumps to 3 for heavy follow-up context policy", () => {
    expect(
      resolveOwnEngineMaxSteps({
        buildSpec: spec({ changeScope: "copy", contextPolicy: "heavy" }),
        userMessage: "tiny tweak",
        isFollowUp: true,
      }),
    ).toBe(3);
  });

  it("bumps to 3 for design-heavy user wording", () => {
    expect(
      resolveOwnEngineMaxSteps({
        buildSpec: spec({ changeScope: "copy", contextPolicy: "light" }),
        userMessage: "New hero, animations, and color system on the landing page.",
        isFollowUp: true,
      }),
    ).toBe(3);
  });
});
