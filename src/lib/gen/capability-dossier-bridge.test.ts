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
          needsEcommerce: true,
          needsPremiumVisuals: true,
          needsThemeToggle: true,
        }),
      ),
    ).toEqual([]);
  });

  it("bridges needsDatabase to the database dossier capability (no-brief init fallback)", () => {
    // Codex P1 (#445): a raw init prompt like "booking app that saves bookings
    // in Postgres" sets needsDatabase; without the bridge no database dossier
    // is ever selected when the Deep Brief is skipped/empty.
    expect(
      resolveDossierCapabilitiesFromInferredCapabilities(
        capabilities({ needsDatabase: true }),
      ),
    ).toEqual(["database"]);
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
          needsGame: true,
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
      "interactive-game",
    ]);
  });

  it("keeps parallax mapped to both dossier capabilities", () => {
    expect(
      resolveDossierCapabilitiesFromInferredCapabilities(
        capabilities({ needsParallax: true }),
      ),
    ).toEqual(["parallax-scroll", "parallax-pointer"]);
  });

  it("bridges needsGame to the interactive-game dossier capability", () => {
    expect(
      resolveDossierCapabilitiesFromInferredCapabilities(
        capabilities({ needsGame: true }),
      ),
    ).toEqual(["interactive-game"]);
  });

  it("lights up game + visual-3d + physics together for a physics-driven 3D game", () => {
    // "Bygg ett 3D-spel där bollar studsar" triggers all three flags so the
    // codegen LLM sees the game contract AND the ThreeCanvasShell verbatim
    // file AND the rapier physics guidance without competing instructions.
    expect(
      resolveDossierCapabilitiesFromInferredCapabilities(
        capabilities({
          needsGame: true,
          needs3D: true,
          needsPhysics: true,
        }),
      ),
    ).toEqual(["visual-3d", "physics-3d", "interactive-game"]);
  });

  it("keeps the declarative bridge table narrow", () => {
    expect(INFERRED_CAPABILITY_DOSSIER_BRIDGE.map((entry) => entry.flag)).toEqual([
      "needs3D",
      "needsPhysics",
      "needsParallax",
      "needsPayments",
      "needsAuth",
      "needsDatabase",
      "needsForms",
      "needsCarousel",
      "needsCommandSearch",
      "needsGame",
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

  it("keeps explicit carousel requests in F2, but contact-form (email delivery) is strictly F3", () => {
    // Email delivery is an F3 integration: even an explicit "sends email with
    // Resend" prompt must not inject the resend dossier into F2 (its verbatim
    // server route imports `resend`, which the F2 SDK deny-list strips —
    // shipping a broken /api/contact). F2 renders the form as a visual mockup.
    expect(
      filterDossierCapabilitiesForPrompt({
        capabilities: ["contact-form", "carousel"],
        prompt: "Create a contact form that sends email with Resend and an Embla carousel",
        previewPolicy: "fidelity2",
      }),
    ).toEqual(["carousel"]);
  });

  it("keeps contact-form in F3 (integrations)", () => {
    expect(
      filterDossierCapabilitiesForPrompt({
        capabilities: ["contact-form"],
        prompt: "Bygg integrationer",
        previewPolicy: "fidelity3",
      }),
    ).toEqual(["contact-form"]);
  });

  it("drops LLM-suggested visual-3d on a cinematic/immersive prompt with no 3D words", () => {
    expect(
      filterDossierCapabilitiesForPrompt({
        capabilities: ["visual-3d"],
        prompt:
          "A cinematic western cinema premiere landing page that feels immersive, dramatic, and moody",
        previewPolicy: "fidelity2",
      }),
    ).toEqual([]);
  });

  it("keeps visual-3d when the prompt explicitly asks for 3D/WebGL", () => {
    expect(
      filterDossierCapabilitiesForPrompt({
        capabilities: ["visual-3d"],
        prompt: "Build a hero with a rotating 3D model using WebGL / three.js",
        previewPolicy: "fidelity2",
      }),
    ).toEqual(["visual-3d"]);
  });
});
