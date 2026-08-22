import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InferredCapabilities } from "../capability-inference";
import type { FollowUpIntentMode } from "../follow-up-intent-types";
import { mergePersistedOrchestrationSnapshots } from "../orchestration-snapshot";
import { VARIANT_TEMPLATE_STYLE_REFERENCE_PURPOSE } from "../request-metadata";
import type { VariantTemplateInspiration } from "../scaffold-variants";
import { SCAFFOLD_OFF_BASELINE_ID } from "../scaffolds/types";

const inspirationMocks = vi.hoisted(() => {
  const fixture: VariantTemplateInspiration = {
    templateId: "k3-redesign-fixture",
    title: "K3 Redesign Fixture",
    category: "landing-pages",
    archiveUrl: "https://cdn.example.com/k3.zip",
    stillImageUrl: "https://cdn.example.com/k3-still.png",
    structuralReferences: [
      {
        path: "app/page.tsx",
        language: "tsx",
        reason: "primary-page",
        excerpt: "export default function Page() { return <main />; }",
      },
    ],
  };
  return {
    fixture,
    resolveVariantTemplateInspiration: vi.fn(async () => fixture),
  };
});

vi.mock("../system-prompt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../system-prompt")>();
  return {
    ...actual,
    composeEngineSystemPrompt: (dynamicContext: string) => dynamicContext,
  };
});

vi.mock("../data/shadcn-ui-recipes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/shadcn-ui-recipes")>();
  return { ...actual, resolveShadcnUiRecipes: vi.fn(async () => []) };
});

vi.mock("../scaffold-variants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../scaffold-variants")>();
  return {
    ...actual,
    resolveVariantTemplateInspiration: inspirationMocks.resolveVariantTemplateInspiration,
  };
});

import {
  finalizeOrchestrationPrompts,
  shouldResolveVariantTemplateInspiration,
} from "./finalize-prompts";
import { resolveOrchestrationBase } from "./resolve-base";

const noCapabilities: InferredCapabilities = {
  needsMotion: false,
  needs3D: false,
  needsPhysics: false,
  needsParallax: false,
  needsPayments: false,
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
};

const REGULAR_FOLLOW_UP_INTENTS = [
  "clear-refine",
  "capability-add",
  "capability-modify",
  "neutral",
] as const satisfies readonly FollowUpIntentMode[];

function followUpInput(overrides: Record<string, unknown> = {}) {
  return {
    prompt: "Byt hero-rubriken till Välkommen",
    buildIntent: "website" as const,
    generationMode: "followUp" as const,
    followUpIntent: "clear-refine" as FollowUpIntentMode,
    persistedScaffoldId: "landing-page",
    persistedVariantId: "editorial-lux",
    previousFilesCount: 12,
    existingRoutePaths: ["/"],
    embeddingScaffoldMatch: false,
    capabilities: noCapabilities,
    ...overrides,
  };
}

async function finalizeFollowUp(overrides: Record<string, unknown> = {}) {
  const input = followUpInput(overrides);
  const base = await resolveOrchestrationBase(input);
  return finalizeOrchestrationPrompts(base, input);
}

describe("shouldResolveVariantTemplateInspiration", () => {
  it("matches init and clear-redesign, and stays closed for regular follow-ups", () => {
    expect(
      shouldResolveVariantTemplateInspiration({
        resolvedMode: "init",
        scaffoldId: "landing-page",
      }),
    ).toBe(true);
    expect(
      shouldResolveVariantTemplateInspiration({
        resolvedMode: "followUp",
        followUpIntent: "clear-redesign",
        scaffoldId: "landing-page",
      }),
    ).toBe(true);

    for (const followUpIntent of REGULAR_FOLLOW_UP_INTENTS) {
      expect(
        shouldResolveVariantTemplateInspiration({
          resolvedMode: "followUp",
          followUpIntent,
          scaffoldId: "landing-page",
        }),
      ).toBe(false);
    }
  });

  it("never resolves for Imported repo mode or Scaffold: Av", () => {
    expect(
      shouldResolveVariantTemplateInspiration({
        resolvedMode: "init",
        importedRepoMode: true,
        scaffoldId: "landing-page",
      }),
    ).toBe(false);
    expect(
      shouldResolveVariantTemplateInspiration({
        resolvedMode: "followUp",
        followUpIntent: "clear-redesign",
        importedRepoMode: true,
        scaffoldId: "landing-page",
      }),
    ).toBe(false);
    expect(
      shouldResolveVariantTemplateInspiration({
        resolvedMode: "init",
        scaffoldId: SCAFFOLD_OFF_BASELINE_ID,
      }),
    ).toBe(false);
    expect(
      shouldResolveVariantTemplateInspiration({
        resolvedMode: "followUp",
        followUpIntent: "clear-redesign",
        scaffoldId: SCAFFOLD_OFF_BASELINE_ID,
      }),
    ).toBe(false);
  });

  it("does not treat scaffold-unlock alone as a redesign", () => {
    expect(
      shouldResolveVariantTemplateInspiration({
        resolvedMode: "followUp",
        followUpIntent: "neutral",
        scaffoldId: "landing-page",
      }),
    ).toBe(false);
  });
});

