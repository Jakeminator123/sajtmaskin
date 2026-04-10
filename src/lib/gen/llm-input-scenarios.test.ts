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
    scaffoldFamily: "landing-page",
    routePlanSummary: "prompt:one-page:/",
    stylePack: "brand-led",
    qualityTarget: "standard",
    previewPolicy: "fidelity2",
    verificationPolicy: "standard",
    contextPolicy: "normal",
    referenceCategories: ["marketing-sites"],
    forbiddenPatterns: [],
    tokenBudgets: {
      scaffoldChars: 20_000,
      refsChars: 8_000,
      systemContextChars: 28_000,
      systemContextTokens: 8_750,
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
          scaffoldChars: 12_000,
          refsChars: 4_000,
          systemContextChars: 18_000,
          systemContextTokens: 5_625,
        },
      }),
      scaffoldContext: "scaffold",
    });
    expect(context).toContain("## Generation Mode: Follow-Up");
    expect(context).toContain("## Generation Profile");
  });

  it("follow-up with capability hints surfaces a dedicated capabilities block", async () => {
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

    expect(context).toContain("## Detected Capabilities");
    expect(context.indexOf("## Detected Capabilities")).toBeLessThan(
      context.indexOf("## Scaffold"),
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
