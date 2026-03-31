/**
 * End-to-end orchestration chain (prompt → scaffold match → BuildSpec) without LLM or DB.
 */
import { describe, expect, it } from "vitest";
import type { BuildIntent } from "@/lib/builder/build-intent";
import type { InferredCapabilities } from "@/lib/gen/capability-inference";
import { deriveBuildSpec } from "@/lib/gen/build-spec";
import type { PreGenerationContractContext } from "@/lib/gen/pre-generation-contracts";
import { inferPreGenerationContracts } from "@/lib/gen/pre-generation-contracts";
import { buildRoutePlan } from "@/lib/gen/route-plan";
import { matchScaffold } from "@/lib/gen/scaffolds/matcher";

const minimalCapabilities: InferredCapabilities = {
  needsMotion: false,
  needs3D: false,
  needsCharts: false,
  needsDatabase: false,
  needsAuth: false,
  needsAppShell: false,
  needsDataUI: false,
  needsForms: false,
  needsEcommerce: false,
  needsCarousel: false,
  needsPremiumVisuals: false,
};

/** Explicit empty planner-style contracts (null providers = unset). */
const emptyContracts = {
  contracts: {
    dataMode: "none" as const,
    databaseProvider: null,
    authProvider: null,
    paymentProvider: null,
    integrations: [],
    envVars: [],
  },
  unresolvedDecisions: [],
  confirmedAnswers: [],
} as unknown as PreGenerationContractContext;

function assertBuildSpecFromChain(
  prompt: string,
  buildIntent: BuildIntent,
  matched: NonNullable<ReturnType<typeof matchScaffold>>,
): void {
  const preGenerationContracts = inferPreGenerationContracts({
    prompt,
    buildIntent,
    capabilities: minimalCapabilities,
  });

  const routePlan = buildRoutePlan({
    prompt,
    buildIntent,
    brief: null,
    resolvedScaffold: matched,
  });

  const spec = deriveBuildSpec({
    prompt,
    buildIntent,
    generationMode: "init",
    resolvedScaffold: matched,
    routePlan,
    preGenerationContracts,
  });

  expect(spec.generationMode).toBe("init");
  expect(spec.scaffoldFamily).toBe(matched.family);
  expect(spec.stylePack.trim().length).toBeGreaterThan(0);
  expect(spec.tokenBudgets.scaffoldChars).toBeGreaterThan(0);
  expect(spec.tokenBudgets.refsChars).toBeGreaterThan(0);
  expect(spec.previewPolicy).toBe("fidelity2");
}

describe("orchestration integration (matchScaffold → deriveBuildSpec)", () => {
  it("minimal emptyContracts matches inferPreGenerationContracts on empty corpus", () => {
    const inferred = inferPreGenerationContracts({
      prompt: "",
      buildIntent: "website",
      capabilities: minimalCapabilities,
    });
    expect(emptyContracts.contracts.dataMode).toBe(inferred.contracts.dataMode);
    expect(emptyContracts.contracts.integrations).toEqual([]);
    expect(emptyContracts.contracts.envVars).toEqual([]);
    expect(emptyContracts.unresolvedDecisions).toEqual([]);
    expect(emptyContracts.confirmedAnswers).toEqual([]);
  });

  it("deriveBuildSpec works with explicit emptyContracts and buildRoutePlan", () => {
    const prompt = "Bygg en modern SaaS-landningssida med pricing och features";
    const buildIntent: BuildIntent = "website";
    const matched = matchScaffold(prompt, buildIntent)!;
    const routePlan = buildRoutePlan({
      prompt,
      buildIntent,
      brief: null,
      resolvedScaffold: matched,
    });
    const spec = deriveBuildSpec({
      prompt,
      buildIntent,
      generationMode: "init",
      resolvedScaffold: matched,
      routePlan,
      preGenerationContracts: emptyContracts,
    });
    expect(spec.generationMode).toBe("init");
    expect(spec.scaffoldFamily).toBe("saas-landing");
    expect(spec.previewPolicy).toBe("fidelity2");
  });

  it("SaaS landing prompt → saas-landing + BuildSpec invariants", () => {
    const prompt = "Bygg en modern SaaS-landningssida med pricing och features";
    const buildIntent: BuildIntent = "website";
    const matched = matchScaffold(prompt, buildIntent);
    expect(matched?.id).toBe("saas-landing");
    assertBuildSpecFromChain(prompt, buildIntent, matched!);
  });

  it("portfolio prompt → portfolio + BuildSpec invariants", () => {
    const prompt = "Skapa en portfolio för en fotograf med bildgalleri";
    const buildIntent: BuildIntent = "website";
    const matched = matchScaffold(prompt, buildIntent);
    expect(matched?.id).toBe("portfolio");
    assertBuildSpecFromChain(prompt, buildIntent, matched!);
  });

  it("admin dashboard prompt with app intent → dashboard + BuildSpec invariants", () => {
    const prompt = "Build an admin dashboard with user management and analytics";
    const buildIntent: BuildIntent = "app";
    const matched = matchScaffold(prompt, buildIntent);
    expect(matched?.id).toBe("dashboard");
    assertBuildSpecFromChain(prompt, buildIntent, matched!);
  });

  it("blog prompt → blog + BuildSpec invariants", () => {
    // Matcher needs ≥2 whole-word blog hits (MIN_SCORE); compound "författarprofiler" does not match keyword "författare".
    const prompt = "Jag vill ha en blogg med kategorier, innehåll och författarprofiler";
    const buildIntent: BuildIntent = "website";
    const matched = matchScaffold(prompt, buildIntent);
    expect(matched?.id).toBe("blog");
    assertBuildSpecFromChain(prompt, buildIntent, matched!);
  });

  it("login/signup prompt → auth-pages + BuildSpec invariants", () => {
    const prompt = "Create a login page with signup and password recovery";
    const buildIntent: BuildIntent = "website";
    const matched = matchScaffold(prompt, buildIntent);
    expect(matched?.id).toBe("auth-pages");
    assertBuildSpecFromChain(prompt, buildIntent, matched!);
  });

  it("webshop prompt → ecommerce + BuildSpec invariants", () => {
    const prompt = "Bygg en webshop med produktkatalog och kundvagn";
    const buildIntent: BuildIntent = "website";
    const matched = matchScaffold(prompt, buildIntent);
    expect(matched?.id).toBe("ecommerce");
    assertBuildSpecFromChain(prompt, buildIntent, matched!);
  });

  it("consultant homepage prompt with website intent → landing-page + BuildSpec invariants", () => {
    const prompt = "Skapa en enkel hemsida för min konsultfirma";
    const buildIntent: BuildIntent = "website";
    const matched = matchScaffold(prompt, buildIntent);
    expect(matched?.id).toBe("landing-page");
    assertBuildSpecFromChain(prompt, buildIntent, matched!);
  });
});
