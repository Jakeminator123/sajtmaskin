import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./scaffolds/scaffold-search", () => ({
  searchScaffoldsWithDiagnostics: vi.fn(),
}));

import { resolveOrchestrationBase } from "./orchestrate";
import { inferCapabilities, type InferredCapabilities } from "./capability-inference";
import { getScaffoldById } from "./scaffolds/registry";
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

describe("resolveOrchestrationBase simpleWebsitePath", () => {
  beforeEach(() => {
    mockedSearchScaffoldsWithDiagnostics.mockReset();
  });

  it("keeps scaffold/route/BuildSpec but skips optional refs and dossiers", async () => {
    const base = await resolveOrchestrationBase({
      prompt: "Bygg en enkel hemsida för en lokal frisörsalong i Malmö.",
      rawPrompt: "Bygg en enkel hemsida för en lokal frisörsalong i Malmö.",
      routePlanPrompt: "Bygg en enkel hemsida för en lokal frisörsalong i Malmö.",
      buildSpecPrompt: "Bygg en enkel hemsida för en lokal frisörsalong i Malmö.",
      contractsPrompt: "Bygg en enkel hemsida för en lokal frisörsalong i Malmö.",
      scaffoldMatchPrompt: "Bygg en enkel hemsida för en lokal frisörsalong i Malmö.",
      capabilitiesPrompt: "Bygg en enkel hemsida för en lokal frisörsalong i Malmö.",
      buildIntent: "website",
      generationMode: "init",
      scaffoldMode: "auto",
      embeddingScaffoldMatch: false,
      capabilities: noCapabilities,
      simpleWebsitePath: true,
      promptStrategyMeta: { strategy: "direct", promptType: "freeform" },
    });

    expect(base.resolvedScaffold?.id).toBeTruthy();
    expect(base.routePlan.routes.length).toBeGreaterThan(0);
    expect(base.buildSpec.previewPolicy).toBe("fidelity2");
    expect(base.uiRecipes).toEqual([]);
    expect(base.dossierSelection).toBeNull();
  });

  it("clamps a manipulated manual scaffold after effective app intent resolves", async () => {
    const prompt = "Bygg en intern app för teamet.";
    const base = await resolveOrchestrationBase({
      prompt,
      rawPrompt: prompt,
      routePlanPrompt: prompt,
      buildSpecPrompt: prompt,
      contractsPrompt: prompt,
      scaffoldMatchPrompt: prompt,
      capabilitiesPrompt: prompt,
      buildIntent: "app",
      generationMode: "init",
      scaffoldMode: "manual",
      scaffoldId: "ecommerce",
      embeddingScaffoldMatch: false,
      capabilities: noCapabilities,
      simpleWebsitePath: true,
      promptStrategyMeta: { strategy: "direct", promptType: "freeform" },
    });

    expect(base.resolvedScaffold?.id).toBe("app-shell");
    expect(base.resolvedScaffold?.allowedBuildIntents).toContain("app");
    expect(base.scaffoldSelection?.selectionMethod).toBe("default");
    expect(base.scaffoldSelection?.selectionConfidence).toBe("low");
    expect(base.scaffoldSelection?.selectedScaffold).toBe(base.resolvedScaffold?.id);
    expect(base.scaffoldSelection?.topCandidates).toEqual([
      { id: "app-shell", score: 0, source: "keyword" },
    ]);
  });

  it("clamps an incompatible persisted scaffold before downstream app context", async () => {
    const prompt = "Justera färgen i den interna appen.";
    const base = await resolveOrchestrationBase({
      prompt,
      rawPrompt: prompt,
      routePlanPrompt: prompt,
      buildSpecPrompt: prompt,
      contractsPrompt: prompt,
      scaffoldMatchPrompt: prompt,
      capabilitiesPrompt: prompt,
      buildIntent: "app",
      generationMode: "followUp",
      previousFilesCount: 12,
      existingRoutePaths: ["/"],
      scaffoldMode: "auto",
      persistedScaffoldId: "ecommerce",
      embeddingScaffoldMatch: false,
      capabilities: noCapabilities,
      simpleWebsitePath: true,
      promptStrategyMeta: { strategy: "direct", promptType: "followup_general" },
    });

    expect(base.resolvedScaffold?.id).toBe("app-shell");
    expect(base.resolvedScaffold?.allowedBuildIntents).toContain("app");
    expect(base.scaffoldSelection?.selectionMethod).toBe("default");
    expect(base.scaffoldSelection?.selectionConfidence).toBe("low");
    expect(base.scaffoldSelection?.selectedScaffold).toBe(base.resolvedScaffold?.id);
    expect(base.scaffoldSelection?.topCandidates).toEqual([
      { id: "app-shell", score: 0, source: "keyword" },
    ]);
  });

  it("preserves the documented manual app-scaffold override of website intent", async () => {
    const prompt = "Bygg en intern dashboard för teamet.";
    const base = await resolveOrchestrationBase({
      prompt,
      rawPrompt: prompt,
      routePlanPrompt: prompt,
      buildSpecPrompt: prompt,
      contractsPrompt: prompt,
      scaffoldMatchPrompt: prompt,
      capabilitiesPrompt: prompt,
      buildIntent: "website",
      buildIntentExplicit: true,
      generationMode: "init",
      scaffoldMode: "manual",
      scaffoldId: "dashboard",
      embeddingScaffoldMatch: false,
      capabilities: noCapabilities,
      simpleWebsitePath: true,
      promptStrategyMeta: { strategy: "direct", promptType: "freeform" },
    });

    expect(base.resolvedScaffold?.id).toBe("dashboard");
    expect(base.scaffoldSelection?.selectionMethod).toBe("manual");
    expect(base.buildSpec.buildIntent).toBe("app");
  });

  it("reports an explicit-website keyword rejection as a default fallback", async () => {
    const prompt = "Bygg en dashboard med analytics, diagram och nyckeltal.";
    const base = await resolveOrchestrationBase({
      prompt,
      rawPrompt: prompt,
      routePlanPrompt: prompt,
      buildSpecPrompt: prompt,
      contractsPrompt: prompt,
      scaffoldMatchPrompt: prompt,
      capabilitiesPrompt: prompt,
      buildIntent: "website",
      buildIntentExplicit: true,
      generationMode: "init",
      scaffoldMode: "auto",
      embeddingScaffoldMatch: false,
      capabilities: noCapabilities,
      simpleWebsitePath: true,
      promptStrategyMeta: { strategy: "direct", promptType: "freeform" },
    });

    expect(base.resolvedScaffold?.id).toBe("landing-page");
    expect(base.scaffoldSelection?.selectedScaffold).toBe("landing-page");
    expect(base.scaffoldSelection?.selectionMethod).toBe("default");
    expect(base.scaffoldSelection?.selectionConfidence).toBe("low");
    expect(base.scaffoldSelection?.topCandidates).toEqual([
      { id: "landing-page", score: 0, source: "keyword" },
    ]);
    expect(base.scaffoldSelection?.keywordScores.dashboard).toBeGreaterThanOrEqual(2);
  });

  it("keeps raw embedding diagnostics when explicit website rejects an embedding winner", async () => {
    const dashboard = getScaffoldById("dashboard");
    expect(dashboard).toBeTruthy();
    mockedSearchScaffoldsWithDiagnostics.mockResolvedValue({
      results: [{ scaffold: dashboard!, score: 0.9 }],
      diagnostics: {
        attempted: true,
        available: true,
        failed: false,
        unavailableReason: null,
        errorMessage: null,
        durationMs: 8,
      },
    });
    const prompt = "Bygg en hemsida med dashboard och workspace.";
    const base = await resolveOrchestrationBase({
      prompt,
      rawPrompt: prompt,
      routePlanPrompt: prompt,
      buildSpecPrompt: prompt,
      contractsPrompt: prompt,
      scaffoldMatchPrompt: prompt,
      capabilitiesPrompt: prompt,
      buildIntent: "website",
      buildIntentExplicit: true,
      generationMode: "init",
      scaffoldMode: "auto",
      embeddingScaffoldMatch: true,
      capabilities: noCapabilities,
      simpleWebsitePath: true,
      promptStrategyMeta: { strategy: "direct", promptType: "freeform" },
    });

    expect(base.resolvedScaffold?.id).toBe("landing-page");
    expect(base.scaffoldSelection?.selectedScaffold).toBe("landing-page");
    expect(base.scaffoldSelection?.selectionMethod).toBe("default");
    expect(base.scaffoldSelection?.selectionConfidence).toBe("low");
    expect(base.scaffoldSelection?.topCandidates).toEqual([
      { id: "landing-page", score: 0, source: "keyword" },
    ]);
    expect(base.scaffoldSelection?.embeddingTopResult).toEqual({
      id: "dashboard",
      score: 0.9,
    });
    expect(base.scaffoldSelection?.embeddingOverrideReason).toBe("generic_keyword_override");
  });

  it("does not promote implicit website from one embedding-backed dashboard signal", async () => {
    const dashboard = getScaffoldById("dashboard");
    expect(dashboard).toBeTruthy();
    mockedSearchScaffoldsWithDiagnostics.mockResolvedValue({
      results: [{ scaffold: dashboard!, score: 0.9 }],
      diagnostics: {
        attempted: true,
        available: true,
        failed: false,
        unavailableReason: null,
        errorMessage: null,
        durationMs: 8,
      },
    });
    const prompt = "Bygg en hemsida med dashboard.";
    const base = await resolveOrchestrationBase({
      prompt,
      rawPrompt: prompt,
      routePlanPrompt: prompt,
      buildSpecPrompt: prompt,
      contractsPrompt: prompt,
      scaffoldMatchPrompt: prompt,
      capabilitiesPrompt: prompt,
      buildIntent: "website",
      generationMode: "init",
      scaffoldMode: "auto",
      embeddingScaffoldMatch: true,
      capabilities: noCapabilities,
      simpleWebsitePath: true,
      promptStrategyMeta: { strategy: "direct", promptType: "freeform" },
    });

    expect(base.resolvedScaffold?.id).toBe("landing-page");
    expect(base.buildSpec.buildIntent).toBe("website");
    expect(base.scaffoldSelection?.selectionMethod).toBe("default");
    expect(base.scaffoldSelection?.embeddingTopResult).toBeNull();
  });

  it("promotes implicit website after two raw signals and a strong app embedding", async () => {
    const dashboard = getScaffoldById("dashboard");
    expect(dashboard).toBeTruthy();
    mockedSearchScaffoldsWithDiagnostics.mockResolvedValue({
      results: [{ scaffold: dashboard!, score: 0.9 }],
      diagnostics: {
        attempted: true,
        available: true,
        failed: false,
        unavailableReason: null,
        errorMessage: null,
        durationMs: 8,
      },
    });
    const prompt = "Bygg en hemsida med dashboard och workspace.";
    const base = await resolveOrchestrationBase({
      prompt,
      rawPrompt: prompt,
      routePlanPrompt: prompt,
      buildSpecPrompt: prompt,
      contractsPrompt: prompt,
      scaffoldMatchPrompt: prompt,
      capabilitiesPrompt: prompt,
      buildIntent: "website",
      generationMode: "init",
      scaffoldMode: "auto",
      embeddingScaffoldMatch: true,
      capabilities: noCapabilities,
      simpleWebsitePath: true,
      promptStrategyMeta: { strategy: "direct", promptType: "freeform" },
    });

    expect(base.resolvedScaffold?.id).toBe("dashboard");
    expect(base.buildSpec.buildIntent).toBe("app");
    expect(base.scaffoldSelection?.selectionMethod).toBe("embedding");
    expect(base.scaffoldSelection?.embeddingTopResult).toEqual({
      id: "dashboard",
      score: 0.9,
    });
  });

  it("keeps a gaming-news portal on website intent despite needsAppShell boost", async () => {
    const prompt = "Bygg en gaming news portal med recensioner";
    const base = await resolveOrchestrationBase({
      prompt,
      rawPrompt: prompt,
      routePlanPrompt: prompt,
      buildSpecPrompt: prompt,
      contractsPrompt: prompt,
      scaffoldMatchPrompt: prompt,
      capabilitiesPrompt: prompt,
      buildIntent: "website",
      generationMode: "init",
      scaffoldMode: "auto",
      embeddingScaffoldMatch: false,
      capabilities: inferCapabilities(prompt),
      simpleWebsitePath: true,
      promptStrategyMeta: { strategy: "direct", promptType: "freeform" },
    });

    expect(base.resolvedScaffold?.allowedBuildIntents).toContain("website");
    expect(base.resolvedScaffold?.id).not.toBe("app-shell");
    expect(base.buildSpec.buildIntent).toBe("website");
    expect(base.scaffoldSelection?.selectedScaffold).toBe(base.resolvedScaffold?.id);
  });
});
