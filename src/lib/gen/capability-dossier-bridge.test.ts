import { describe, expect, it } from "vitest";

import type { InferredCapabilities } from "./capability-inference";
import {
  INFERRED_CAPABILITY_DOSSIER_BRIDGE,
  resolveDossierCapabilitiesFromInferredCapabilities,
} from "./capability-dossier-bridge";

function capabilities(overrides: Partial<InferredCapabilities> = {}): InferredCapabilities {
  return {
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
    ...overrides,
  };
}

describe("resolveDossierCapabilitiesFromInferredCapabilities", () => {
  it("returns no dossier capabilities when bridge flags are false", () => {
    expect(
      resolveDossierCapabilitiesFromInferredCapabilities(
        capabilities({
          needsMotion: true,
          needsCharts: true,
          needsDatabase: true,
          needsForms: true,
          needsEcommerce: true,
          needsPremiumVisuals: true,
          needsCalendar: true,
          needsThemeToggle: true,
        }),
      ),
    ).toEqual([]);
  });

  it("preserves the existing capability-id output order", () => {
    expect(
      resolveDossierCapabilitiesFromInferredCapabilities(
        capabilities({
          needs3D: true,
          needsParallax: true,
          needsPayments: true,
          needsAuth: true,
          needsCarousel: true,
          needsCommandSearch: true,
        }),
      ),
    ).toEqual([
      "visual-3d",
      "parallax-scroll",
      "parallax-pointer",
      "payments",
      "auth",
      "carousel",
      "command-search",
    ]);
  });

  it("keeps parallax mapped to both dossier capabilities", () => {
    expect(
      resolveDossierCapabilitiesFromInferredCapabilities(
        capabilities({ needsParallax: true }),
      ),
    ).toEqual(["parallax-scroll", "parallax-pointer"]);
  });

  it("keeps the declarative bridge table narrow", () => {
    expect(INFERRED_CAPABILITY_DOSSIER_BRIDGE.map((entry) => entry.flag)).toEqual([
      "needs3D",
      "needsParallax",
      "needsPayments",
      "needsAuth",
      "needsCarousel",
      "needsCommandSearch",
    ]);
  });
});
