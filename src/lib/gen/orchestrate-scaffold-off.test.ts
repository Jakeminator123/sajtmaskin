import { describe, expect, it } from "vitest";

import { resolveOrchestrationBase } from "./orchestrate";
import type { InferredCapabilities } from "./capability-inference";
import { SCAFFOLD_OFF_BASELINE_ID } from "./scaffolds/types";

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
});
