import { describe, expect, it } from "vitest";
import { deriveBuildSpec, deriveFollowUpContextPolicy } from "./build-spec";
import type { PreGenerationContractContext } from "./contract/pre-generation-contracts";
import type { RoutePlan } from "./route-plan";
import type { ScaffoldManifest } from "./scaffolds/types";

const emptyContracts: PreGenerationContractContext = {
  contracts: {
    dataMode: "none",
    integrations: [],
    envVars: [],
  },
  unresolvedDecisions: [],
  confirmedAnswers: [],
};

const marketingRoutePlan: RoutePlan = {
  provenance: { primarySource: "prompt", sources: ["prompt"] },
  siteType: "one-page",
  reason: "test",
  routes: [
    {
      path: "/",
      name: "Home",
      intent: "Primary landing page",
      required: true,
    },
  ],
};

const multiPageWebsiteRoutePlan: RoutePlan = {
  provenance: { primarySource: "prompt", sources: ["prompt"] },
  siteType: "brochure",
  reason: "test",
  routes: [
    { path: "/", name: "Home", intent: "Primary landing page", required: true },
    { path: "/om-oss", name: "Om oss", intent: "About page", required: false },
    { path: "/produkter", name: "Produkter", intent: "Catalog page", required: false },
  ],
};

const saasScaffold: ScaffoldManifest = {
  id: "saas-landing",
  family: "saas-landing",
  label: "SaaS",
  description: "SaaS landing scaffold",
  allowedBuildIntents: ["website", "app"],
  tags: [],
  promptHints: [],
  files: [],
};

