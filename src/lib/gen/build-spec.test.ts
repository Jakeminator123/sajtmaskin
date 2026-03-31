import { describe, expect, it } from "vitest";
import { deriveBuildSpec } from "./build-spec";
import type { PreGenerationContractContext } from "./pre-generation-contracts";
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
  source: "prompt",
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

const saasScaffold: ScaffoldManifest = {
  id: "saas-landing",
  family: "saas-landing",
  label: "SaaS",
  description: "SaaS landing scaffold",
  buildIntents: ["website", "app"],
  tags: [],
  promptHints: [],
  files: [],
};

describe("deriveBuildSpec", () => {
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
    expect(spec.tokenBudgets.scaffoldChars).toBe(20_000);
  });

  it("uses light context for narrow follow-up edits", () => {
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
    expect(spec.contextPolicy).toBe("light");
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
        source: "prompt",
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
      promptStrategyMeta: { strategy: "phase_plan_build_polish", promptType: "freeform" },
    });

    expect(spec.qualityTarget).toBe("release-candidate");
    expect(spec.previewPolicy).toBe("fidelity3");
    expect(spec.verificationPolicy).toBe("strict");
    expect(spec.referenceCategories).toContain("backend");
  });
});
