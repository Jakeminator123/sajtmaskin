import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../scaffolds/scaffold-search", () => ({
  searchScaffoldsWithDiagnostics: vi.fn(async () => ({
    results: [],
    diagnostics: {
      attempted: true,
      available: false,
      failed: false,
      unavailableReason: "no_api_key",
      errorMessage: null,
      durationMs: 0,
    },
  })),
}));

vi.mock("../data/shadcn-ui-recipes", () => ({
  resolveShadcnUiRecipes: vi.fn(async () => [
    {
      name: "hero3",
      source: "official",
      itemType: "block",
      files: [],
      reason: "hero",
    },
  ]),
}));

import { resolveOrchestrationBase } from "./resolve-base";
import type { InferredCapabilities } from "../capability-inference";
import { resolveShadcnUiRecipes } from "../data/shadcn-ui-recipes";
import { isTargetedRepairPrompt } from "../build-spec/prompt-patterns";
import { buildAutoFixPrompt } from "@/lib/hooks/chat/helpers-autofix-prompt";

const mockedResolveShadcnUiRecipes = vi.mocked(resolveShadcnUiRecipes);

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

function followUpInput(prompt: string, overrides: Record<string, unknown> = {}) {
  return {
    prompt,
    rawPrompt: prompt,
    capabilitiesPrompt: prompt,
    buildIntent: "website" as const,
    generationMode: "followUp" as const,
    persistedScaffoldId: "landing-page",
    previousFilesCount: 8,
    embeddingScaffoldMatch: false,
    capabilities: noCapabilities,
    ...overrides,
  };
}

describe("A4 — freeze UI recipes only on AUTO-FIX / targeted repair", () => {
  beforeEach(() => {
    mockedResolveShadcnUiRecipes.mockClear();
  });

  it("detects the AUTO-FIX header that buildAutoFixPrompt emits", () => {
    const prompt = buildAutoFixPrompt({
      chatId: "chat_1",
      versionId: "ver_1",
      reasons: ["fake_form"],
    });
    expect(prompt.startsWith("AUTO-FIX REQUEST — TARGETED REPAIR")).toBe(true);
    expect(isTargetedRepairPrompt(prompt)).toBe(true);
    expect(isTargetedRepairPrompt("Lägg till testimonials på startsidan")).toBe(false);
  });

  it("does not resolve new ui-recipes for AUTO-FIX even when the word hero is present", async () => {
    const prompt = [
      "AUTO-FIX REQUEST — TARGETED REPAIR",
      "",
      "Issues detected: fake_form on the hero contact section.",
    ].join("\n");
    const base = await resolveOrchestrationBase(followUpInput(prompt));

    expect(mockedResolveShadcnUiRecipes).not.toHaveBeenCalled();
    expect(base.uiRecipes).toEqual([]);
  });

  it("still resolves recipes for a regular follow-up that asks for testimonials", async () => {
    const base = await resolveOrchestrationBase(
      followUpInput("Lägg till testimonials under heron"),
    );

    expect(mockedResolveShadcnUiRecipes).toHaveBeenCalled();
    expect(base.uiRecipes.map((recipe) => recipe.name)).toEqual(["hero3"]);
  });
});
