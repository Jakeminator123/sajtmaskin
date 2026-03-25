import { describe, expect, it } from "vitest";
import type { PromptStrategyMeta } from "@/lib/builder/promptOrchestration";
import type { OrchestrationBase } from "@/lib/gen/orchestrate";
import { buildOwnEngineGenerationStreamMeta } from "./own-engine-build-session";

const strategyMeta: PromptStrategyMeta = {
  strategy: "direct",
  promptType: "freeform",
  budgetTarget: 1000,
  originalLength: 10,
  optimizedLength: 10,
  reductionRatio: 0,
  reason: "test",
  phaseHints: [],
  complexityScore: 0,
  wasChanged: false,
};

function minimalOrchestrationBase(): OrchestrationBase {
  return {
    resolvedScaffold: null,
    scaffoldContext: undefined,
    routePlan: { source: "prompt", siteType: "one-page", reason: "t", routes: [] },
    preGenerationContracts: {
      contracts: {
        dataMode: "none",
        integrations: [],
        envVars: [],
      },
      unresolvedDecisions: [],
      confirmedAnswers: [],
    },
    capabilities: {
      needsMotion: false,
      needs3D: false,
      needsCharts: false,
      needsDatabase: false,
      needsAuth: false,
      needsAppShell: false,
      needsDataUI: false,
      needsForms: false,
      needsEcommerce: false,
      needsCarousel: false,
      needsPremiumVisuals: false,
    },
    scaffoldAndCapability: "",
  };
}

const common = {
  engineModel: "test-model",
  resolvedModelTier: "max" as const,
  buildProfileId: "bp",
  buildProfileLabel: "Max",
  resolvedThinking: true,
  resolvedImageGenerations: true,
  strategyMeta,
  orchestrationBase: minimalOrchestrationBase(),
  engineSystemPromptLength: 42,
  metaBriefApplied: false,
  customInstructionsLength: 0,
  scaffoldId: "sc1",
  scaffoldFamily: "fam",
};

describe("buildOwnEngineGenerationStreamMeta", () => {
  it("adds chatPrivacy and scaffoldLabel for new-chat", () => {
    const meta = buildOwnEngineGenerationStreamMeta({
      ...common,
      routeVariant: "new-chat",
      chatPrivacy: "private",
      scaffoldLabel: "Label",
    });
    expect(meta.chatPrivacy).toBe("private");
    expect(meta.scaffoldLabel).toBe("Label");
    expect(meta.enginePath).toBe("own-engine");
    expect(meta.contractDataMode).toBe("none");
  });

  it("omits chatPrivacy and scaffoldLabel for follow-up", () => {
    const meta = buildOwnEngineGenerationStreamMeta({
      ...common,
      routeVariant: "follow-up",
    });
    expect("chatPrivacy" in meta).toBe(false);
    expect("scaffoldLabel" in meta).toBe(false);
  });
});
