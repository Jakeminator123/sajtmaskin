import { describe, expect, it } from "vitest";
import type { PromptStrategyMeta } from "@/lib/builder/promptOrchestration";
import type { BuildSpec } from "@/lib/gen/build-spec";
import type { OrchestrationBase } from "@/lib/gen/orchestrate";
import {
  buildOwnEngineGenerationStreamMeta,
  buildPreGenerationContractGateParams,
} from "./own-engine-build-session";

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

const buildSpec: BuildSpec = {
  buildIntent: "website",
  generationMode: "init",
  changeScope: "redesign",
  scaffoldFamily: null,
  routePlanSummary: "prompt:one-page:/",
  stylePack: "brand-led",
  qualityTarget: "standard",
  previewPolicy: "fidelity2",
  verificationPolicy: "standard",
  contextPolicy: "normal",
  referenceCategories: ["marketing-sites"],
  forbiddenPatterns: ["leave_bracket_placeholders"],
  tokenBudgets: {
    scaffoldChars: 20_000,
    refsChars: 8_000,
    systemContextChars: 28_000,
  },
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
    buildSpec,
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
  buildSpec,
  metaBriefApplied: false,
  customInstructionsLength: 0,
  scaffoldId: "sc1",
  scaffoldFamily: "fam",
};

const minimalClarification = {
  kind: "scope" as const,
  question: "Test?",
  options: [] as string[],
  blocking: true,
  reason: "test",
};

describe("buildPreGenerationContractGateParams", () => {
  it("includes new-chat-only SSE keys", () => {
    const orch = minimalOrchestrationBase();
    const p = buildPreGenerationContractGateParams({
      routeVariant: "new-chat",
      sseChatId: "c1",
      assistantMessageId: "m1",
      contractClarification: minimalClarification,
      preGenerationContracts: orch.preGenerationContracts,
      engineModel: "test-model",
      resolvedModelTier: "max",
      buildProfileId: "bp",
      buildProfileLabel: "Max",
      resolvedThinking: true,
      resolvedImageGenerations: true,
      resolvedScaffold: null,
      strategyMeta,
      buildSpec,
      metaBriefApplied: false,
      customInstructionsLength: 0,
      chatPrivacy: "private",
      scaffoldLabel: null,
      capabilities: orch.capabilities,
    });
    expect(p.chatPrivacy).toBe("private");
    expect(p.scaffoldLabel).toBeNull();
    expect(p.capabilities).toEqual(orch.capabilities);
    expect(p.sseChatId).toBe("c1");
  });

  it("omits new-chat-only keys for follow-up", () => {
    const orch = minimalOrchestrationBase();
    const p = buildPreGenerationContractGateParams({
      routeVariant: "follow-up",
      sseChatId: "c2",
      assistantMessageId: null,
      contractClarification: minimalClarification,
      preGenerationContracts: orch.preGenerationContracts,
      engineModel: "test-model",
      resolvedModelTier: "max",
      buildProfileId: "bp",
      buildProfileLabel: "Max",
      resolvedThinking: true,
      resolvedImageGenerations: true,
      resolvedScaffold: null,
      strategyMeta,
      buildSpec,
      metaBriefApplied: false,
      customInstructionsLength: 0,
    });
    expect("chatPrivacy" in p).toBe(false);
    expect("scaffoldLabel" in p).toBe(false);
    expect("capabilities" in p).toBe(false);
  });
});

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
    expect(meta.buildSpec).toEqual(buildSpec);
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