describe("deriveBuildSpec", () => {
  it("reuses the same small-follow-up gate for file-context and BuildSpec light policy", () => {
    expect(
      deriveFollowUpContextPolicy({
        prompt: "Update the CTA route in the header and tighten the spacing.",
        followUpIntent: "clear-refine",
        capabilityHeavy: false,
      }),
    ).toBe("light");

    expect(
      deriveFollowUpContextPolicy({
        prompt: "Lägg till en klickbar karusell med klockor och en 3D-figur som skjuter laser över hero-sektionen.",
        followUpIntent: "clear-refine",
        capabilityHeavy: true,
      }),
    ).toBe("normal");

    expect(
      deriveFollowUpContextPolicy({
        prompt: "Gör om från grunden med mörk editorial stil och ny layout.",
        followUpIntent: "clear-redesign",
        capabilityHeavy: false,
      }),
    ).toBe("normal");
  });

  it("keeps init generations compact and deterministic", () => {
    const spec = deriveBuildSpec({
      prompt: "Bygg en modern hemsida för ett arkitektkontor.",
      buildIntent: "website",
      generationMode: "init",
      resolvedScaffold: null,
      routePlan: marketingRoutePlan,
      preGenerationContracts: emptyContracts,
      promptStrategyMeta: { strategy: "direct", promptType: "freeform" },
    });

    expect(spec.buildIntent).toBe("website");
    expect(spec.generationMode).toBe("init");
    expect(spec.changeScope).toBe("redesign");
    expect(spec.previewPolicy).toBe("fidelity2");
    expect(spec.verificationPolicy).toBe("standard");
    expect(spec.contextPolicy).toBe("normal");
    expect(spec.tokenBudgets.scaffoldTokens).toBe(15_000);
    expect(spec.tokenBudgets.scaffoldChars).toBe(48_000);
  });

  it("uses normal context by default for narrow follow-up edits", () => {
    const spec = deriveBuildSpec({
      prompt: "Förbättra copy och SEO i hero-sektionen men behåll designen.",
      buildIntent: "website",
      generationMode: "followUp",
      resolvedScaffold: saasScaffold,
      routePlan: marketingRoutePlan,
      preGenerationContracts: emptyContracts,
      promptStrategyMeta: { strategy: "direct", promptType: "followup_general" },
    });

    expect(spec.changeScope).toBe("copy");
    expect(spec.contextPolicy).toBe("normal");
    expect(spec.verificationPolicy).toBe("fast");
    expect(spec.forbiddenPatterns).toContain("layout_reset_for_copy_change");
    expect(spec.forbiddenPatterns).toContain("unrequested_full_redesign");
  });

  it("promotes release-candidate prompts to fidelity3", () => {
    const spec = deriveBuildSpec({
      prompt: "Gör detta deploy-ready och ready for production med billing och auth.",
      buildIntent: "app",
      generationMode: "init",
      resolvedScaffold: saasScaffold,
      routePlan: {
        provenance: { primarySource: "prompt", sources: ["prompt"] },
        siteType: "app-shell",
        reason: "test",
        routes: [
          { path: "/", name: "Dashboard", intent: "Main app", required: true },
          { path: "/billing", name: "Billing", intent: "Billing", required: true },
          { path: "/settings", name: "Settings", intent: "Settings", required: true },
        ],
      },
      preGenerationContracts: {
        contracts: {
          dataMode: "persisted",
          databaseProvider: "Supabase",
          authProvider: "NextAuth / Auth.js",
          paymentProvider: "Stripe",
          integrations: [
            { provider: "Stripe", name: "Stripe", reason: "billing", status: "chosen", envVars: [] },
          ],
          envVars: [],
        },
        unresolvedDecisions: [],
        confirmedAnswers: [],
      },
      promptStrategyMeta: { strategy: "phase_plan_build_refine", promptType: "freeform" },
    });

    expect(spec.qualityTarget).toBe("release-candidate");
    expect(spec.previewPolicy).toBe("fidelity3");
    expect(spec.verificationPolicy).toBe("strict");
    expect(spec.referenceCategories).toContain("backend");
  });

  it("uses normal context and standard verification for page-addition follow-ups", () => {
    const spec = deriveBuildSpec({
      prompt: "Add a new contact page with a form.",
      buildIntent: "website",
      generationMode: "followUp",
      resolvedScaffold: saasScaffold,
      routePlan: marketingRoutePlan,
      preGenerationContracts: emptyContracts,
      promptStrategyMeta: { strategy: "direct", promptType: "followup_general" },
    });

    expect(spec.changeScope).toBe("page-addition");
    expect(spec.contextPolicy).toBe("normal");
    expect(spec.verificationPolicy).toBe("standard");
    expect(spec.contextPolicy).not.toBe("light");
    expect(spec.verificationPolicy).not.toBe("fast");
  });

  it("keeps explicitly small local-layout follow-ups on light context", () => {
    const spec = deriveBuildSpec({
      prompt: "Update the CTA route in the header and tighten the spacing.",
      buildIntent: "website",
      generationMode: "followUp",
      resolvedScaffold: saasScaffold,
      routePlan: marketingRoutePlan,
      preGenerationContracts: emptyContracts,
      promptStrategyMeta: { strategy: "direct", promptType: "followup_general" },
    });

    expect(spec.changeScope).toBe("local-layout");
    expect(spec.contextPolicy).toBe("light");
    expect(spec.verificationPolicy).toBe("fast");
  });

  it("keeps targeted repair follow-ups at least normal context", () => {
    const spec = deriveBuildSpec({
      prompt: `AUTO-FIX REQUEST — TARGETED REPAIR

Issues detected: typecheck failed.

Persisted errors for this version:
- [quality-gate:typecheck] app/opengraph-image.tsx(11,14): error TS2304: Cannot find name 'ImageResponse'.`,
      buildIntent: "website",
      generationMode: "followUp",
      resolvedScaffold: saasScaffold,
      routePlan: marketingRoutePlan,
      preGenerationContracts: emptyContracts,
      promptStrategyMeta: { strategy: "direct", promptType: "freeform" },
    });

    expect(spec.changeScope).toBe("local-layout");
    expect(spec.contextPolicy).toBe("normal");
  });

  it("keeps capability-heavy visual follow-ups off the light/fast path", () => {
    const spec = deriveBuildSpec({
      prompt: "Lägg till en klickbar karusell med klockor och en 3D-figur som skjuter laser över hero-sektionen.",
      buildIntent: "website",
      generationMode: "followUp",
      resolvedScaffold: saasScaffold,
      routePlan: marketingRoutePlan,
      preGenerationContracts: emptyContracts,
      promptStrategyMeta: { strategy: "direct", promptType: "followup_general" },
      capabilities: {
        needsMotion: true,
        needs3D: true,
        needsCharts: false,
        needsDatabase: false,
        needsAuth: false,
        needsAppShell: false,
        needsDataUI: false,
        needsForms: false,
        needsEcommerce: false,
        needsCarousel: true,
        needsPremiumVisuals: false,
      },
    });

    expect(spec.changeScope).toBe("local-layout");
    expect(spec.contextPolicy).toBe("normal");
    expect(spec.verificationPolicy).toBe("standard");
  });

  it("keeps redesign follow-ups at least normal context with standard verification", () => {
    const spec = deriveBuildSpec({
      prompt: "Jag vill ha en full redesign av landningssidan.",
      buildIntent: "website",
      generationMode: "followUp",
      resolvedScaffold: saasScaffold,
      routePlan: marketingRoutePlan,
      preGenerationContracts: emptyContracts,
      promptStrategyMeta: { strategy: "direct", promptType: "followup_general" },
    });

    expect(spec.changeScope).toBe("redesign");
    expect(spec.contextPolicy).not.toBe("light");
    expect(["normal", "heavy"] as const).toContain(spec.contextPolicy);
    expect(spec.verificationPolicy).toBe("standard");
    expect(spec.forbiddenPatterns).not.toContain("unrequested_full_redesign");
  });

  it("promotes app init with multiple integrations to premium quality and heavy context", () => {
    const spec = deriveBuildSpec({
      prompt: "Bygg en dashboard med Stripe och Supabase.",
      buildIntent: "app",
      generationMode: "init",
      resolvedScaffold: null,
      routePlan: {
        provenance: { primarySource: "prompt", sources: ["prompt"] },
        siteType: "app-shell",
        reason: "test",
        routes: [{ path: "/", name: "App", intent: "Main", required: true }],
      },
      preGenerationContracts: {
        contracts: {
          dataMode: "none",
          integrations: [
            { provider: "Stripe", name: "Stripe", reason: "billing", status: "chosen", envVars: [] },
            { provider: "Supabase", name: "Supabase", reason: "db", status: "chosen", envVars: [] },
          ],
          envVars: [],
        },
        unresolvedDecisions: [],
        confirmedAnswers: [],
      },
      promptStrategyMeta: { strategy: "direct", promptType: "freeform" },
    });

    expect(spec.changeScope).toBe("integration");
    expect(spec.qualityTarget).toBe("premium");
    expect(spec.contextPolicy).toBe("heavy");
  });

  it("keeps common multi-page websites at standard quality when they lack app/integration signals", () => {
    const spec = deriveBuildSpec({
      prompt: "Bygg en hemsida för ett lokalt företag med startsida, om oss och produkter.",
      buildIntent: "website",
      generationMode: "init",
      resolvedScaffold: null,
      routePlan: multiPageWebsiteRoutePlan,
      preGenerationContracts: emptyContracts,
      promptStrategyMeta: { strategy: "direct", promptType: "freeform" },
    });

    expect(spec.changeScope).toBe("page-addition");
    expect(spec.qualityTarget).toBe("standard");
    expect(spec.contextPolicy).toBe("normal");
  });

  it("maps tokenBudgets to contextPolicy levels (light, normal, heavy)", () => {
    const light = deriveBuildSpec({
      prompt: "Uppdatera bara rubriken, behåll layouten.",
      buildIntent: "website",
      generationMode: "followUp",
      resolvedScaffold: saasScaffold,
      routePlan: marketingRoutePlan,
      preGenerationContracts: emptyContracts,
      promptStrategyMeta: { strategy: "direct", promptType: "followup_general" },
    });
    expect(light.contextPolicy).toBe("light");
    expect(light.tokenBudgets).toEqual({
      scaffoldTokens: 11_250,
      refsTokens: 3_750,
      systemContextTokens: 15_000,
      scaffoldChars: 36_000,
      refsChars: 12_000,
      systemContextChars: 48_000,
    });

    const normal = deriveBuildSpec({
      prompt: "Add a new page for our services section.",
      buildIntent: "website",
      generationMode: "followUp",
      resolvedScaffold: saasScaffold,
      routePlan: marketingRoutePlan,
      preGenerationContracts: emptyContracts,
      promptStrategyMeta: { strategy: "direct", promptType: "followup_general" },
    });
    expect(normal.contextPolicy).toBe("normal");
    expect(normal.tokenBudgets).toEqual({
      scaffoldTokens: 15_000,
      refsTokens: 7_500,
      systemContextTokens: 30_000,
      scaffoldChars: 48_000,
      refsChars: 24_000,
      systemContextChars: 96_000,
    });

    const heavy = deriveBuildSpec({
      prompt: "Init med Redis och Clerk.",
      buildIntent: "website",
      generationMode: "init",
      resolvedScaffold: null,
      routePlan: marketingRoutePlan,
      preGenerationContracts: {
        contracts: {
          dataMode: "none",
          integrations: [
            { provider: "Redis", name: "Redis", reason: "cache", status: "chosen", envVars: [] },
            { provider: "Clerk", name: "Clerk", reason: "auth", status: "chosen", envVars: [] },
          ],
          envVars: [],
        },
        unresolvedDecisions: [],
        confirmedAnswers: [],
      },
      promptStrategyMeta: { strategy: "direct", promptType: "freeform" },
    });
    expect(heavy.contextPolicy).toBe("heavy");
    expect(heavy.tokenBudgets).toEqual({
      scaffoldTokens: 25_000,
      refsTokens: 12_500,
      systemContextTokens: 50_000,
      scaffoldChars: 80_000,
      refsChars: 40_000,
      systemContextChars: 160_000,
    });
  });

  it("adds unrequested_full_redesign to forbiddenPatterns for non-redesign follow-ups", () => {
    const pageAddition = deriveBuildSpec({
      prompt: "Ny sida för pricing.",
      buildIntent: "website",
      generationMode: "followUp",
      resolvedScaffold: saasScaffold,
      routePlan: marketingRoutePlan,
      preGenerationContracts: emptyContracts,
      promptStrategyMeta: { strategy: "direct", promptType: "followup_general" },
    });
    expect(pageAddition.changeScope).toBe("page-addition");
    expect(pageAddition.forbiddenPatterns).toContain("unrequested_full_redesign");

    const localLayout = deriveBuildSpec({
      prompt: "Justera spacing i hero-sektionen.",
      buildIntent: "website",
      generationMode: "followUp",
      resolvedScaffold: saasScaffold,
      routePlan: marketingRoutePlan,
      preGenerationContracts: emptyContracts,
      promptStrategyMeta: { strategy: "direct", promptType: "followup_general" },
    });
    expect(localLayout.changeScope).toBe("local-layout");
    expect(localLayout.forbiddenPatterns).toContain("unrequested_full_redesign");
  });
});
