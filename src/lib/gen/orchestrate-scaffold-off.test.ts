import { describe, expect, it, vi } from "vitest";

vi.mock("./system-prompt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./system-prompt")>();
  return {
    ...actual,
    // The static-core loader intentionally uses runtime require(), which is
    // outside this orchestration regression's scope and is not TS-resolvable
    // from Vitest's module graph. Keep the dynamic context observable here.
    composeEngineSystemPrompt: (dynamicContext: string) => dynamicContext,
  };
});

import { finalizeOrchestrationPrompts, resolveOrchestrationBase } from "./orchestrate";
import type { InferredCapabilities } from "./capability-inference";
import { SCAFFOLD_OFF_BASELINE_ID } from "./scaffolds/types";
import { getVariantsForScaffold } from "./scaffold-variants/registry";
import { pickScaffoldVariant } from "./scaffold-variants/matcher";

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

describe("resolveOrchestrationBase scaffoldMode off (builder Scaffold: Av)", () => {
  it("keeps template + off truly scaffold-less rather than reactivating a fallback", async () => {
    const base = await resolveOrchestrationBase({
      prompt: "Bygg en kategorimall",
      buildIntent: "template",
      scaffoldMode: "off",
      embeddingScaffoldMatch: false,
      capabilities: noCapabilities,
      generationMode: "init",
    });
    expect(base.resolvedScaffold).toBeNull();
    expect(base.scaffoldSelection?.selectionMethod).toBe("off");
    expect(base.scaffoldSelection?.selectedScaffold).toBeNull();
  });

  it.each(["website", "app"] as const)(
    "keeps projekt-bas-app for off/%s without imposing app-shell",
    async (buildIntent) => {
      const base = await resolveOrchestrationBase({
        prompt: "Bygg en enkel start",
        buildIntent,
        scaffoldMode: "off",
        embeddingScaffoldMatch: false,
        capabilities: noCapabilities,
        generationMode: "init",
      });
      expect(base.resolvedScaffold?.id).toBe(SCAFFOLD_OFF_BASELINE_ID);
      expect(base.buildSpec.buildIntent).toBe(buildIntent);
      const variants = getVariantsForScaffold(base.resolvedScaffold!.id);
      expect(variants.map((variant) => variant.id).sort()).toEqual(["neutral-core", "warm-tool"]);
      for (const variant of variants) {
        expect(pickScaffoldVariant({
          scaffoldId: base.resolvedScaffold!.id, prompt: variant.keywords.join(" "),
          styleKeywords: variant.keywords, generationMode: "init",
        })?.id).toBe(variant.id);
      }
    },
  );
  it("resolves projekt-bas-app for freeform off, not null", async () => {
    const base = await resolveOrchestrationBase({
      prompt: "Bygg en enkel todo-app",
      buildIntent: "app",
      scaffoldMode: "off",
      embeddingScaffoldMatch: false,
      capabilities: noCapabilities,
      generationMode: "init",
    });

    expect(base.resolvedScaffold?.id).toBe(SCAFFOLD_OFF_BASELINE_ID);
    expect(base.scaffoldSelection?.selectionMethod).toBe("off");
    expect(base.scaffoldSelection?.selectedScaffold).toBe(SCAFFOLD_OFF_BASELINE_ID);
  });

  it("keeps Scaffold: Av free from v0 template inspiration", async () => {
    const input = {
      prompt: "Bygg en enkel todo-app",
      buildIntent: "app" as const,
      scaffoldMode: "off" as const,
      embeddingScaffoldMatch: false,
      capabilities: noCapabilities,
      generationMode: "init" as const,
    };
    const base = await resolveOrchestrationBase(input);
    const finalized = await finalizeOrchestrationPrompts(base, input);

    expect(base.resolvedScaffold?.id).toBe(SCAFFOLD_OFF_BASELINE_ID);
    expect(finalized.variantTemplateId).toBeNull();
    expect(finalized.variantTemplateReferenceAttachments).toEqual([]);
    expect(finalized.dynamicContext).not.toContain("## Variant Template Inspiration");
  });

  it("keeps importedRepoMode truly scaffold-less even when scaffoldMode is off", async () => {
    const base = await resolveOrchestrationBase({
      prompt: "Byt rubriken",
      buildIntent: "website",
      scaffoldMode: "off",
      importedRepoMode: true,
      embeddingScaffoldMatch: false,
      capabilities: noCapabilities,
      generationMode: "followUp",
      previousFilesCount: 20,
      existingRoutePaths: ["/"],
    });

    expect(base.resolvedScaffold).toBeNull();
    expect(base.scaffoldSelection?.selectionMethod).toBe("off");
  });

  it("does not override a persisted scaffold on follow-up when header is still Av", async () => {
    const base = await resolveOrchestrationBase({
      prompt: "Byt rubriken till Hej",
      buildIntent: "website",
      scaffoldMode: "off",
      persistedScaffoldId: "landing-page",
      embeddingScaffoldMatch: false,
      capabilities: noCapabilities,
      generationMode: "followUp",
      previousFilesCount: 12,
      existingRoutePaths: ["/"],
    });

    expect(base.resolvedScaffold?.id).toBe("landing-page");
    expect(base.scaffoldSelection?.selectionMethod).toBe("persisted");
  });
});
