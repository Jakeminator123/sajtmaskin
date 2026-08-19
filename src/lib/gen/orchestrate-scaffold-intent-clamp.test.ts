import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./scaffolds/scaffold-search", () => ({
  searchScaffoldsWithDiagnostics: vi.fn(),
}));

// Keeps this suite hermetic: since B8 removed the simple-website fast lane,
// `resolveOrchestrationBase` resolves shadcn UI recipes over HTTP on every
// request. Scaffold/intent clamping does not depend on recipes.
vi.mock("./data/shadcn-ui-recipes", () => ({
  resolveShadcnUiRecipes: vi.fn(async () => []),
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

/**
 * Scaffold- och build-intent-klamp i `resolveOrchestrationBase`.
 *
 * Filen hette tidigare `orchestrate-simple-website-path.test.ts` och satte
 * `simpleWebsitePath: true` enbart för att slippa shadcn-/dossier-IO. Det
 * snabbspåret finns inte längre (B8), så namnet pekade på ett borttaget
 * begrepp medan testerna hela tiden handlat om klampningen nedan.
 */
describe("resolveOrchestrationBase scaffold/intent clamping", () => {
  beforeEach(() => {
    mockedSearchScaffoldsWithDiagnostics.mockReset();
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

  it("keeps tone-only brief data out of production-like embedding selection", async () => {
    const portfolio = getScaffoldById("portfolio");
    expect(portfolio).toBeTruthy();
    mockedSearchScaffoldsWithDiagnostics.mockImplementation(async (query) => ({
      results: query.includes("Tone: personal, creative")
        ? [{ scaffold: portfolio!, score: 0.9 }]
        : [],
      diagnostics: {
        attempted: true,
        available: true,
        failed: false,
        unavailableReason: null,
        errorMessage: null,
        durationMs: 8,
      },
    }));
    const prompt = "Jag vill ha en hemsida för min verksamhet.";
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
      // Production defaults this to true. The query-sensitive stub makes
      // the old tone leak select portfolio while the corrected path stays
      // on the generic website baseline.
      embeddingScaffoldMatch: true,
      brief: { toneAndVoice: ["personal", "creative"] },
      capabilities: noCapabilities,
      promptStrategyMeta: { strategy: "direct", promptType: "freeform" },
    });

    expect(mockedSearchScaffoldsWithDiagnostics).toHaveBeenCalledWith(
      expect.not.stringContaining("Tone:"),
      expect.any(Number),
    );
    expect(base.resolvedScaffold?.id).toBe("landing-page");
    expect(base.scaffoldSelection?.keywordScores.portfolio).toBe(0);
    expect(base.scaffoldSelection?.briefContextApplied).toBe(false);
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
      promptStrategyMeta: { strategy: "direct", promptType: "freeform" },
    });

    expect(base.resolvedScaffold?.allowedBuildIntents).toContain("website");
    expect(base.resolvedScaffold?.id).not.toBe("app-shell");
    expect(base.buildSpec.buildIntent).toBe("website");
    expect(base.scaffoldSelection?.selectedScaffold).toBe(base.resolvedScaffold?.id);
  });
});
