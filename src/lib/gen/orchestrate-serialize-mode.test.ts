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

  it("uses structural for a manual ecommerce pick even when context stays normal", async () => {
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
    expect(base.buildSpec.contextPolicy).toBe("normal");
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
