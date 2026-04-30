import { describe, expect, it } from "vitest";

import type { InferredCapabilities } from "./capability-inference";
import {
  INFERRED_CAPABILITY_DOSSIER_BRIDGE,
  resolveDossierCapabilitiesFromInferredCapabilities,
} from "./capability-dossier-bridge";
import { filterDossierCapabilitiesForPrompt } from "./orchestrate";

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
    needsGame: false,
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
          needsEcommerce: true,
          needsPremiumVisuals: true,
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
          needsPhysics: true,
          needsParallax: true,
          needsPayments: true,
          needsAuth: true,
          needsForms: true,
          needsCarousel: true,
          needsCommandSearch: true,
        }),
      ),
    ).toEqual([
      "visual-3d",
      "physics-3d",
      "parallax-scroll",
      "parallax-pointer",
      "payments",
      "auth",
      "contact-form",
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
      "needsPhysics",
      "needsParallax",
      "needsPayments",
      "needsAuth",
      "needsForms",
      "needsCarousel",
      "needsCommandSearch",
    ]);
  });
});

describe("filterDossierCapabilitiesForPrompt", () => {
  it("keeps portfolio contact/gallery UI free of hard delivery and carousel dossiers in F2", () => {
    expect(
      filterDossierCapabilitiesForPrompt({
        capabilities: ["contact-form", "carousel"],
        prompt: "Create a portfolio website for a photographer with a gallery grid, about section, and contact form",
        previewPolicy: "fidelity2",
      }),
    ).toEqual([]);
  });

  it("keeps explicit delivery and carousel requests", () => {
    expect(
      filterDossierCapabilitiesForPrompt({
        capabilities: ["contact-form", "carousel"],
        prompt: "Create a contact form that sends email with Resend and an Embla carousel",
        previewPolicy: "fidelity2",
      }),
    ).toEqual(["contact-form", "carousel"]);
  });
});
