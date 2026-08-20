import { describe, expect, it } from "vitest";

import type { FollowUpCapabilityDetection } from "@/lib/builder/follow-up-capability-detection";
import { FOCUS_POINT_MARKER } from "@/lib/builder/focus-point-prompt";
import { buildImportedRepoBaselineSnapshot } from "@/lib/templates/imported-repo-contract";

import {
  buildFollowUpOrchestrationInput,
  type BuildFollowUpOrchestrationInputParams,
} from "./follow-up-orchestration-input";
import type { ParsedChatRequestMeta } from "./parse-chat-request-meta";

const CODEGEN_ONLY_KEYS = [
  "persistedVariantId",
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
    capabilities: [{ capability: "visual-3d", tier: "specific", matchedKeywords: ["3d-kub"] }],
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
  | "pageCountHint"
  | "styleKeywordsHint"
  | "toneKeywordsHint"
  | "styleChoiceHint"
  | "colorModeHint"
  | "complexityHint"
  | "buildIntentExplicit"
> {
  return {
    brief: { requestedCapabilities: ["payments"] },
    themeColors: null,
    palette: null,
    designThemePreset: null,
    scaffoldMode: "auto",
    scaffoldId: null,
    lifecycleStage: "design",
    pageCountHint: null,
    styleKeywordsHint: [],
    toneKeywordsHint: [],
    styleChoiceHint: null,
    colorModeHint: null,
    complexityHint: null,
    buildIntentExplicit: false,
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

  it("strips focus-point appendix from routePlanPrompt but keeps it on rawPrompt", () => {
    const message = [
      'Skapa en ny sida som ska heta "Bilder".',
      "",
      FOCUS_POINT_MARKER,
      "- Punkt 1: x=10.0%, y=5.0%",
      "  - Träff-text: PORTFOLIO",
    ].join("\n");
    const planInput = buildFollowUpOrchestrationInput(
      baseParams({ mode: "plan", message, optimizedMessage: message }),
    );

    expect(planInput.rawPrompt).toContain(FOCUS_POINT_MARKER);
    expect(planInput.rawPrompt).toContain("PORTFOLIO");
    expect(planInput.routePlanPrompt).toBe('Skapa en ny sida som ska heta "Bilder".');
    expect(planInput.routePlanPrompt).not.toContain("PORTFOLIO");
    expect(planInput.routePlanPrompt).not.toContain(FOCUS_POINT_MARKER);
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
    const codegenInput = buildFollowUpOrchestrationInput(baseParams({ mode: "codegen" }));

    expect(codegenInput.persistedVariantId).toBe("minimalist-mag");
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

  it("forwards approved F3 providers as dossierProviderHints (Codex P1 #445)", () => {
    const withProviders = buildFollowUpOrchestrationInput(
      baseParams({
        mode: "codegen",
        additionalDossierCapabilities: ["database"],
        approvedProviders: ["mongodb"],
      }),
    );
    expect(withProviders.requestedDossierCapabilities).toEqual(["database"]);
    expect(withProviders.dossierProviderHints).toEqual(["mongodb"]);

    const withoutProviders = buildFollowUpOrchestrationInput(
      baseParams({ mode: "codegen", approvedProviders: null }),
    );
    expect(withoutProviders.dossierProviderHints).toBeUndefined();

    const emptyProviders = buildFollowUpOrchestrationInput(
      baseParams({ mode: "codegen", approvedProviders: [] }),
    );
    expect(emptyProviders.dossierProviderHints).toBeUndefined();
  });

  it("reuses the exact dossier id persisted by the Bygg integrationer transition", () => {
    const input = buildFollowUpOrchestrationInput(
      baseParams({
        mode: "codegen",
        parsedMeta: { ...followUpMeta(), lifecycleStage: "integrations" },
        orchestrationSnapshot: {
          f3ApprovedCapabilities: ["auth"],
          f3ApprovedProviders: ["supabase-auth"],
        },
      }),
    );

    expect(input.dossierProviderHints).toEqual(["supabase-auth"]);
    expect(input.followUpContract?.f3ApprovedProviders).toEqual(["supabase-auth"]);
  });

  it("importedRepoMode forces scaffoldMode off and threads the flag (v0-template follow-ups)", () => {
    const params = baseParams({ importedRepoMode: true });

    const planInput = buildFollowUpOrchestrationInput({ ...params, mode: "plan" });
    const codegenInput = buildFollowUpOrchestrationInput({ ...params, mode: "codegen" });

    for (const input of [planInput, codegenInput]) {
      expect(input.scaffoldMode).toBe("off");
      expect(input.scaffoldId).toBeNull();
      expect(input.importedRepoMode).toBe(true);
    }

    // Default (non-imported) keeps the requested scaffold mode.
    const normalInput = buildFollowUpOrchestrationInput(baseParams({ mode: "codegen" }));
    expect(normalInput.scaffoldMode).toBe("auto");
    expect(normalInput.importedRepoMode).toBe(false);
  });

  it("derives the same baseline/current repo contract for plan and codegen", () => {
    const importedFiles = [
      {
        path: "package.json",
        content: JSON.stringify({
          scripts: { dev: "next dev", build: "next build" },
          dependencies: { next: "16.2.10", react: "19.2.7" },
          packageManager: "pnpm@11.0.0",
        }),
        language: "json",
      },
      {
        path: "src/app/page.tsx",
        content: "export default function Page() { return null }",
        language: "tsx",
      },
      { path: "pnpm-lock.yaml", content: "lockfileVersion: '9.0'", language: "yaml" },
    ];
    const baseline = buildImportedRepoBaselineSnapshot({
      files: importedFiles,
      origin: { kind: "v0_template", templateId: "tmpl_1" },
      versionId: "version_1",
      filesRevision: "revision_1",
      capturedAt: "2026-08-12T08:00:00.000Z",
    });
    const currentFiles = [
      ...importedFiles,
      {
        path: "src/app/about/page.tsx",
        content: "export default function About() { return null }",
        language: "tsx",
      },
    ];
    const params = baseParams({
      importedRepoMode: true,
      previousFiles: currentFiles,
      previousFilesCount: currentFiles.length,
      orchestrationSnapshot: { importedRepoBaseline: baseline },
    });

    const planInput = buildFollowUpOrchestrationInput({ ...params, mode: "plan" });
    const codegenInput = buildFollowUpOrchestrationInput({ ...params, mode: "codegen" });

    expect(planInput.importedRepoContractContext).toEqual(codegenInput.importedRepoContractContext);
    expect(planInput.importedRepoContractContext?.baseline?.versionId).toBe("version_1");
    expect(planInput.importedRepoContractContext?.current.structure.routes).toContain("/about");
    expect(planInput.importedRepoContractContext?.current.contractHash).not.toBe(
      baseline.contract.contractHash,
    );
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

  it("forwards Byggval hints on first codegen after plan/contract (!hasFollowUpBase)", () => {
    const params = baseParams({
      hasFollowUpBase: false,
      persistedScaffoldId: "landing-page",
      parsedMeta: {
        ...followUpMeta(),
        pageCountHint: 2,
        styleKeywordsHint: ["minimal", "clean"],
        toneKeywordsHint: ["professional"],
        styleChoiceHint: "minimal",
        colorModeHint: "dark",
        complexityHint: "simple",
        buildIntentExplicit: true,
      },
    });

    const codegenInput = buildFollowUpOrchestrationInput({ ...params, mode: "codegen" });
    expect(codegenInput.pageCountHint).toBe(2);
    expect(codegenInput.styleKeywordsHint).toEqual(["minimal", "clean"]);
    expect(codegenInput.toneKeywordsHint).toEqual(["professional"]);
    expect(codegenInput.styleChoiceHint).toBe("minimal");
    expect(codegenInput.colorModeHint).toBe("dark");
    expect(codegenInput.complexityHint).toBe("simple");
    expect(codegenInput.buildIntentExplicit).toBe(true);

    const withBase = buildFollowUpOrchestrationInput(
      baseParams({
        hasFollowUpBase: true,
        parsedMeta: {
          ...followUpMeta(),
          pageCountHint: 2,
          styleChoiceHint: "minimal",
          buildIntentExplicit: true,
        },
      }),
    );
    expect(withBase.pageCountHint).toBeUndefined();
    expect(withBase.styleChoiceHint).toBeUndefined();
    expect(withBase.buildIntentExplicit).toBeUndefined();
  });

  it("forwards requestAttachments so the source receipt can see the vision cap", () => {
    const requestAttachments = [
      { url: "https://cdn.example.com/user-1.jpg", mimeType: "image/jpeg" },
    ];
    const input = buildFollowUpOrchestrationInput(baseParams({ requestAttachments }));
    expect(input.requestAttachments).toEqual(requestAttachments);
  });
});
