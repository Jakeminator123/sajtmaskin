import { describe, expect, it } from "vitest";

import type { FollowUpCapabilityDetection } from "@/lib/builder/follow-up-capability-detection";

import {
  buildFollowUpOrchestrationInput,
  type BuildFollowUpOrchestrationInputParams,
} from "./follow-up-orchestration-input";
import type { ParsedChatRequestMeta } from "./parse-chat-request-meta";

const CODEGEN_ONLY_KEYS = [
  "persistedVariantId",
  "contractAnswers",
  "customInstructions",
  "chatId",
  "followUpIntent",
  "priorQualityTarget",
  "requestKind",
] as const;

function emptyCapabilityDetection(): FollowUpCapabilityDetection {
  return {
    capabilities: [],
    capabilityIds: [],
    tierByCapability: {},
    wordCount: 0,
    referencesExistingCapability: false,
    modifyReferenceMatches: [],
  };
}

function detectedCapabilityFixture(): FollowUpCapabilityDetection {
  return {
    capabilities: [
      { capability: "visual-3d", tier: "specific", matchedKeywords: ["3d-kub"] },
    ],
    capabilityIds: ["visual-3d"],
    tierByCapability: { "visual-3d": "specific" },
    wordCount: 6,
    referencesExistingCapability: false,
    modifyReferenceMatches: [],
  };
}

function followUpMeta(): Pick<
  ParsedChatRequestMeta,
  | "brief"
  | "themeColors"
  | "palette"
  | "designThemePreset"
  | "scaffoldMode"
  | "scaffoldId"
  | "lifecycleStage"
> {
  return {
    brief: { requestedCapabilities: ["payments"] },
    themeColors: null,
    palette: null,
    designThemePreset: null,
    scaffoldMode: "auto",
    scaffoldId: null,
    lifecycleStage: "design",
  };
}

function baseParams(
  overrides: Partial<BuildFollowUpOrchestrationInputParams> = {},
): BuildFollowUpOrchestrationInputParams {
  return {
    mode: "plan",
    optimizedMessage: "wrapped follow-up message",
    message: "user follow-up text",
    buildIntent: "website",
    parsedMeta: followUpMeta(),
    resolvedImageGenerations: false,
    designReferences: [],
    persistedScaffoldId: "landing-page",
    previousFilesCount: 12,
    hasFollowUpBase: true,
    ignorePersistedScaffoldForMatch: false,
    promptStrategyMeta: { strategy: "direct", promptType: "followup_general" },
    existingRoutePaths: ["/"],
    existingShellRoutePaths: [],
    followUpCapabilityDetection: emptyCapabilityDetection(),
    followUpIntent: "neutral",
    orchestrationSnapshot: null,
    engineModelId: "gpt-5.4",
    persistedVariantId: "minimalist-mag",
    contractAnswers: [],
    customInstructions: "Be brief.",
    chatId: "chat_test_1",
    priorQualityTarget: "standard",
    requestKind: null,
    ...overrides,
  };
}

