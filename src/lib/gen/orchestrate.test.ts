import { describe, expect, it } from "vitest";

import {
  filterDossierCapabilitiesForPrompt,
  inheritQualityTargetFromPriorVersion,
  resolveBuildIntentPromotion,
  type BuildIntentPromotionInput,
} from "./orchestrate";
import type { BuildSpec, BuildSpecQualityTarget } from "./build-spec";

function makeBuildSpec(overrides: Partial<BuildSpec> = {}): BuildSpec {
  return {
    buildIntent: "website",
    generationMode: "followUp",
    changeScope: "redesign",
    scaffoldId: null,
    routePlanSummary: "",
    stylePack: "neutral",
    qualityTarget: "standard",
    previewPolicy: "fidelity2",
    verificationPolicy: "standard",
    contextPolicy: "light",
    referenceCategories: [],
    forbiddenPatterns: [],
    tokenBudgets: {
      scaffoldChars: 6_250,
      refsChars: 4_000,
      systemContextChars: 16_000,
    },
    ...overrides,
  } satisfies BuildSpec;
}

describe("inheritQualityTargetFromPriorVersion (P22)", () => {
  it("inherits prior qualityTarget upward (e.g. standard base, premium prior)", () => {
    const baseSpec = makeBuildSpec({
      generationMode: "followUp",
      qualityTarget: "standard" satisfies BuildSpecQualityTarget,
    });
    const result = inheritQualityTargetFromPriorVersion("chat-1", baseSpec, "premium");
    expect(result.qualityTarget).toBe("premium");
    expect(result).not.toBe(baseSpec);
  });

  it("does NOT inherit when prior target would lower rank (premium base, standard prior)", () => {
    const baseSpec = makeBuildSpec({
      generationMode: "followUp",
      qualityTarget: "premium",
    });
    const result = inheritQualityTargetFromPriorVersion("chat-1", baseSpec, "standard");
    expect(result).toBe(baseSpec);
    expect(result.qualityTarget).toBe("premium");
  });

  it("does NOT inherit when prior would lower release-candidate (F3) → premium", () => {
    const baseSpec = makeBuildSpec({
      generationMode: "followUp",
      qualityTarget: "release-candidate",
    });
    const result = inheritQualityTargetFromPriorVersion("chat-1", baseSpec, "premium");
    expect(result).toBe(baseSpec);
    expect(result.qualityTarget).toBe("release-candidate");
  });

  it("leaves baseSpec untouched when no prior qualityTarget is provided", () => {
    const baseSpec = makeBuildSpec({
      generationMode: "followUp",
      qualityTarget: "premium",
    });
    const result = inheritQualityTargetFromPriorVersion("chat-1", baseSpec, null);
    expect(result).toBe(baseSpec);
  });

  it("does not inherit on init runs even when a prior target is given", () => {
    const baseSpec = makeBuildSpec({
      generationMode: "init",
      qualityTarget: "premium",
    });
    const result = inheritQualityTargetFromPriorVersion("chat-1", baseSpec, "release-candidate");
    expect(result).toBe(baseSpec);
    expect(result.qualityTarget).toBe("premium");
  });

  it("is a no-op when prior target equals current target", () => {
    const baseSpec = makeBuildSpec({
      generationMode: "followUp",
      qualityTarget: "premium",
    });
    const result = inheritQualityTargetFromPriorVersion("chat-1", baseSpec, "premium");
    expect(result).toBe(baseSpec);
  });
});

