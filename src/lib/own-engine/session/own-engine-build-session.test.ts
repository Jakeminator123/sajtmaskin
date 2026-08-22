import { describe, expect, it } from "vitest";
import type { PromptStrategyMeta } from "@/lib/builder/prompt-orchestration";
import type { BuildSpec } from "@/lib/gen/build-spec";
import type { OrchestrationBase } from "@/lib/gen/orchestrate";
import {
  buildFollowUpBriefFromSnapshot,
  buildPersistedOrchestrationSnapshot,
} from "@/lib/gen/orchestration-snapshot";
import { buildOwnEngineGenerationStreamMeta } from "./own-engine-build-session";

const strategyMeta: PromptStrategyMeta = {
  strategy: "direct",
  promptType: "freeform",
  promptSource: "user",
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
  scaffoldId: null,
  routePlanSummary: "prompt:one-page:/",
  stylePack: "brand-led",
  qualityTarget: "standard",
  previewPolicy: "fidelity2",
  verificationPolicy: "standard",
  contextPolicy: "normal",
  referenceCategories: ["marketing-sites"],
  forbiddenPatterns: ["leave_bracket_placeholders"],
  tokenBudgets: {
    scaffoldChars: 48_000,
    refsChars: 24_000,
    systemContextChars: 96_000,
  },
};

