import { describe, expect, it, vi } from "vitest";

import { buildInitBuildChoicesMeta, DEFAULT_INIT_BUILD_CHOICES } from "@/lib/builder/init-build-choices";
import { resolveThemePalette } from "@/lib/builder/theme-presets";
import { getDefaultPaletteState } from "@/lib/builder/palette";
import { detectFollowUpCapabilities } from "@/lib/builder/follow-up-capability-detection";
import { formatBriefBuildChoicesForPrompt } from "@/lib/builder/brief-build-choices-format";
import { inferCapabilities } from "./capability-inference";
import { buildGenerationInputPackage } from "./orchestrate/generation-package";
import { finalizeOrchestrationPrompts, resolveOrchestrationBase, type OrchestrationInput } from "./orchestrate";
import { buildVariantHintsForBrief, formatVariantHintsForPrompt } from "./scaffold-variants";
import { resolveVariantForStyleChoice } from "./scaffold-variants/style-choice-variants";
import { getScaffoldById, matchScaffold } from "./scaffolds";
import { searchScaffoldsWithDiagnostics } from "./scaffolds/scaffold-search";

vi.mock("@/lib/config", async (original) => {
  const actual = await original<typeof import("@/lib/config")>();
  return { ...actual, FEATURES: { ...actual.FEATURES, useDossierPipeline: true } };
});
vi.mock("./data/shadcn-ui-recipes", () => ({ resolveShadcnUiRecipes: async () => [] }));
vi.mock("./scaffolds/scaffold-search", () => ({ searchScaffoldsWithDiagnostics: vi.fn() }));
vi.mock("./scaffold-variants", async (original) => ({
  ...await original<typeof import("./scaffold-variants")>(),
  resolveVariantTemplateInspiration: async () => null,
}));
vi.mock("./system-prompt", async (original) => ({
  ...await original<typeof import("./system-prompt")>(),
  composeEngineSystemPrompt: (dynamicContext: string) => dynamicContext,
}));

const bearPrompt = "En sida om björnungar";
const warmApp = buildInitBuildChoicesMeta({
  ...DEFAULT_INIT_BUILD_CHOICES, buildTarget: "app", style: "warm", colorMode: "light",
});

function generationInput(prompt: string, overrides: Partial<OrchestrationInput> = {}): OrchestrationInput {
  return {
    prompt, rawPrompt: prompt, scaffoldMatchPrompt: prompt, routePlanPrompt: prompt,
    generationMode: "init", lifecycleStage: "design", scaffoldMode: "auto",
    embeddingScaffoldMatch: false, buildIntent: "app", ...warmApp,
    designThemePreset: "orange", componentPalette: getDefaultPaletteState(),
    brief: {
      pages: [{ name: "Upptäck", path: "/", purpose: "Läs om björnungar, deras föda och livsmiljö." }],
      visualDirection: { styleKeywords: ["personal", "creative"], colorPalette: { primary: "#abcdef" } },
    },
    ...overrides,
  };
}