describe("resolveBuildIntentPromotion (P26 / OMTAG Fas 2·A)", () => {
  function makeInput(
    overrides: Partial<BuildIntentPromotionInput> = {},
  ): BuildIntentPromotionInput {
    return {
      buildIntent: "website",
      scaffoldMode: "auto",
      resolvedScaffoldId: "app-shell",
      selectionConfidence: "high",
      resolvedMode: "init",
      persistedScaffoldId: null,
      ignorePersistedScaffoldForMatch: false,
      ...overrides,
    };
  }

  it("promotes website -> app on init when auto matcher lands on app-shell with confidence", () => {
    const result = resolveBuildIntentPromotion(makeInput({ resolvedMode: "init" }));
    expect(result.wouldPromote).toBe(true);
    expect(result.blockedForFollowUp).toBe(false);
    expect(result.promoted).toBe(true);
  });

  it("blocks promotion on follow-up when a persisted non-app scaffold is pinned (P26 regression)", () => {
    // This is the P26 bug: a bildbyte on a landing-page project made the
    // scaffold matcher fallback to `app-shell`, which then promoted the
    // whole chat's build_intent to `app`. The fix suppresses promotion on
    // follow-ups whose persisted scaffold is non-app.
    const result = resolveBuildIntentPromotion(
      makeInput({
        resolvedMode: "followUp",
        persistedScaffoldId: "landing-page",
      }),
    );
    expect(result.wouldPromote).toBe(true);
    expect(result.blockedForFollowUp).toBe(true);
    expect(result.promoted).toBe(false);
  });

  it("still promotes follow-up when persisted scaffold is already app-type", () => {
    const result = resolveBuildIntentPromotion(
      makeInput({
        resolvedMode: "followUp",
        persistedScaffoldId: "app-shell",
      }),
    );
    expect(result.promoted).toBe(true);
  });

  it("promotes follow-up when caller opts into clear-redesign (ignorePersistedScaffoldForMatch)", () => {
    // clear-redesign runs explicitly release the scaffold lock. Promotion
    // has to go through in that case; the guard only fires when the lock is
    // actually in effect.
    const result = resolveBuildIntentPromotion(
      makeInput({
        resolvedMode: "followUp",
        persistedScaffoldId: "landing-page",
        ignorePersistedScaffoldForMatch: true,
      }),
    );
    expect(result.promoted).toBe(true);
  });

  it("does not promote when selection confidence is low", () => {
    const result = resolveBuildIntentPromotion(
      makeInput({ selectionConfidence: "low" }),
    );
    expect(result.wouldPromote).toBe(false);
    expect(result.promoted).toBe(false);
  });

  it("does not promote when the resolved scaffold is not an app scaffold", () => {
    const result = resolveBuildIntentPromotion(
      makeInput({ resolvedScaffoldId: "landing-page" }),
    );
    expect(result.wouldPromote).toBe(false);
    expect(result.promoted).toBe(false);
  });

  it("does not promote when the user already asked for an app build", () => {
    // `app` inputs never feed through the promotion path — promotion only
    // triggers on `website` → `app`.
    const result = resolveBuildIntentPromotion(makeInput({ buildIntent: "app" }));
    expect(result.wouldPromote).toBe(false);
    expect(result.promoted).toBe(false);
  });

  it("does not promote when scaffoldMode is manual (user pinned the scaffold explicitly)", () => {
    const result = resolveBuildIntentPromotion(makeInput({ scaffoldMode: "manual" }));
    expect(result.wouldPromote).toBe(false);
  });
});

describe("filterDossierCapabilitiesForPrompt (#198 physics-3d invariant)", () => {
  it("drops physics-3d when visual-3d is gated out on a non-3D prompt", () => {
    const result = filterDossierCapabilitiesForPrompt({
      capabilities: ["physics-3d", "visual-3d"],
      prompt: "a cinematic landing page for a law firm",
      previewPolicy: "fidelity2",
    });
    // visual-3d is dropped (no explicit 3D request) → physics-3d must follow,
    // otherwise we ship a physics dossier with no Three.js renderer.
    expect(result).not.toContain("visual-3d");
    expect(result).not.toContain("physics-3d");
  });

  it("keeps physics-3d when the prompt explicitly requests 3D", () => {
    const result = filterDossierCapabilitiesForPrompt({
      capabilities: ["physics-3d", "visual-3d"],
      prompt: "a three.js webgl scene with gravity and falling objects",
      previewPolicy: "fidelity2",
    });
    expect(result).toContain("visual-3d");
    expect(result).toContain("physics-3d");
  });

  it("leaves unrelated capabilities untouched", () => {
    const result = filterDossierCapabilitiesForPrompt({
      capabilities: ["parallax-scroll", "command-search"],
      prompt: "a marketing site",
      previewPolicy: "fidelity2",
    });
    expect(result).toEqual(["parallax-scroll", "command-search"]);
  });
});
