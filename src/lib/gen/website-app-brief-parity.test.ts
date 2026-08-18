import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./scaffolds/scaffold-search", () => ({
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

vi.mock("./data/shadcn-ui-recipes", () => ({
  resolveShadcnUiRecipes: vi.fn(async () => []),
}));

import { resolveOrchestrationBase } from "./orchestrate";
import type { InferredCapabilities } from "./capability-inference";
import { resolveShadcnUiRecipes } from "./data/shadcn-ui-recipes";
import { searchScaffoldsWithDiagnostics } from "./scaffolds/scaffold-search";
import { shouldRunServerAutoBrief } from "@/lib/builder/server-auto-brief-policy";

const mockedResolveShadcnUiRecipes = vi.mocked(resolveShadcnUiRecipes);
const mockedSearchScaffolds = vi.mocked(searchScaffoldsWithDiagnostics);

/**
 * B8 — Brief-paritet mellan website och app.
 *
 * Plan: docs/plans/active/2026-08-18-briefing-och-kallpaket/aktiviteter/
 *       B8-brief-paritet-website-app.md
 *
 * Invarianten: ett vanligt fritextbygge får samma berikning oavsett om det är
 * en hemsida eller en app, och oavsett hur kort prompten är. Före B8 tog korta
 * hemsideprompter (≤ 420 tecken) ett snabbspår som hoppade över Deep Brief,
 * scaffold-embeddings, UI Recipes och dossier-selektion.
 *
 * Testerna nedan låser de två grindar som snabbspåret satt: brief-grinden och
 * berikningen i orkestreringen.
 */

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

function websiteInit(prompt: string) {
  return {
    prompt,
    rawPrompt: prompt,
    routePlanPrompt: prompt,
    buildSpecPrompt: prompt,
    contractsPrompt: prompt,
    scaffoldMatchPrompt: prompt,
    capabilitiesPrompt: prompt,
    buildIntent: "website" as const,
    generationMode: "init" as const,
    scaffoldMode: "auto" as const,
    capabilities: noCapabilities,
    promptStrategyMeta: { strategy: "direct" as const, promptType: "freeform" as const },
  };
}

function briefGateParams(prompt: string) {
  return {
    hasClientBrief: false,
    promptSourceTechnical: false,
    promptSourcePreservePayload: false,
    promptType: "freeform" as const,
    orchestrationReason: "direct",
    prompt,
    buildIntent: "website",
  };
}

/** Kortare än det borttagna 420-teckenstaket. */
const SHORT_WEBSITE_PROMPT = "Bygg en enkel hemsida för en frisörsalong i Malmö.";
/** Längre än taket — behandlades redan som ett fullvärdigt bygge före B8. */
const LONG_WEBSITE_PROMPT = `${SHORT_WEBSITE_PROMPT} ${"Beskriv salongens historia, personal, priser och öppettider. ".repeat(
  10,
)}`;

describe("B8 — brief-grinden har ingen längdgräns", () => {
  const originalDisableFlag = process.env.SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF;

  afterEach(() => {
    if (originalDisableFlag === undefined) {
      delete process.env.SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF;
    } else {
      process.env.SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF = originalDisableFlag;
    }
  });

  it("kör auto-brief för en kort hemsideprompt", () => {
    expect(SHORT_WEBSITE_PROMPT.length).toBeLessThan(420);
    expect(shouldRunServerAutoBrief(briefGateParams(SHORT_WEBSITE_PROMPT))).toBe(true);
  });

  it("behandlar kort och lång prompt likadant", () => {
    expect(LONG_WEBSITE_PROMPT.length).toBeGreaterThan(420);
    expect(shouldRunServerAutoBrief(briefGateParams(SHORT_WEBSITE_PROMPT))).toBe(
      shouldRunServerAutoBrief(briefGateParams(LONG_WEBSITE_PROMPT)),
    );
  });

  it("behandlar hemsida och app likadant", () => {
    expect(
      shouldRunServerAutoBrief({ ...briefGateParams(SHORT_WEBSITE_PROMPT), buildIntent: "app" }),
    ).toBe(shouldRunServerAutoBrief(briefGateParams(SHORT_WEBSITE_PROMPT)));
  });

  it("behåller de riktiga undantagen — B8 vidgade inte grinden", () => {
    const base = briefGateParams(SHORT_WEBSITE_PROMPT);
    expect(shouldRunServerAutoBrief({ ...base, hasClientBrief: true })).toBe(false);
    expect(shouldRunServerAutoBrief({ ...base, promptSourceTechnical: true })).toBe(false);
    expect(shouldRunServerAutoBrief({ ...base, promptSourcePreservePayload: true })).toBe(false);
    expect(shouldRunServerAutoBrief({ ...base, promptType: "audit" })).toBe(false);
    expect(shouldRunServerAutoBrief({ ...base, promptType: "followup_general" })).toBe(false);
  });

  it("respekterar rollback-spaken SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF=1", () => {
    process.env.SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF = "1";
    expect(shouldRunServerAutoBrief(briefGateParams(SHORT_WEBSITE_PROMPT))).toBe(false);
  });
});

describe("B8 — orkestreringen berikar korta hemsideprompter", () => {
  beforeEach(() => {
    mockedResolveShadcnUiRecipes.mockClear();
    mockedSearchScaffolds.mockClear();
  });

  it("resolverar UI Recipes för en kort hemsideprompt", async () => {
    await resolveOrchestrationBase(websiteInit(SHORT_WEBSITE_PROMPT));

    expect(mockedResolveShadcnUiRecipes).toHaveBeenCalledTimes(1);
    expect(mockedResolveShadcnUiRecipes).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: SHORT_WEBSITE_PROMPT, maxRecipes: 3 }),
    );
  });

  it("gör samma sak för en lång prompt — ingen längdberoende gren", async () => {
    await resolveOrchestrationBase(websiteInit(LONG_WEBSITE_PROMPT));

    expect(mockedResolveShadcnUiRecipes).toHaveBeenCalledTimes(1);
  });

  it("låter embedding-scaffoldmatchning vara på som default", async () => {
    await resolveOrchestrationBase(websiteInit(SHORT_WEBSITE_PROMPT));

    // Utan explicit `embeddingScaffoldMatch` ska orkestreringen försöka
    // embedda. Sökningen är mockad som otillgänglig, så valet faller tillbaka
    // på keyword — men försöket ska ha gjorts. Före B8 kom anropet aldrig hit
    // för en kort hemsideprompt.
    expect(mockedSearchScaffolds).toHaveBeenCalled();
  });
});
