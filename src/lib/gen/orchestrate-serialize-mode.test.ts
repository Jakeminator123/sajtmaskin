import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./scaffolds/scaffold-search", () => ({
  searchScaffoldsWithDiagnostics: vi.fn(),
}));

vi.mock("./data/shadcn-ui-recipes", () => ({
  resolveShadcnUiRecipes: vi.fn(async () => []),
}));

import { resolveOrchestrationBase } from "./orchestrate";
import type { InferredCapabilities } from "./capability-inference";
import { searchScaffoldsWithDiagnostics } from "./scaffolds/scaffold-search";

const mockedSearchScaffoldsWithDiagnostics = vi.mocked(searchScaffoldsWithDiagnostics);

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

const simpleWebsitePrompt =
  "Skapa en sajt för ett litet företag i Umeå. Startsida, kort presentation och kontakt.";

describe("resolveOrchestrationBase serializeMode", () => {
  beforeEach(() => {
    mockedSearchScaffoldsWithDiagnostics.mockReset();
  });

  it("first codegen with a persisted scaffold but zero files filters only unplanned init routes", async () => {
    const base = await resolveOrchestrationBase({
      prompt: "Bygg en enda sida för ett lokalt företag. Bara startsidan, ingen blogg.",
      buildIntent: "website", scaffoldMode: "manual", scaffoldId: "blog",
      persistedScaffoldId: "blog", previousFilesCount: 0, pageCountHint: 1,
      embeddingScaffoldMatch: false, capabilities: noCapabilities,
    });
    expect(base.buildSpec.generationMode).toBe("init");
    expect(base.routePlan.routes.map((route) => route.path)).toEqual(["/"]);
    expect(base.scaffoldContext).toContain("app/page.tsx");
    expect(base.scaffoldContext).not.toContain("app/blog/page.tsx");
    expect(base.scaffoldContext).not.toContain("app/blog/[slug]/page.tsx");
  });

  it("forwards canonical follow-up mode so a narrower plan cannot hide established scaffold routes", async () => {
    const base = await resolveOrchestrationBase({
      prompt: "Ändra bara accentfärgen, behåll strukturen.",
      buildIntent: "website", generationMode: "followUp", followUpIntent: "neutral",
      scaffoldMode: "auto", persistedScaffoldId: "blog", previousFilesCount: 9,
      existingRoutePaths: ["/"], pageCountHint: 1,
      embeddingScaffoldMatch: false, capabilities: noCapabilities,
    });
    expect(base.buildSpec.generationMode).toBe("followUp");
    expect(base.routePlan.routes.map((route) => route.path)).toEqual(["/"]);
    expect(base.scaffoldContext).toContain("app/blog/page.tsx");
    expect(base.scaffoldContext).toContain("app/blog/[slug]/page.tsx");
  });

  it("an imported project never receives scaffold file inventory or route hints", async () => {
    const base = await resolveOrchestrationBase({
      prompt: "Ändra bara accentfärgen.",
      buildIntent: "website", generationMode: "followUp", importedRepoMode: true,
      scaffoldMode: "manual", scaffoldId: "blog", persistedScaffoldId: "blog",
      previousFilesCount: 9, existingRoutePaths: ["/"],
      embeddingScaffoldMatch: false, capabilities: noCapabilities,
    });
    expect(base.resolvedScaffold).toBeNull();
    expect(base.scaffoldContext).toBeUndefined();
  });

  it("uses inspirational for a normal auto website init", async () => {
    const base = await resolveOrchestrationBase({
      prompt: simpleWebsitePrompt,
      buildIntent: "website",
      generationMode: "init",
      scaffoldMode: "auto",
      embeddingScaffoldMatch: false,
      capabilities: noCapabilities,
      promptStrategyMeta: { strategy: "direct", promptType: "freeform" },
    });

    expect(base.buildSpec.contextPolicy).not.toBe("heavy");
    expect(base.serializeMode).toBe("inspirational");
  });

  it("uses inspirational for Scaffold: Av on a normal website init", async () => {
    const base = await resolveOrchestrationBase({
      prompt: simpleWebsitePrompt,
      buildIntent: "website",
      generationMode: "init",
      scaffoldMode: "off",
      embeddingScaffoldMatch: false,
      capabilities: noCapabilities,
      promptStrategyMeta: { strategy: "direct", promptType: "freeform" },
    });

    expect(base.resolvedScaffold?.id).toBe("projekt-bas-app");
    expect(base.buildSpec.contextPolicy).not.toBe("heavy");
    expect(base.serializeMode).toBe("inspirational");
  });

  it("uses structural for a manual editorial pick even when context stays normal", async () => {
    const base = await resolveOrchestrationBase({
      prompt: simpleWebsitePrompt,
      buildIntent: "website",
      generationMode: "init",
      scaffoldMode: "manual",
      scaffoldId: "portfolio",
      embeddingScaffoldMatch: false,
      capabilities: noCapabilities,
      promptStrategyMeta: { strategy: "direct", promptType: "freeform" },
    });

    expect(base.resolvedScaffold?.id).toBe("portfolio");
    expect(base.resolvedScaffold?.siteKind).toBe("editorial");
    expect(base.buildSpec.contextPolicy).not.toBe("heavy");
    expect(base.serializeMode).toBe("structural");
  });

  it("uses structural for a manual ecommerce pick", async () => {
    const base = await resolveOrchestrationBase({
      prompt: simpleWebsitePrompt,
      buildIntent: "website",
      generationMode: "init",
      scaffoldMode: "manual",
      scaffoldId: "ecommerce",
      embeddingScaffoldMatch: false,
      capabilities: noCapabilities,
      promptStrategyMeta: { strategy: "direct", promptType: "freeform" },
    });

    expect(base.resolvedScaffold?.id).toBe("ecommerce");
    expect(base.resolvedScaffold?.siteKind).toBe("commerce");
    expect(base.serializeMode).toBe("structural");
  });

  it("uses structural for a manual saas-landing pick even when siteKind is marketing", async () => {
    const base = await resolveOrchestrationBase({
      prompt: simpleWebsitePrompt,
      buildIntent: "website",
      generationMode: "init",
      scaffoldMode: "manual",
      scaffoldId: "saas-landing",
      embeddingScaffoldMatch: false,
      capabilities: noCapabilities,
      promptStrategyMeta: { strategy: "direct", promptType: "freeform" },
    });

    expect(base.resolvedScaffold?.id).toBe("saas-landing");
    expect(base.resolvedScaffold?.siteKind).toBe("marketing");
    expect(base.buildSpec.contextPolicy).not.toBe("heavy");
    expect(base.serializeMode).toBe("structural");
  });

  it("keeps a manual landing-page pick inspirational on a normal init", async () => {
    const base = await resolveOrchestrationBase({
      prompt: simpleWebsitePrompt,
      buildIntent: "website",
      generationMode: "init",
      scaffoldMode: "manual",
      scaffoldId: "landing-page",
      embeddingScaffoldMatch: false,
      capabilities: noCapabilities,
      promptStrategyMeta: { strategy: "direct", promptType: "freeform" },
    });

    expect(base.resolvedScaffold?.id).toBe("landing-page");
    expect(base.resolvedScaffold?.siteKind).toBe("marketing");
    expect(base.buildSpec.contextPolicy).not.toBe("heavy");
    expect(base.serializeMode).toBe("inspirational");
  });
});
