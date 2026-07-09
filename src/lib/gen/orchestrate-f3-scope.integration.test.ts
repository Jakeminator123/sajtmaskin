import { describe, expect, it, vi } from "vitest";

// Force the dossier pipeline ON (off by default under NODE_ENV=test) so the
// real selection + F3-scope path runs end-to-end through
// `resolveOrchestrationBase` against the real dossier registry.
vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return {
    ...actual,
    FEATURES: { ...actual.FEATURES, useDossierPipeline: true },
  };
});

import { resolveOrchestrationBase, type OrchestrationInput } from "./orchestrate";
import type { FollowUpContract } from "./orchestration-snapshot";
import type { InferredCapabilities } from "./capability-inference";

const noCapabilities: InferredCapabilities = {
  needsMotion: false,
  needs3D: false,
  needsPhysics: false,
  needsParallax: false,
  needsPayments: false,
  needsSubscriptions: false,
  needsCharts: false,
  needsDatabase: false,
  needsAuth: false,
  needsAppShell: false,
  needsDataUI: false,
  needsForms: false,
  needsGame: false,
  needsEcommerce: false,
  needsCarousel: false,
  needsPremiumVisuals: false,
  needsCalendar: false,
  needsCommandSearch: false,
  needsThemeToggle: false,
};

function followUpContract(capabilities: string[]): FollowUpContract {
  return {
    baseVersionId: "ver_base",
    snapshotBrief: null,
    scaffoldId: null,
    variantId: null,
    routePlan: { existingRoutePaths: [], existingShellRoutePaths: [] },
    capabilities,
    f3ApprovedCapabilities: [],
    qualityTarget: null,
    previewSessionId: null,
  };
}

function baseInput(overrides: Partial<OrchestrationInput>): OrchestrationInput {
  const prompt = "Gör rubriken större och knappen blå.";
  return {
    prompt,
    rawPrompt: prompt,
    routePlanPrompt: prompt,
    buildSpecPrompt: prompt,
    contractsPrompt: prompt,
    capabilitiesPrompt: prompt,
    scaffoldMatchPrompt: prompt,
    buildIntent: "website",
    generationMode: "followUp",
    scaffoldMode: "auto",
    embeddingScaffoldMatch: false,
    previousFilesCount: 3,
    capabilities: noCapabilities,
    promptStrategyMeta: { strategy: "direct", promptType: "freeform" },
    ...overrides,
  };
}

// Review round 2, fix 11a: integration-level proof that the F3 capability
// scope ONLY runs in the integrations stage — design rounds keep the full
// can-only-grow floor untouched.
describe("resolveOrchestrationBase — F3 capability-scope stage gating", () => {
  it("design round does NOT scope: the floor restores a non-muted capability the message never mentions", async () => {
    const base = await resolveOrchestrationBase(
      baseInput({
        lifecycleStage: "design",
        followUpContract: followUpContract(["faq-section"]),
        previousFilePaths: ["app/page.tsx"],
      }),
    );
    // `faq-section` (soft, F2-usable) is restored by can-only-grow even though
    // this follow-up message is a pure visual tweak.
    expect(base.dossierRequestedCapabilities).toContain("faq-section");
  });

  it("integrations round DOES scope: floor-only capabilities without ask/approval/evidence are dropped, file-evidenced ones survive", async () => {
    const base = await resolveOrchestrationBase(
      baseInput({
        lifecycleStage: "integrations",
        // Inflated floor from earlier rounds: payments/analytics were brief
        // speculation; ai-tool-calling was actually built (file evidence).
        followUpContract: followUpContract([
          "payments",
          "analytics",
          "ai-tool-calling",
          "faq-section",
        ]),
        previousFilePaths: [
          "app/page.tsx",
          "app/api/assistant/route.ts",
          "components/ai-assistant.tsx",
        ],
      }),
    );
    expect(base.dossierRequestedCapabilities).toEqual(["ai-tool-calling"]);
    const selectedIds = (base.dossierSelection?.selected ?? []).map((s) => s.entry.id);
    expect(selectedIds).toEqual(["ai-tool-calling-chat"]);
  });

  it("integrations round with an empty scoped set selects NOTHING (brief fallback disabled)", async () => {
    const base = await resolveOrchestrationBase(
      baseInput({
        lifecycleStage: "integrations",
        // Brief nominates capabilities, but nothing is asked/approved/evidenced.
        brief: { requestedCapabilities: ["payments", "analytics"] },
        followUpContract: followUpContract([]),
        previousFilePaths: ["app/page.tsx"],
      }),
    );
    expect(base.dossierRequestedCapabilities).toEqual([]);
    expect(base.dossierSelection?.selected ?? []).toEqual([]);
  });
});
