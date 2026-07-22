import { describe, expect, it } from "vitest";
import { classifySimpleWebsitePath } from "./simple-website-path";
import type { InferredCapabilities } from "@/lib/gen/capability-inference";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds/types";

const emptyCapabilities: InferredCapabilities = {
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

function scaffold(id: ScaffoldManifest["id"]): ScaffoldManifest {
  return {
    id,
    label: id,
    description: id,
    allowedBuildIntents: ["website"],
    tags: [],
    promptHints: [],
    files: [],
  };
}

function base(overrides: Partial<Parameters<typeof classifySimpleWebsitePath>[0]> = {}) {
  return classifySimpleWebsitePath({
    generationMode: "init",
    planMode: false,
    hasClientBrief: false,
    attachmentsCount: 0,
    hasCustomSystem: false,
    promptSourceTechnical: false,
    promptSourcePreservePayload: false,
    buildIntent: "website",
    promptStrategyMeta: { strategy: "direct", promptType: "freeform" },
    prompt: "Bygg en enkel hemsida för en lokal frisörsalong i Malmö.",
    preMatchScaffold: scaffold("landing-page"),
    capabilities: emptyCapabilities,
    ...overrides,
  });
}

describe("classifySimpleWebsitePath", () => {
  it("enables conservative simple init website prompts", () => {
    expect(base()).toMatchObject({
      enabled: true,
      reason: "enabled",
      scaffoldId: "landing-page",
    });
  });

  it("rejects plan mode, attachments, custom system and client brief", () => {
    expect(base({ planMode: true }).reason).toBe("plan_mode");
    expect(base({ attachmentsCount: 1 }).reason).toBe("has_attachments");
    expect(base({ hasCustomSystem: true }).reason).toBe("has_custom_system");
    expect(base({ hasClientBrief: true }).reason).toBe("has_client_brief");
  });

  it("rejects app/ecommerce/advanced intent signals", () => {
    expect(base({ buildIntent: "app" }).reason).toBe("unsupported_build_intent");
    expect(base({ preMatchScaffold: scaffold("ecommerce") }).reason).toBe("unsupported_scaffold");
    expect(
      base({ prompt: "Bygg en hemsida med login och Stripe checkout." }).reason,
    ).toBe("integration_or_contract_signal");
  });

  it("rejects explicit multi-route/page requests", () => {
    expect(
      base({ prompt: "Bygg en hemsida med separata sidor /om och /kontakt." }).reason,
    ).toBe("multi_route_signal");
    expect(
      base({ prompt: "Bygg en flersidig webbplats för en konsultbyrå." }).reason,
    ).toBe("multi_route_signal");
  });

  it("allows slash-separated descriptors that are not route paths", () => {
    expect(base({ prompt: "Bygg en restaurang/café-sida i Malmö." }).reason).toBe("enabled");
    expect(base({ prompt: "Bygg portfolio/CV för en designer." }).reason).toBe("enabled");
    expect(base({ prompt: "Bygg en UI/UX-byrå-sida." }).reason).toBe("enabled");
    expect(base({ prompt: "Bygg en HTML/CSS-kurssida." }).reason).toBe("enabled");
    expect(base({ prompt: "Bygg en B2B/B2C-landningssida." }).reason).toBe("enabled");
  });

  it("rejects heavy capabilities", () => {
    expect(
      base({
        capabilities: {
          ...emptyCapabilities,
          needs3D: true,
          needsMotion: true,
        },
      }).reason,
    ).toBe("heavy_capability");
  });

  it("rejects non-direct or non-freeform prompts", () => {
    expect(
      base({ promptStrategyMeta: { strategy: "phase_plan_build_refine", promptType: "freeform" } }).reason,
    ).toBe("unsupported_prompt_strategy");
    expect(
      base({ promptStrategyMeta: { strategy: "direct", promptType: "template" } }).reason,
    ).toBe("unsupported_prompt_strategy");
  });
});

// #242 Alt A (re-scoped by taxonomy 2026-07-22): a short init prompt that
// names a DOSSIER-BACKED section capability must leave the simple fast lane
// so the full dossier pipeline runs. The parked section dossiers (logo-cloud,
// stats-counter, feature-grid, cta-section, stepper) left the cue list —
// those are ordinary freehand content now. Remaining cues: gallery-lightbox
// + the new key-free map-display and site-search capabilities.
describe("classifySimpleWebsitePath — section_capability_signal (#242 Alt A)", () => {
  it("blocks each section capability cue", () => {
    const cases: Array<[string, string]> = [
      ["gallery-lightbox", "Bygg en enkel sida med ett bildgalleri och lightbox."],
      ["gallery-lightbox-sv", "Bygg en enkel sida där man kan förstora bilder."],
      ["map-display", "Bygg en enkel hemsida med en karta som visar hitta hit."],
      ["map-display-en", "Build a simple page with a store locator."],
      ["site-search", "Bygg en enkel hemsida med en sökfunktion."],
      ["site-search-en", "Build a simple site with site-search powered by minisearch."],
    ];
    for (const [, prompt] of cases) {
      expect(base({ prompt }).reason).toBe("section_capability_signal");
    }
  });

  it("uses the shared detector result for named capabilities outside the legacy regex", () => {
    expect(
      base({
        prompt: "Bygg en enkel sida med sök.",
        requestedDossierCapabilities: ["site-search"],
      }).reason,
    ).toBe("section_capability_signal");
  });

  it("does NOT block parked section phrases (freehand content now)", () => {
    // Former #242 cues — after the 2026-07-22 parking these are ordinary
    // marketing copy and must stay on the fast lane.
    expect(
      base({ prompt: "gör en enkel hemsida med kundloggor och nyckeltal" }).reason,
    ).toBe("enabled");
    expect(
      base({ prompt: "Bygg en enkel landningssida med en tydlig CTA." }).reason,
    ).toBe("enabled");
    expect(
      base({ prompt: "Bygg en enkel sida med en feature grid." }).reason,
    ).toBe("enabled");
  });

  it("does NOT block ordinary marketing copy without a section cue", () => {
    // Control: bare "features"/"tjänster" (no grid/section/cards qualifier) and
    // a plain local-business prompt stay on the fast lane.
    expect(base({ prompt: "Bygg en enkel hemsida för ett bageri med meny och öppettider." }).reason).toBe(
      "enabled",
    );
    expect(
      base({ prompt: "Bygg en enkel sida som visar våra features och tjänster." }).reason,
    ).toBe("enabled");
  });
});
