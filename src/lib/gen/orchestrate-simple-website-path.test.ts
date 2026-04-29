import { describe, expect, it } from "vitest";

import { resolveOrchestrationBase } from "./orchestrate";
import type { InferredCapabilities } from "./capability-inference";

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
    expect(base.componentReferences).toEqual([]);
    expect(base.dossierSelection).toBeNull();
  });
});
