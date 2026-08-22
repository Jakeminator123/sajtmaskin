import { describe, expect, it } from "vitest";

import type { PreGenerationContractContext } from "../contract/pre-generation-contracts";
import type { RoutePlan } from "../route-plan";
import { inferChangeScope } from "./policy-inference";

const emptyContracts: PreGenerationContractContext = {
  contracts: {
    dataMode: "none",
    integrations: [],
    envVars: [],
  },
  unresolvedDecisions: [],
};

const singleRoutePlan: RoutePlan = {
  provenance: { primarySource: "prompt", sources: ["prompt"] },
  siteType: "one-page",
  reason: "test",
  routes: [
    {
      path: "/",
      name: "Home",
      intent: "Primary page",
      required: true,
    },
  ],
};

describe("inferChangeScope — classified redesign intent", () => {
  it("uses the wider classifier vocabulary for a whole-site redesign", () => {
    expect(
      inferChangeScope({
        prompt: "Modernisera hela sajten och ge den ett nytt visuellt uttryck",
        generationMode: "followUp",
        routePlan: singleRoutePlan,
        preGenerationContracts: emptyContracts,
        followUpIntent: "clear-redesign",
      }),
    ).toBe("redesign");
  });

  it.each([
    "Byt till mörkt tema",
    "Ny stil på hero",
    "Ändra bakgrunden till coolare",
    "Redesign the hero section",
  ])("keeps a targeted clear-redesign local: %s", (prompt) => {
    expect(
      inferChangeScope({
        prompt,
        generationMode: "followUp",
        routePlan: singleRoutePlan,
        preGenerationContracts: emptyContracts,
        followUpIntent: "clear-redesign",
      }),
    ).toBe("local-layout");
  });

  it("lets an explicit whole-project cue override targeted words", () => {
    expect(
      inferChangeScope({
        prompt: "Gör om hela sajten med mörkt tema och en ny hero",
        generationMode: "followUp",
        routePlan: singleRoutePlan,
        preGenerationContracts: emptyContracts,
        followUpIntent: "clear-redesign",
      }),
    ).toBe("redesign");
  });

  it("does not promote a regular refine intent to full redesign", () => {
    expect(
      inferChangeScope({
        prompt: "Modernisera hero-sektionen",
        generationMode: "followUp",
        routePlan: singleRoutePlan,
        preGenerationContracts: emptyContracts,
        followUpIntent: "clear-refine",
      }),
    ).toBe("local-layout");
  });
});