describe("finalizeOrchestrationPrompts variant inspiration", () => {
  beforeEach(() => {
    inspirationMocks.resolveVariantTemplateInspiration.mockClear();
    inspirationMocks.resolveVariantTemplateInspiration.mockResolvedValue(inspirationMocks.fixture);
  });

  it("resolves inspiration, still image and source receipt on clear-redesign", async () => {
    const finalized = await finalizeFollowUp({
      prompt: "Gör om hela sajten i en mörk editorial stil",
      followUpIntent: "clear-redesign",
      ignorePersistedScaffoldForMatch: true,
    });

    expect(inspirationMocks.resolveVariantTemplateInspiration).toHaveBeenCalledTimes(1);
    expect(inspirationMocks.resolveVariantTemplateInspiration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        selectionContext: expect.objectContaining({
          prompt: "Gör om hela sajten i en mörk editorial stil",
        }),
      }),
    );
    expect(finalized.variantTemplateId).toBe("k3-redesign-fixture");
    expect(finalized.variantTemplateReferenceAttachments).toEqual([
      expect.objectContaining({
        type: "system_reference",
        url: inspirationMocks.fixture.stillImageUrl,
        purpose: VARIANT_TEMPLATE_STYLE_REFERENCE_PURPOSE,
      }),
    ]);
    expect(finalized.dynamicContext).toContain("## Variant Template Inspiration");
    expect(finalized.dynamicContext).toContain("K3 Redesign Fixture");
    expect(finalized.dynamicContext).toContain(
      "These are visual reference points, not a contract.",
    );
    expect(finalized.dynamicContextPruning.keptBlockKeys).toContain("variant_template_inspiration");
    expect(finalized.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "variant-reference",
          id: "k3-redesign-fixture",
          origin: "blob-template",
          authority: "inspiration",
          reachedPrompt: true,
        }),
      ]),
    );
  });

  it.each(REGULAR_FOLLOW_UP_INTENTS)(
    "keeps %s byte-identical to the init-only gate (no inspiration)",
    async (followUpIntent) => {
      const finalized = await finalizeFollowUp({ followUpIntent });

      expect(inspirationMocks.resolveVariantTemplateInspiration).not.toHaveBeenCalled();
      expect(finalized.variantTemplateId).toBeNull();
      expect(finalized.variantTemplateReferenceAttachments).toEqual([]);
      expect(finalized.dynamicContext).not.toContain("## Variant Template Inspiration");
      expect(finalized.dynamicContext).toContain("Follow-up delta rule");
      expect(finalized.sources.filter((source) => source.kind === "variant-reference")).toEqual([]);
    },
  );

  it("does not resolve inspiration when only the scaffold lock is released", async () => {
    const finalized = await finalizeFollowUp({
      followUpIntent: "neutral",
      ignorePersistedScaffoldForMatch: true,
    });

    expect(inspirationMocks.resolveVariantTemplateInspiration).not.toHaveBeenCalled();
    expect(finalized.variantTemplateId).toBeNull();
    expect(finalized.variantTemplateReferenceAttachments).toEqual([]);
    expect(finalized.dynamicContext).not.toContain("## Variant Template Inspiration");
  });

  it("still skips inspiration on clear-redesign in Imported repo mode", async () => {
    const finalized = await finalizeFollowUp({
      prompt: "Gör om hela sajten",
      followUpIntent: "clear-redesign",
      importedRepoMode: true,
      persistedScaffoldId: undefined,
      persistedVariantId: undefined,
      ignorePersistedScaffoldForMatch: true,
    });

    expect(inspirationMocks.resolveVariantTemplateInspiration).not.toHaveBeenCalled();
    expect(finalized.variantTemplateId).toBeNull();
    expect(finalized.variantTemplateReferenceAttachments).toEqual([]);
    expect(finalized.dynamicContext).not.toContain("## Variant Template Inspiration");
  });

  it("still skips inspiration on clear-redesign for Scaffold: Av", async () => {
    const finalized = await finalizeFollowUp({
      prompt: "Gör om hela sajten",
      buildIntent: "app",
      scaffoldMode: "off",
      followUpIntent: "clear-redesign",
      persistedScaffoldId: undefined,
      persistedVariantId: undefined,
      ignorePersistedScaffoldForMatch: true,
    });

    expect(inspirationMocks.resolveVariantTemplateInspiration).not.toHaveBeenCalled();
    expect(finalized.variantTemplateId).toBeNull();
    expect(finalized.variantTemplateReferenceAttachments).toEqual([]);
    expect(finalized.dynamicContext).not.toContain("## Variant Template Inspiration");
  });

  it("lets a redesign snapshot replace a previous variantTemplateId", async () => {
    const finalized = await finalizeFollowUp({
      prompt: "Gör om hela sajten i en mörk editorial stil",
      followUpIntent: "clear-redesign",
      ignorePersistedScaffoldForMatch: true,
    });

    expect(finalized.variantTemplateId).toBe("k3-redesign-fixture");

    const merged = mergePersistedOrchestrationSnapshots(
      {
        variantTemplateId: "stale-init-template",
        capturedAt: "2026-08-01T00:00:00Z",
      },
      {
        variantTemplateId: finalized.variantTemplateId,
        capturedAt: "2026-08-21T00:00:00Z",
      },
    );

    expect(merged.variantTemplateId).toBe("k3-redesign-fixture");
    expect(merged.variantTemplateId).not.toBe("stale-init-template");
  });
});