function minimalOrchestrationBase(): OrchestrationBase {
  return {
    resolvedScaffold: null,
    orchestrationContract: {
      scaffoldToRoute: {
        scaffoldId: null,
        routeSource: "prompt",
        plannedRoutes: [],
        requiredRoutePaths: [],
      },
      generationToValidate: {
        requiredRoutePaths: [],
        requiredFiles: ["app/layout.tsx", "app/page.tsx"],
        previewPolicy: "fidelity2",
        verificationPolicy: "standard",
        qualityTarget: "standard",
      },
    },
    scaffoldContext: undefined,
    routePlan: {
      provenance: { primarySource: "prompt", sources: ["prompt"] },
      siteType: "one-page",
      reason: "t",
      routes: [],
    },
    preGenerationContracts: {
      contracts: {
        dataMode: "none",
        integrations: [],
        envVars: [],
      },
      unresolvedDecisions: [],
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
      needsCalendar: false,
      needsCommandSearch: false,
      needsThemeToggle: false,
    },
    buildSpec,
    serializeMode: null,
    uiRecipes: [],
    dossierRequestedCapabilities: [],
    capabilityHints: undefined,
    scaffoldVariantId: null,
    capabilityModifyHint: null,
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

  it("carries the exact follow-up base version into finalize telemetry", () => {
    const meta = buildOwnEngineGenerationStreamMeta({
      ...common,
      routeVariant: "follow-up",
      baseVersionId: "ver_selected",
    });

    expect(meta.baseVersionId).toBe("ver_selected");
  });

  it("uses canonical requested dossier capabilities, not selected dossier capabilities", () => {
    const meta = buildOwnEngineGenerationStreamMeta({
      ...common,
      routeVariant: "follow-up",
      orchestrationBase: {
        ...common.orchestrationBase,
        dossierRequestedCapabilities: ["payments", "unknown-capability"],
        dossierSelection: {
          poolSize: 19,
          byCapability: { payments: ["stripe-checkout"] },
          selected: [
            {
              configured: false,
              reason: "capability-match",
              entry: {
                class: "hard",
                id: "stripe-checkout",
                label: "Stripe Checkout",
                capability: "payments",
                codeFidelity: "verbatim",
                complexity: "medium",
                defaultForCapability: true,
                summary: "Hosted Stripe Checkout.",
                lastVerified: "2026-04-20",
              },
            },
          ],
        },
      },
    });

    expect(meta.selectedDossierIds).toEqual(["stripe-checkout"]);
    expect(meta.requestedCapabilities).toEqual(["payments", "unknown-capability"]);
  });

  it("persists removal signals and shrinks stale brief capabilities", () => {
    const meta = buildOwnEngineGenerationStreamMeta({
      ...common,
      routeVariant: "follow-up",
      metaBriefApplied: true,
      metaBrief: {
        projectTitle: "Butik",
        requestedCapabilities: ["payments", "auth"],
      },
      orchestrationBase: {
        ...common.orchestrationBase,
        dossierRequestedCapabilities: ["auth"],
        removedCapabilities: ["payments"],
        removedDossierIds: ["stripe-checkout"],
        f3ApprovedCapabilities: ["auth"],
        f3ApprovedProviders: ["clerk"],
      },
    });

    expect(meta.removedCapabilities).toEqual(["payments"]);
    expect(meta.removedDossierIds).toEqual(["stripe-checkout"]);
    expect(meta.f3ApprovedCapabilities).toEqual(["auth"]);
    expect(meta.f3ApprovedProviders).toEqual(["clerk"]);
    expect(meta.briefSummary).toMatchObject({
      requestedCapabilities: ["auth"],
    });
  });

  it("persists brief design values for follow-up snapshot rehydration", () => {
    const meta = buildOwnEngineGenerationStreamMeta({
      ...common,
      routeVariant: "new-chat",
      chatPrivacy: "private",
      scaffoldLabel: null,
      metaBriefApplied: true,
      metaBrief: {
        projectTitle: "Hotel Solskenet",
        brandName: "Solskenet",
        domainProfile: "hospitality",
        motionLevel: "lively",
        qualityBar: "premium",
        designIntent: {
          explicitAxes: ["style", "palette"],
          explicitFields: ["palette.primary", "palette.background", "palette.text"],
        },
        toneAndVoice: ["varm", "välkomnande"],
        visualDirection: {
          styleKeywords: ["warm", "editorial"],
          colorMode: "light",
          colorPalette: {
            primary: "#f59e0b",
            background: "#fff7ed",
            text: "#1f1308",
          },
          typography: {
            headings: "serif editorial",
            body: "humanist sans",
          },
        },
      },
    });

    expect(meta.briefSummary).toMatchObject({
      projectTitle: "Hotel Solskenet",
      brandName: "Solskenet",
      domainProfile: { domain: "hospitality" },
      motionLevel: "lively",
      qualityBar: "premium",
      toneKeywords: ["varm", "välkomnande"],
      styleKeywords: ["warm", "editorial"],
      colorMode: "light",
      explicitDesignAxes: ["style", "palette"],
      explicitDesignFields: ["palette.primary", "palette.background", "palette.text"],
      colorPalette: {
        primary: "#f59e0b",
        background: "#fff7ed",
        text: "#1f1308",
      },
      typography: {
        headings: "serif editorial",
        body: "humanist sans",
      },
    });
  });

  it("round-trips Deep Brief identity and explicit design fields into the next follow-up", () => {
    const streamMeta = buildOwnEngineGenerationStreamMeta({
      ...common,
      routeVariant: "new-chat",
      chatPrivacy: "private",
      scaffoldLabel: null,
      metaBriefApplied: true,
      metaBrief: {
        projectTitle: "Hotel Solskenet",
        brandName: "Solskenet",
        domainProfile: "hospitality",
        motionLevel: "lively",
        qualityBar: "premium",
        toneAndVoice: ["varm", "välkomnande"],
        designIntent: {
          explicitAxes: ["style", "palette", "typography"],
          explicitFields: [
            "palette.primary",
            "palette.background",
            "palette.text",
            "typography.headings",
          ],
        },
        visualDirection: {
          styleKeywords: ["warm", "editorial"],
          colorMode: "light",
          colorPalette: {
            primary: "#f59e0b",
            background: "#fff7ed",
            text: "#1f1308",
          },
          typography: {
            headings: "serif editorial",
            body: "humanist sans",
          },
        },
      },
    });
    const persisted = buildPersistedOrchestrationSnapshot({
      streamMeta,
      versionId: "ver_init",
      chatId: "chat_1",
      buildIntent: "website",
    });

    expect(persisted).toMatchObject({
      lastVersionId: "ver_init",
      lastChatId: "chat_1",
      briefApplied: true,
    });
    expect(buildFollowUpBriefFromSnapshot(persisted)).toEqual({
      domainProfile: "hospitality",
      projectTitle: "Hotel Solskenet",
      brandName: "Solskenet",
      visualDirection: {
        styleKeywords: ["warm", "editorial"],
        colorMode: "light",
        colorPalette: {
          primary: "#f59e0b",
          background: "#fff7ed",
          text: "#1f1308",
        },
        typography: {
          headings: "serif editorial",
          body: "humanist sans",
        },
      },
      toneAndVoice: ["varm", "välkomnande"],
      designIntent: {
        explicitAxes: ["style", "palette", "typography"],
        explicitFields: [
          "palette.primary",
          "palette.background",
          "palette.text",
          "typography.headings",
        ],
      },
      qualityBar: "premium",
      motionLevel: "lively",
    });
  });

  it("preserves the difference between legacy provenance and an explicit empty axis list", () => {
    const legacy = buildOwnEngineGenerationStreamMeta({
      ...common,
      routeVariant: "follow-up",
      metaBriefApplied: true,
      metaBrief: { projectTitle: "Legacy" },
    });
    const provenanceAware = buildOwnEngineGenerationStreamMeta({
      ...common,
      routeVariant: "follow-up",
      metaBriefApplied: true,
      metaBrief: {
        projectTitle: "Ny",
        designIntent: { explicitAxes: [], explicitFields: [] },
      },
    });

    expect(legacy.briefSummary).not.toHaveProperty("explicitDesignAxes");
    expect(provenanceAware.briefSummary).toHaveProperty("explicitDesignAxes", []);
    expect(provenanceAware.briefSummary).toHaveProperty("explicitDesignFields", []);
  });

  it("carries a non-empty source receipt and omits an empty one", () => {
    const sources = [
      {
        kind: "dossier" as const,
        id: "stripe-checkout",
        origin: "hard",
        reason: "capability-match (payments)",
        authority: "krav" as const,
        reachedPrompt: true,
      },
    ];
    const withSources = buildOwnEngineGenerationStreamMeta({
      ...common,
      routeVariant: "follow-up",
      sources,
    });
    expect(withSources.sources).toEqual(sources);

    const withoutSources = buildOwnEngineGenerationStreamMeta({
      ...common,
      routeVariant: "follow-up",
    });
    expect(withoutSources).not.toHaveProperty("sources");
  });
});
