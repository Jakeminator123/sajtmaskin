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

vi.mock("../scaffold-variants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../scaffold-variants")>();
  return {
    ...actual,
    resolveVariantTemplateInspiration: inspirationMocks.resolveVariantTemplateInspiration,
  };
});

import { finalizeOrchestrationPrompts, shouldResolveVariantTemplateInspiration } from "./finalize-prompts";
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
    expect(inspirationMocks.resolveVariantTemplateInspiration.mock.calls[0]?.[1]).toEqual(
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
    expect(finalized.dynamicContext).toContain("These are visual reference points, not a contract.");
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