describe("finalizeOrchestrationPrompts variant authority", () => {
  it("keeps the server-frozen Plan variant, tokens and fonts on approved first build", async () => {
    const planInput = {
      prompt: "Bygg en exklusiv redaktionell modesajt med svart primärfärg",
      rawPrompt: "Bygg en exklusiv redaktionell modesajt med svart primärfärg",
      buildIntent: "website" as const,
      generationMode: "init" as const,
      scaffoldMode: "manual" as const,
      scaffoldId: "landing-page",
      embeddingScaffoldMatch: false,
      capabilities: noCapabilities,
      brief: {
        designIntent: {
          explicitAxes: ["style", "palette", "typography"],
          explicitFields: ["palette.primary", "typography.headings"],
        },
        toneAndVoice: ["exclusive"],
        visualDirection: {
          styleKeywords: ["luxury", "editorial", "fashion"],
          colorMode: "dark" as const,
          colorPalette: {
            primary: "#000000",
            secondary: "#eeeeee",
            accent: "#ff00ff",
            background: "#ffffff",
            text: "#111111",
          },
          typography: { headings: "Fraunces", body: "Invented Body" },
        },
      },
    };
    const planBase = await resolveOrchestrationBase(planInput);
    const planned = await finalizeOrchestrationPrompts(planBase, planInput);
    expect(planned.variantId).toBe("editorial-lux");

    const buildInput = {
      ...planInput,
      prompt: "Den här buildplanen är nu godkänd. Utför BUILD-fasen.",
      rawPrompt: "Den här buildplanen är nu godkänd. Utför BUILD-fasen.",
      styleChoiceHint: "corporate" as const,
      approvedPlanAuthority: {
        schemaVersion: 2 as const,
        baseVersionId: null,
        baseFilesRevision: null,
        requestAttachments: [],
        customInstructions: null,
        imageGenerations: true,
        scaffoldId: "landing-page",
        buildIntent: "website" as const,
        variantId: planned.variantId,
        variantSelection: planned.variantSelection,
        resolvedDesign: planned.resolvedDesign,
        variantTemplateId: planned.variantTemplateId,
        brief: planInput.brief,
        lineageHash: "plan-lineage",
      },
    };
    const buildBase = await resolveOrchestrationBase(buildInput);
    const built = await finalizeOrchestrationPrompts(buildBase, buildInput);

    expect(built.variantId).toBe(planned.variantId);
    expect(built.variantSelection).toMatchObject({
      source: "approved-plan",
      finalId: planned.variantId,
    });
    expect(built.resolvedDesign).toEqual(planned.resolvedDesign);
    expect(built.variantTemplateId).toBe(planned.variantTemplateId);

    const followUpBuildInput = {
      ...buildInput,
      generationMode: "followUp" as const,
      // The approval message itself is technical and can classify as neutral.
      // The reviewed authority must still supersede the older accepted base.
      followUpIntent: "neutral" as const,
      previousFilesCount: 12,
      persistedScaffoldId: "landing-page",
      persistedVariantId: "corporate-grid",
      followUpContract: {
        baseVersionId: "base-version",
        snapshotBrief: null,
        scaffoldId: "landing-page",
        variantId: "corporate-grid",
        routePlan: { existingRoutePaths: ["/"], existingShellRoutePaths: [] },
        capabilities: [],
        qualityTarget: null,
        previewSessionId: null,
      },
    };
    const followUpBuildBase = await resolveOrchestrationBase(followUpBuildInput);
    const followUpBuilt = await finalizeOrchestrationPrompts(followUpBuildBase, followUpBuildInput);

    expect(followUpBuilt.variantSelection.source).toBe("approved-plan");
    expect(followUpBuilt.variantId).toBe(planned.variantId);
    expect(followUpBuilt.resolvedDesign).toEqual(planned.resolvedDesign);
    expect(followUpBuilt.variantTemplateId).toBe(planned.variantTemplateId);
    expect(inspirationMocks.resolveVariantTemplateInspiration).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: planned.variantId }),
      expect.objectContaining({ preferredTemplateId: planned.variantTemplateId }),
    );
  });

  it("keeps an explicit builder style choice above Brief and hint evidence", async () => {
    const input = {
      prompt: "Bygg en exklusiv redaktionell modesajt",
      buildIntent: "website" as const,
      generationMode: "init" as const,
      scaffoldMode: "manual" as const,
      scaffoldId: "landing-page",
      styleChoiceHint: "corporate" as const,
      variantHintId: "editorial-lux",
      embeddingScaffoldMatch: false,
      capabilities: noCapabilities,
      brief: {
        designIntent: { explicitAxes: ["style"] },
        toneAndVoice: ["exclusive"],
        visualDirection: {
          styleKeywords: ["luxury", "editorial", "fashion"],
          colorMode: "dark" as const,
        },
      },
    };
    const base = await resolveOrchestrationBase(input);
    const finalized = await finalizeOrchestrationPrompts(base, input);

    expect(finalized.variantId).toBe("corporate-grid");
    expect(finalized.variantSelection).toMatchObject({
      source: "style-choice",
      hintId: "editorial-lux",
      finalId: "corporate-grid",
      changedFromHint: true,
    });
  });

  it("lets post-Brief evidence replace a cheap init hint and records why", async () => {
    const input = {
      prompt: "Bygg en landningssida för ett nytt varumärke",
      buildIntent: "website" as const,
      generationMode: "init" as const,
      scaffoldMode: "manual" as const,
      scaffoldId: "landing-page",
      variantHintId: "corporate-grid",
      toneKeywordsHint: ["direct"],
      embeddingScaffoldMatch: false,
      capabilities: noCapabilities,
      brief: {
        designIntent: { explicitAxes: ["style"] },
        toneAndVoice: ["exclusive"],
        visualDirection: {
          styleKeywords: ["luxury", "editorial", "fashion"],
          colorMode: "dark",
          colorPalette: {
            primary: "#3b82f6",
            secondary: "#6366f1",
            accent: "#f59e0b",
            background: "#0a0a0a",
            text: "#ffffff",
          },
          typography: { headings: "Inter", body: "Inter" },
        },
      },
    };
    const base = await resolveOrchestrationBase(input);
    const finalized = await finalizeOrchestrationPrompts(base, input);

    expect(finalized.variantId).toBe("editorial-lux");
    expect(finalized.variantSelection).toMatchObject({
      source: "brief-keyword",
      hintId: "corporate-grid",
      finalId: "editorial-lux",
      changedFromHint: true,
    });
    expect(finalized.resolvedDesign.themeTokens.primary).toMatchObject({
      source: "variant",
    });
    expect(finalized.resolvedDesign.toneAndVoice).toMatchObject({
      value: ["direct"],
      source: "user-locked",
    });
    expect(finalized.dynamicContext).toContain("## Resolved Design Contract");
    expect(finalized.dynamicContext).not.toContain("## Brief-Locked Design Values");
    expect(finalized.dynamicContext).toContain("- **Tone:** direct");
    expect(finalized.dynamicContext).not.toContain("- **Tone:** exclusive");
  });

  it("uses the cheap hint only when Brief/prompt matching has no signal", async () => {
    const input = {
      prompt: "Bygg något åt verksamheten",
      buildIntent: "website" as const,
      generationMode: "init" as const,
      scaffoldMode: "manual" as const,
      scaffoldId: "landing-page",
      variantHintId: "warm-local",
      embeddingScaffoldMatch: false,
      capabilities: noCapabilities,
      brief: null,
    };
    const base = await resolveOrchestrationBase(input);
    const finalized = await finalizeOrchestrationPrompts(base, input);

    expect(finalized.variantId).toBe("warm-local");
    expect(finalized.variantSelection).toMatchObject({
      source: "hint-fallback",
      hintId: "warm-local",
      finalId: "warm-local",
      changedFromHint: false,
      score: null,
    });
  });

  it("keeps a follow-up lock ahead of fresh Brief evidence", async () => {
    const finalized = await finalizeFollowUp({
      brief: {
        designIntent: { explicitAxes: ["style"] },
        visualDirection: { styleKeywords: ["corporate", "enterprise"] },
      },
      embeddingScaffoldMatch: false,
      variantHintId: "corporate-grid",
    });

    expect(finalized.variantId).toBe("editorial-lux");
    expect(finalized.variantSelection.source).toBe("follow-up-lock");
  });

  it("keeps the accepted locked palette and mode on a neutral follow-up", async () => {
    const initInput = {
      prompt: "Bygg en ren landningssida",
      buildIntent: "website" as const,
      generationMode: "init" as const,
      scaffoldMode: "manual" as const,
      scaffoldId: "landing-page",
      styleChoiceHint: "minimal" as const,
      designThemePreset: "violet",
      colorModeHint: "dark" as const,
      embeddingScaffoldMatch: false,
      capabilities: noCapabilities,
      brief: {
        designIntent: { explicitAxes: [] },
        visualDirection: { styleKeywords: ["clean"], colorMode: "either" as const },
      },
    };
    const initBase = await resolveOrchestrationBase(initInput);
    const accepted = await finalizeOrchestrationPrompts(initBase, initInput);
    expect(accepted.variantId).toBe("minimalist-mag");
    expect(accepted.resolvedDesign.colorMode.value).toBe("dark");
    expect(accepted.resolvedDesign.themeTokens.card?.source).toBe("user-locked");

    const finalized = await finalizeFollowUp({
      persistedVariantId: "minimalist-mag",
      followUpContract: {
        baseVersionId: "version-1",
        snapshotBrief: null,
        scaffoldId: "landing-page",
        variantId: "minimalist-mag",
        resolvedDesign: accepted.resolvedDesign,
        routePlan: { existingRoutePaths: ["/"], existingShellRoutePaths: [] },
        capabilities: [],
        qualityTarget: null,
        previewSessionId: null,
      },
    });

    expect(finalized.resolvedDesign.colorMode).toEqual(accepted.resolvedDesign.colorMode);
    expect(finalized.resolvedDesign.themeTokens).toEqual(accepted.resolvedDesign.themeTokens);
    expect(finalized.dynamicContext).toContain(
      `**--color-card** (user-locked, locked): \`${accepted.resolvedDesign.themeTokens.card?.value}\``,
    );
  });

  it("delegates a targeted follow-up palette/font axis instead of restoring cached values", async () => {
    const accepted = await finalizeFollowUp();
    const contract = {
      baseVersionId: "version-1",
      snapshotBrief: null,
      scaffoldId: "landing-page",
      variantId: "editorial-lux",
      resolvedDesign: accepted.resolvedDesign,
      routePlan: { existingRoutePaths: ["/"], existingShellRoutePaths: [] },
      capabilities: [],
      qualityTarget: null,
      previewSessionId: null,
    };

    const paletteEdit = await finalizeFollowUp({
      prompt: "Byt bakgrunden till blå",
      rawPrompt: "Byt bakgrunden till blå",
      followUpContract: contract,
    });
    expect(paletteEdit.resolvedDesign.unresolvedAxes).not.toContain("palette");
    expect(paletteEdit.resolvedDesign.unresolvedFields).toContain("palette.background");
    expect(paletteEdit.dynamicContext).toContain("Current-request fields");
    expect(paletteEdit.dynamicContext).not.toContain("**--color-background**");
    expect(paletteEdit.dynamicContext).toContain("**--color-primary**");

    const fontEdit = await finalizeFollowUp({
      prompt: "Använd Fraunces i rubrikerna",
      rawPrompt: "Använd Fraunces i rubrikerna",
      followUpContract: contract,
    });
    expect(fontEdit.resolvedDesign.unresolvedAxes).not.toContain("typography");
    expect(fontEdit.resolvedDesign.unresolvedFields).toContain("typography.headings");
    expect(fontEdit.dynamicContext).toContain("- **Typography:** body ");
    expect(fontEdit.dynamicContext).not.toContain("heading Fraunces");

    const styleEdit = await finalizeFollowUp({
      prompt: "Gör sajten mer minimalistisk",
      rawPrompt: "Gör sajten mer minimalistisk",
      followUpContract: contract,
    });
    expect(styleEdit.resolvedDesign.unresolvedAxes).toContain("style");
    expect(styleEdit.dynamicContext).toContain("Current-request authority:** style");
  });
});