describe("buildFollowUpOrchestrationInput — plan/codegen parity", () => {
  it("plan-mode produces all common fields and no codegen-only fields", () => {
    const planInput = buildFollowUpOrchestrationInput(baseParams({ mode: "plan" }));

    for (const key of CODEGEN_ONLY_KEYS) {
      expect(
        Object.prototype.hasOwnProperty.call(planInput, key),
        `plan-mode should not set ${key}`,
      ).toBe(false);
    }

    expect(planInput.prompt).toBe("wrapped follow-up message");
    expect(planInput.rawPrompt).toBe("user follow-up text");
    expect(planInput.routePlanPrompt).toBe("user follow-up text");
    expect(planInput.scaffoldMatchPrompt).toBe("user follow-up text");
    expect(planInput.contractsPrompt).toBe("user follow-up text");
    expect(planInput.capabilitiesPrompt).toBe("user follow-up text");
    expect(planInput.buildIntent).toBe("website");
    expect(planInput.scaffoldMode).toBe("auto");
    expect(planInput.scaffoldId).toBeNull();
    expect(planInput.persistedScaffoldId).toBe("landing-page");
    expect(planInput.previousFilesCount).toBe(12);
    expect(planInput.generationMode).toBe("followUp");
    expect(planInput.lifecycleStage).toBe("design");
    expect(planInput.engineModelId).toBe("gpt-5.4");
  });

  it("codegen-mode mirrors plan-mode common fields exactly", () => {
    const planInput = buildFollowUpOrchestrationInput(baseParams({ mode: "plan" }));
    const codegenInput = buildFollowUpOrchestrationInput(baseParams({ mode: "codegen" }));

    for (const key of Object.keys(planInput) as Array<keyof typeof planInput>) {
      expect(
        codegenInput[key],
        `codegen-mode should mirror plan-mode for common field ${String(key)}`,
      ).toEqual(planInput[key]);
    }
  });

  it("codegen-only fields appear only in codegen-mode output", () => {
    const codegenInput = buildFollowUpOrchestrationInput(
      baseParams({ mode: "codegen" }),
    );

    expect(codegenInput.persistedVariantId).toBe("minimalist-mag");
    expect(codegenInput.contractAnswers).toEqual([]);
    expect(codegenInput.customInstructions).toBe("Be brief.");
    expect(codegenInput.chatId).toBe("chat_test_1");
    expect(codegenInput.followUpIntent).toBe("neutral");
    expect(codegenInput.priorQualityTarget).toBe("standard");
    expect(codegenInput.requestKind).toBeNull();
  });

  it("plan and codegen agree on dossier capability bridge fields", () => {
    const detection = detectedCapabilityFixture();
    const planInput = buildFollowUpOrchestrationInput(
      baseParams({ mode: "plan", followUpCapabilityDetection: detection }),
    );
    const codegenInput = buildFollowUpOrchestrationInput(
      baseParams({ mode: "codegen", followUpCapabilityDetection: detection }),
    );

    expect(planInput.requestedDossierCapabilities).toEqual(["visual-3d"]);
    expect(codegenInput.requestedDossierCapabilities).toEqual(["visual-3d"]);
    expect(planInput.requestedCapabilityTiers).toEqual({ "visual-3d": "specific" });
    expect(codegenInput.requestedCapabilityTiers).toEqual({ "visual-3d": "specific" });
    expect(planInput.capabilityModifyHint).toBeNull();
    expect(codegenInput.capabilityModifyHint).toBeNull();
  });

  it("capability-modify intent suppresses dossier injection on both modes", () => {
    const detection: FollowUpCapabilityDetection = {
      ...detectedCapabilityFixture(),
      referencesExistingCapability: true,
      modifyReferenceMatches: ["pricken"],
    };
    const params = baseParams({
      followUpCapabilityDetection: detection,
      followUpIntent: "capability-modify",
    });

    const planInput = buildFollowUpOrchestrationInput({ ...params, mode: "plan" });
    const codegenInput = buildFollowUpOrchestrationInput({ ...params, mode: "codegen" });

    expect(planInput.requestedDossierCapabilities).toBeUndefined();
    expect(codegenInput.requestedDossierCapabilities).toBeUndefined();
    expect(planInput.capabilityModifyHint).toEqual({
      capabilityIds: ["visual-3d"],
      references: ["pricken"],
    });
    expect(codegenInput.capabilityModifyHint).toEqual({
      capabilityIds: ["visual-3d"],
      references: ["pricken"],
    });
  });

  it("hasFollowUpBase=false suppresses follow-up-only signals on both modes", () => {
    const params = baseParams({
      hasFollowUpBase: false,
      persistedScaffoldId: "blog",
    });

    const planInput = buildFollowUpOrchestrationInput({ ...params, mode: "plan" });
    const codegenInput = buildFollowUpOrchestrationInput({ ...params, mode: "codegen" });

    expect(planInput.generationMode).toBeUndefined();
    expect(codegenInput.generationMode).toBeUndefined();
    expect(planInput.isFirstCodeGeneration).toBe(true);
    expect(codegenInput.isFirstCodeGeneration).toBe(true);
    expect(planInput.capabilities).toBeUndefined();
    expect(codegenInput.capabilities).toBeUndefined();
    expect(codegenInput.followUpIntent).toBeUndefined();
  });
});
