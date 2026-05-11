import { describe, expect, it } from "vitest";
import type { PreGenerationContractContext } from "../contract/pre-generation-contracts";
import type { RoutePlan } from "../route-plan";
import { inferQualityTarget } from "./policy-inference";
import type {
  BuildSpecGenerationMode,
  BuildSpecPreviewPolicy,
  RouteRealizationPolicy,
} from "./types";

const emptyContracts: PreGenerationContractContext = {
  contracts: {
    dataMode: "none",
    integrations: [],
    envVars: [],
  },
  unresolvedDecisions: [],
  confirmedAnswers: [],
};

const singleRoutePlan: RoutePlan = {
  provenance: { primarySource: "prompt", sources: ["prompt"] },
  siteType: "one-page",
  reason: "test",
  routes: [
    {
      path: "/",
      name: "Home",
      intent: "Primary landing page",
      required: true,
    },
  ],
};

const fullRouteRealization: RouteRealizationPolicy = {
  mode: "full",
  primaryRoutePath: "/",
  fullRoutePaths: ["/"],
  shellRoutePaths: [],
};

function inferQualityForPrompt(params: {
  prompt: string;
  generationMode?: BuildSpecGenerationMode;
  previewPolicy?: BuildSpecPreviewPolicy;
}) {
  return inferQualityTarget({
    prompt: params.prompt,
    buildIntent: "website",
    generationMode: params.generationMode ?? "init",
    resolvedScaffold: null,
    routePlan: singleRoutePlan,
    routeRealization: fullRouteRealization,
    preGenerationContracts: emptyContracts,
    previewPolicy: params.previewPolicy ?? "fidelity2",
  });
}

describe("inferQualityTarget prompt keyword promotion", () => {
  it("promotes Swedish visual ambition keywords to premium", () => {
    expect(
      inferQualityForPrompt({
        prompt: "Bygg en snygg landing page för en hifi-butik",
      }),
    ).toBe("premium");
  });

  it("keeps generic prompts on standard", () => {
    expect(inferQualityForPrompt({ prompt: "Site for accountants" })).toBe(
      "standard",
    );
  });

  it("promotes English premium keywords to premium", () => {
    expect(inferQualityForPrompt({ prompt: "Premium boutique store" })).toBe(
      "premium",
    );
  });

  it("does not allow keyword promotion on follow-up", () => {
    expect(
      inferQualityForPrompt({
        prompt: "Gör sidan snygg",
        generationMode: "followUp",
      }),
    ).toBe("standard");
  });

  it("lets F3 quality win over keyword promotion", () => {
    expect(
      inferQualityForPrompt({
        prompt: "Bygg en snygg landing page",
        previewPolicy: "fidelity3",
      }),
    ).toBe("release-candidate");
  });
});
