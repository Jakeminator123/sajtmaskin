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