describe("content subjects from Byggval through brief and generation", () => {
  it("keeps the requested app, reading route, warm presentation and locked orange palette", async () => {
    // This is the keyword-only pre-match used before Deep Brief.
    const prematch = matchScaffold(bearPrompt, warmApp.buildIntent);
    expect(prematch?.id).toBe("base-nextjs");
    const preVariant = resolveVariantForStyleChoice(prematch?.id, warmApp.styleChoiceHint);
    const hints = buildVariantHintsForBrief(prematch, preVariant);
    expect(formatVariantHintsForPrompt(hints!)).toContain("caption");

    vi.mocked(searchScaffoldsWithDiagnostics).mockResolvedValue({
      results: [{ scaffold: getScaffoldById("app-shell")!, score: 0.79 }],
      diagnostics: { attempted: true, available: true, failed: false, unavailableReason: null, errorMessage: null, durationMs: 3 },
    });
    const input = generationInput(bearPrompt, { embeddingScaffoldMatch: true, variantHintId: preVariant?.id });
    const base = await resolveOrchestrationBase(input);
    const final = await finalizeOrchestrationPrompts(base, input);
    expect(base.buildSpec.buildIntent).toBe("app");
    expect(base.resolvedScaffold?.allowedBuildIntents).toContain("app");
    expect(base.resolvedScaffold?.id).toBe(prematch?.id);
    expect(base.routePlan.siteType).toBe("one-page");
    expect(base.routePlan.routes).toMatchObject([{ name: "Upptäck", path: "/" }]);
    expect(base.dossierSelection?.selected).toEqual([]);
    expect(base.mutedCapabilities).toEqual([]);
    expect(final.variantSelection).toMatchObject({ source: "style-choice", finalId: "studio-soft" });
    const palette = resolveThemePalette("orange", "light")!;
    expect(final.dynamicContext).toContain(palette.primary);
    expect(final.dynamicContext).toContain(palette.background);
    expect(final.dynamicContext).not.toContain("#abcdef");
    expect(final.dynamicContext).not.toContain(preVariant!.themeTokens!.primary);
    expect(preVariant!.themeTokens!.radius).toBeTruthy();
    expect(final.dynamicContext).toContain(preVariant!.themeTokens!.radius!);
    const pkg = buildGenerationInputPackage(base, input, final);
    expect(pkg.brief).toMatchObject({ visualDirection: {
      styleKeywords: ["personal", "creative"],
      colorPalette: { primary: palette.primary, background: palette.background, text: palette.foreground },
    } });
    expect(input.brief).toMatchObject({ visualDirection: { colorPalette: { primary: "#abcdef" } } });
    expect(input.componentPalette?.selections.map(({ id }) => id)).toEqual([
      "dialog", "sheet", "badge", "accordion", "carousel", "tooltip",
    ]);
  });

  it.each([
    ["Skapa en app om fjärilar", "app", "app-shell"],
    ["Build an app about bear cubs", "app", "app-shell"],
    ["Bygg en page about owls", "website", "base-nextjs"],
    ["Make a page about owls in a personal, creative style", "website", "base-nextjs"],
    ["Create a personal, creative website for a photographer", "website", "portfolio"],
    ["En sida om ormar med en CRM-widget", "app", "app-shell"],
    ["Build a site about turtles with a widget", "app", "app-shell"],
    ["An app about owls with login and password reset", "app", "auth-pages"],
    ["A webpage about owls with login and password reset", "app", "auth-pages"],
    ["Bygg en dashboard med nyckeltal och diagram", "app", "dashboard"],
    ["Create a portfolio site with selected work", "website", "portfolio"],
  ] as const)("keeps the independent product ask in %s", async (prompt, buildIntent, expected) => {
    expect(matchScaffold(prompt, buildIntent)?.id).toBe(expected);
    const base = await resolveOrchestrationBase(generationInput(prompt, { buildIntent, brief: null }));
    expect(base.resolvedScaffold?.id).toBe(expected);
    expect(base.buildSpec.buildIntent).toBe(buildIntent);
    if (expected === "base-nextjs") {
      expect(base.routePlan.routes).toMatchObject([{ path: "/", name: "Home" }]);
    }
  });

  it("passes the build target to Deep Brief without assigning product layout", () => {
    expect(formatBriefBuildChoicesForPrompt(warmApp)?.split("\n")).toContain("- Build intent (user choice): app");
  });

  it.each([
    ["restaurant", "product gallery"], ["restaurant", "product catalog"],
    ["salon", "product gallery"], ["salon", "product catalog"],
  ])("keeps a %s %s free of checkout requirements in init", async (domain, feature) => {
    const prompt = `Build a website about a ${domain} with a ${feature}`;
    const base = await resolveOrchestrationBase(generationInput(prompt, { buildIntent: "website", brief: null }));
    expect(base.capabilities.needsEcommerce).toBe(false);
    expect(base.resolvedScaffold?.id).not.toBe("ecommerce");
    expect(base.capabilityHints ?? "").not.toContain("cart");
    expect(base.capabilityHints ?? "").not.toContain("checkout");
    expect(base.routePlan.routes.map(({ path }) => path)).not.toContain("/cart");
    expect(base.routePlan.routes.map(({ path }) => path)).not.toContain("/checkout");
  });

  it.each([
    "En app om att planera mina arbetsuppgifter",
    "An app about tracking my customers",
    "En app om tidrapportering för personal",
    "En app om stråkplanering",
    "An app about inventory reconciliation",
  ])("keeps operational app wording eligible for both matching stages: %s", async (prompt) => {
    expect(matchScaffold(prompt, "app")?.id).toBe("app-shell");
    vi.mocked(searchScaffoldsWithDiagnostics).mockResolvedValue({
      results: [{ scaffold: getScaffoldById("dashboard")!, score: 0.82 }],
      diagnostics: { attempted: true, available: true, failed: false, unavailableReason: null, errorMessage: null, durationMs: 3 },
    });
    const base = await resolveOrchestrationBase(generationInput(prompt, { brief: null, embeddingScaffoldMatch: true }));
    expect(base.resolvedScaffold?.id).toBe("dashboard");
    expect(base.routePlan.siteType).toBe("app-shell");
  });

  it.each([
    ["En sida om CRM-system", "app"],
    ["En informationssida om inloggning", "app"],
    ["En informationssida om inloggning", "website"],
    ["En informationssajt om inloggning", "app"],
    ["En informationssajt om inloggning", "website"],
    ["An informational website about login", "website"],
    ["A webpage about login and password recovery", "app"],
    ["En sida om CRM utan inloggning", "app"],
    ["En sida om björnungar där besökare inte ska kunna logga in", "app"],
    ["Björnungar där besökare inte ska kunna logga in", "app"],
    ["Build a webpage about owls", "website"],
  ] as const)("keeps topics and rejected features out of routes and functional capabilities: %s (%s)", async (prompt, buildIntent) => {
    const capabilities = inferCapabilities(prompt);
    const detected = detectFollowUpCapabilities(prompt, { mode: "init" });
    const input = generationInput(prompt, {
      buildIntent, capabilities, requestedDossierCapabilities: detected.capabilityIds,
      brief: { pages: [{ path: "/", name: "Guide", purpose: `Introduktion: ${prompt}` }] },
    });
    const base = await resolveOrchestrationBase(input);
    expect(capabilities.needsAuth).toBe(false);
    expect(detected.capabilityIds).not.toContain("auth");
    expect(matchScaffold(prompt, buildIntent)?.id).toBe("base-nextjs");
    expect(base.resolvedScaffold?.id).toBe("base-nextjs");
    expect(base.routePlan.routes.map(({ path }) => path)).toEqual(["/"]);
    expect(base.capabilities.needsAuth).toBe(false);
    expect(base.capabilities.needsAppShell).toBe(false);
    expect(base.mutedCapabilities).not.toContain("auth");
    const integrations = await resolveOrchestrationBase({ ...input, lifecycleStage: "integrations" });
    expect(integrations.dossierSelection?.selected.some(({ entry }) => entry.capability === "auth")).toBe(false);
  });

  it.each([
    ["En sida om CRM-system med inloggning", "app"],
    ["En informationssida om inloggning där besökare behöver kunna logga in", "app"],
    ["En informationssida om inloggning där besökare behöver kunna logga in", "website"],
    ["Build a webpage about owls including a login form", "app"],
    ["Build a webpage about owls featuring a login form", "app"],
    ["Build a webpage about owls to include a login form", "app"],
    ["Build a webpage about owls featuring a login form", "website"],
  ] as const)("keeps a login request after a content subject: %s (%s)", async (prompt, buildIntent) => {
    const detected = detectFollowUpCapabilities(prompt, { mode: "init" });
    expect(inferCapabilities(prompt)).toMatchObject({ needsAppShell: false, needsAuth: true });
    expect(detected.capabilityIds).toContain("auth");
    const input = generationInput(prompt, { buildIntent, brief: null, requestedDossierCapabilities: detected.capabilityIds });
    const base = await resolveOrchestrationBase(input);
    if (buildIntent === "app") expect(base.routePlan.routes.map(({ path }) => path)).toContain("/login");
    expect(base.mutedCapabilities).toContain("auth");
    const integrations = await resolveOrchestrationBase({ ...input, lifecycleStage: "integrations" });
    expect(integrations.dossierSelection?.selected.some(({ entry }) => entry.capability === "auth")).toBe(true);
  });

  it.each([
    "Build a webpage about owls including a 3D model",
    "Build a webpage about owls featuring a 3D model",
    "Build a webpage about owls to include a 3D model",
  ])("carries the requested 3D model through init in %s", async (prompt) => {
    const detected = detectFollowUpCapabilities(prompt, { mode: "init" });
    expect(inferCapabilities(prompt).needs3D).toBe(true);
    expect(detected.capabilityIds).toContain("visual-3d");
    const base = await resolveOrchestrationBase(generationInput(prompt, {
      buildIntent: "website", brief: null, requestedDossierCapabilities: detected.capabilityIds,
    }));
    expect(base.capabilities.needs3D).toBe(true);
    expect(base.dossierRequestedCapabilities).toContain("visual-3d");
    expect(base.dossierSelection?.selected.some(({ entry }) => entry.capability === "visual-3d")).toBe(true);
  });

  it.each([
    ["Build a webpage about owls featuring a login form", true, false],
    ["En sida om björnungar med ett formulär för inloggning", true, false],
    ["En sida om björnungar med kontaktformulär", false, true],
    ["Build a webpage about owls with a login form and a contact form", true, true],
    ["Build an app with login and a form that sends submissions to my email", true, true],
    ["Build an app with login, then a form that sends submissions to my email", true, true],
    ["Build an app with login, a separate form that sends submissions to my email", true, true],
    ["Build an app with login, add a form that sends submissions to my email", true, true],
    ["Bygg en app med inloggning, lägg till ett formulär som skickar svar till min e-post", true, true],
    ["Build an app with login then a form that sends submissions to my email", true, true],
    ["Bygg en app med inloggning, sedan ett formulär som skickar svar till min e-post", true, true],
    ["Bygg en app med inloggning och ett formulär som skickar svar till min e-post", true, true],
    ["Build an app with a login form and a survey form that emails the results to me", true, true],
    ["Build a login form that sends password reset emails", true, false],
    ["Add a login page with a form", true, false],
    ["Add a login page with a simple, accessible form", true, false],
    ["Lägg till en sida för inloggning med ett formulär", true, false],
  ] as const)("selects only the requested auth/contact integrations for %s", async (prompt, auth, contact) => {
    const input = generationInput(prompt, { buildIntent: "website", brief: null });
    const design = await resolveOrchestrationBase(input);
    const muted = design.mutedCapabilities ?? [];
    expect(muted.includes("auth")).toBe(auth);
    expect(muted.includes("contact-form")).toBe(contact);
    const integrations = await resolveOrchestrationBase({ ...input, lifecycleStage: "integrations" });
    const capabilities = integrations.dossierSelection?.selected.map(({ entry }) => entry.capability) ?? [];
    expect(capabilities.includes("auth")).toBe(auth);
    expect(capabilities.includes("contact-form")).toBe(contact);
    expect(integrations.preGenerationContracts.contracts.integrations.some(({ providerKey }) => providerKey === "resend"))
      .toBe(contact);
  });

  it("preserves prior auth/contact brief choices through the normal integration approval", async () => {
    const input = generationInput("Build a webpage about owls with a login form", {
      brief: { requestedCapabilities: ["auth", "contact-form"] },
    });
    const design = await resolveOrchestrationBase(input);
    expect(design.mutedCapabilities).toEqual(expect.arrayContaining(["auth", "contact-form"]));
    const base = await resolveOrchestrationBase({
      ...input, lifecycleStage: "integrations",
      requestedDossierCapabilities: design.mutedCapabilities,
      dossierProviderHints: ["clerk-auth", "resend-contact-form"],
    });
    const selected = base.dossierSelection?.selected.map(({ entry }) => entry.capability);
    expect(selected).toContain("auth");
    expect(selected).toContain("contact-form");
  });

  it("keeps validation guidance for a generic survey form", async () => {
    const base = await resolveOrchestrationBase(generationInput("Create a survey form", { brief: null }));
    expect(base.capabilities.needsForms).toBe(true);
    expect(base.capabilityHints).toContain("react-hook-form");
    expect(base.capabilityHints).toContain("zod");
  });

  it("preserves the brief palette when the customer leaves the color preset off", async () => {
    const input = generationInput(bearPrompt, { designThemePreset: "off" });
    const final = await finalizeOrchestrationPrompts(await resolveOrchestrationBase(input), input);
    expect(final.effectiveBrief).toBe(input.brief);
    expect(final.dynamicContext).toContain("#abcdef");
    expect(final.dynamicContext).not.toContain("## Locked Color Palette");
  });

  it.each([
    ["off", undefined], ["orange", undefined], ["off", "dark"],
  ] as const)("keeps the brief's surfaces with theme %s and mode %s", async (designThemePreset, colorModeHint) => {
    const input = generationInput(bearPrompt, {
      colorModeHint,
      designThemePreset,
      brief: { visualDirection: { colorPalette: {
        primary: "#abcdef", background: "#17121b", text: "#fff6eb",
      } } },
    });
    const base = await resolveOrchestrationBase(input);
    const final = await finalizeOrchestrationPrompts(base, input);
    const pkg = buildGenerationInputPackage(base, input, final);
    expect(pkg.brief).toMatchObject({ visualDirection: { colorPalette: {
      background: "#17121b", text: "#fff6eb",
    } } });
    expect(final.dynamicContext).toContain("#17121b");
    expect(final.dynamicContext).toContain("#fff6eb");
    expect(final.dynamicContext).not.toContain(resolveThemePalette("orange", "light")!.background);
  });

  it("respects manual App Shell, its optional route and an explicit page ceiling", async () => {
    const manual = { scaffoldMode: "manual" as const, scaffoldId: "app-shell" };
    const base = await resolveOrchestrationBase(generationInput(bearPrompt, manual));
    expect(base.resolvedScaffold?.id).toBe("app-shell");
    expect(base.routePlan.siteType).toBe("app-shell");
    expect(base.routePlan.routes.map(({ path }) => path)).toEqual(["/", "/settings"]);
    const capped = await resolveOrchestrationBase(generationInput(bearPrompt, { ...manual, pageCountHint: 1 }));
    expect(capped.resolvedScaffold?.id).toBe("app-shell");
    expect(capped.routePlan.routes.map(({ path }) => path)).toEqual(["/"]);
  });

  it("delivers a requested carousel in F2 and remembers an explicitly chosen hard provider for F3", async () => {
    const prompt = "En sida om björnungar med bildkarusell och inloggning via Clerk.";
    const detected = detectFollowUpCapabilities(prompt, { mode: "init" });
    const input = generationInput(prompt, { requestedDossierCapabilities: detected.capabilityIds });
    const design = await resolveOrchestrationBase(input);
    expect(design.dossierSelection?.selected.map(({ entry }) => entry.id)).toEqual(["embla-carousel"]);
    expect(design.mutedCapabilities).toContain("auth");
    expect(design.mutedDossierIds).toContain("clerk-auth");
    const integrations = await resolveOrchestrationBase({ ...input, lifecycleStage: "integrations" });
    expect(integrations.dossierSelection?.selected.map(({ entry }) => entry.id)).toContain("clerk-auth");
  });
});
