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

const FOLLOW_UP_PROMPT = "Byt bakgrundsfärgen på hero-sektionen till mörkblå.";

function importedFollowUpInput(overrides: Record<string, unknown> = {}) {
  return {
    prompt: FOLLOW_UP_PROMPT,
    rawPrompt: FOLLOW_UP_PROMPT,
    routePlanPrompt: FOLLOW_UP_PROMPT,
    buildSpecPrompt: FOLLOW_UP_PROMPT,
    contractsPrompt: FOLLOW_UP_PROMPT,
    scaffoldMatchPrompt: FOLLOW_UP_PROMPT,
    capabilitiesPrompt: FOLLOW_UP_PROMPT,
    buildIntent: "website" as const,
    generationMode: "followUp" as const,
    scaffoldMode: "auto" as const,
    embeddingScaffoldMatch: false,
    capabilities: noCapabilities,
    previousFilesCount: 40,
    existingRoutePaths: ["/"],
    promptStrategyMeta: { strategy: "direct" as const, promptType: "followup_general" as const },
    importedRepoMode: true,
    ...overrides,
  };
}

describe("resolveOrchestrationBase importedRepoMode (v0-template / ZIP follow-ups)", () => {
  it("never resolves a scaffold, even with scaffoldMode auto", async () => {
    const base = await resolveOrchestrationBase(importedFollowUpInput());

    expect(base.resolvedScaffold).toBeNull();
    expect(base.scaffoldSelection?.selectionMethod).toBe("off");
    expect(base.scaffoldContext).toBeUndefined();
    // Route plan / BuildSpec still resolve for the follow-up.
    expect(base.routePlan.routes.length).toBeGreaterThan(0);
    expect(base.buildSpec.previewPolicy).toBe("fidelity2");
  });

  it("neutralizes a persisted scaffold id pinned by older buggy follow-ups", async () => {
    const base = await resolveOrchestrationBase(
      importedFollowUpInput({ persistedScaffoldId: "landing-page" }),
    );

    expect(base.resolvedScaffold).toBeNull();
    expect(base.scaffoldSelection?.selectedScaffold).toBeNull();
  });

  it("ignores a contract scaffold id in the follow-up freeze clamp", async () => {
    const base = await resolveOrchestrationBase(
      importedFollowUpInput({
        followUpContract: {
          baseVersionId: null,
          snapshotBrief: null,
          scaffoldId: "landing-page",
          variantId: null,
          routePlan: { existingRoutePaths: ["/"], existingShellRoutePaths: [] },
          capabilities: [],
          f3ApprovedCapabilities: [],
          f3ApprovedProviders: [],
          qualityTarget: null,
          previewSessionId: null,
        },
      }),
    );

    expect(base.resolvedScaffold).toBeNull();
  });
});
