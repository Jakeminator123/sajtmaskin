/**
 * Step 3 — fasta scenarier för faktisk dynamisk kontext (ingen full E2E).
 * Verifierar att centrala `##`-block finns för typiska builder-lägen.
 */
import { describe, expect, it } from "vitest";
import type { BuildSpec } from "./build-spec";
import { buildDynamicContext } from "./system-prompt";

function baseSpec(overrides: Partial<BuildSpec> = {}): BuildSpec {
  return {
    buildIntent: "website",
    generationMode: "init",
    changeScope: "redesign",
    scaffoldId: "landing-page",
    routePlanSummary: "prompt:one-page:/",
    stylePack: "brand-led",
    qualityTarget: "standard",
    previewPolicy: "fidelity2",
    verificationPolicy: "standard",
    contextPolicy: "normal",
    referenceCategories: ["marketing-sites"],
    forbiddenPatterns: [],
    tokenBudgets: {
      scaffoldChars: 48_000,
      refsChars: 24_000,
      systemContextChars: 96_000,
      systemContextTokens: 30_000,
    },
    routeRealization: {
      mode: "full",
      primaryRoutePath: "/",
      fullRoutePaths: ["/"],
      shellRoutePaths: [],
    },
    ...overrides,
  };
}

describe("LLM input scenarios (dynamic context)", () => {
  it("enkel website: intent + scaffold + ev. project context", async () => {
    const { context, pruning } = await buildDynamicContext({
      intent: "website",
      generationMode: "init",
      brief: { projectTitle: "Café Solen" },
      buildSpec: baseSpec(),
      scaffoldContext: "## Scaffold: test\n\nbody",
    });
    expect(context).toContain("## Build Intent: Website");
    expect(context).toContain("## Scaffold Variant (this generation)");
    expect(context).toContain("## Scaffold");
    expect(context).toContain("## Project Context");
    expect(pruning.budgetTokens).toBeGreaterThan(0);
  });

  it("multipage website: route plan med flera routes", async () => {
    const { context } = await buildDynamicContext({
      intent: "website",
      generationMode: "init",
      routePlan: {
        provenance: { primarySource: "prompt", sources: ["prompt"] },
        siteType: "brochure",
        reason: "User asked for multiple pages",
        routes: [
          { path: "/", name: "Home", intent: "Landing", required: true },
          { path: "/about", name: "About", intent: "Story", required: true },
          { path: "/contact", name: "Contact", intent: "Form", required: true },
        ],
      },
      buildSpec: baseSpec({ routePlanSummary: "prompt:brochure:/,/about,/contact" }),
      scaffoldContext: "scaffold",
    });
    expect(context).toContain("## Route Plan");
    expect(context).toContain("/about");
    expect(context).toMatch(/Do not collapse|multi/i);
  });

  it("app-shell: application intent + app-shell site type", async () => {
    const { context } = await buildDynamicContext({
      intent: "app",
      generationMode: "init",
      routePlan: {
        provenance: { primarySource: "prompt", sources: ["prompt"] },
        siteType: "app-shell",
        reason: "Dashboard",
        routes: [
          { path: "/dashboard", name: "Dashboard", intent: "KPIs", required: true },
          { path: "/settings", name: "Settings", intent: "Config", required: true },
        ],
      },
      buildSpec: baseSpec({
        buildIntent: "app",
        qualityTarget: "premium",
        routePlanSummary: "prompt:app-shell:/dashboard,/settings",
      }),
      scaffoldContext: "scaffold",
    });
    expect(context).toContain("## Build Intent: Application");
    expect(context).toContain("## Route Plan");
    expect(context).toContain("/dashboard");
  });

  it("follow-up: follow-up mode och profile", async () => {
    const { context } = await buildDynamicContext({
      intent: "website",
      generationMode: "followUp",
      buildSpec: baseSpec({
        generationMode: "followUp",
        changeScope: "copy",
        contextPolicy: "light",
        verificationPolicy: "fast",
        tokenBudgets: {
          scaffoldChars: 36_000,
          refsChars: 12_000,
          systemContextChars: 48_000,
          systemContextTokens: 15_000,
        },
      }),
      scaffoldContext: "scaffold",
    });
    expect(context).toContain("## Generation Mode: Follow-Up");
    expect(context).toContain("## Generation Profile");
  });

  it("follow-up with capability hints surfaces the toolkit capability section", async () => {
    const { context } = await buildDynamicContext({
      intent: "website",
      generationMode: "followUp",
      buildSpec: baseSpec({
        generationMode: "followUp",
        changeScope: "local-layout",
        contextPolicy: "normal",
        verificationPolicy: "standard",
      }),
      capabilityHints:
        "## Detected Capabilities\n\n- **Carousel/slider requested**: Use shadcn Carousel.\n- **3D/WebGL requested**: Use @react-three/fiber.",
      scaffoldContext: "scaffold",
    });

    expect(context).toContain("## Your Toolkit");
    expect(context).toContain("- Capability-driven additions for this request:");
    expect(context).toContain("**Carousel/slider requested**: Use shadcn Carousel.");
    expect(context.indexOf("## Scaffold")).toBeLessThan(
      context.indexOf("## Your Toolkit"),
    );
  });

  it("redesign scope: bredare ändring signaleras via BuildSpec (changeScope redesign)", async () => {
    const { context } = await buildDynamicContext({
      intent: "website",
      generationMode: "followUp",
      buildSpec: baseSpec({
        generationMode: "followUp",
        changeScope: "redesign",
        contextPolicy: "normal",
      }),
      scaffoldContext: "scaffold",
    });
    expect(context).toContain("## Generation Profile");
    expect(context).toContain("- **Quality tier:**");
  });
});
