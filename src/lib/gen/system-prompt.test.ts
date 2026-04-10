import { describe, expect, it } from "vitest";
import type { BuildSpec } from "./build-spec";
import { buildDynamicContext } from "./system-prompt";

const lightFollowUpSpec: BuildSpec = {
  buildIntent: "website",
  generationMode: "followUp",
  changeScope: "copy",
  scaffoldFamily: "landing-page",
  routePlanSummary: "prompt:one-page:/",
  stylePack: "brand-led",
  qualityTarget: "standard",
  previewPolicy: "fidelity2",
  verificationPolicy: "fast",
  contextPolicy: "light",
  referenceCategories: ["marketing-sites"],
  forbiddenPatterns: ["leave_bracket_placeholders"],
  tokenBudgets: {
    scaffoldChars: 36_000,
    refsChars: 12_000,
    systemContextChars: 48_000,
  },
};

describe("buildDynamicContext", () => {
  it("does not inject KB or template-library sections", async () => {
    const { context } = await buildDynamicContext({
      intent: "website",
      generationMode: "init",
      buildSpec: {
        ...lightFollowUpSpec,
        generationMode: "init",
        changeScope: "redesign",
        contextPolicy: "heavy",
        verificationPolicy: "standard",
      },
      scaffoldContext: "Scaffold context",
    });

    expect(context).not.toContain("## Relevant Documentation");
    expect(context).not.toContain("## Relevant Template References");
    expect(context).not.toContain("## Reference Code Snippets");
    expect(context).not.toContain("## Preview vs CodeProject parity");
  });

  it("does not duplicate the user prompt as an Original Request block (carried by user message)", async () => {
    const { context } = await buildDynamicContext({
      intent: "website",
      generationMode: "init",
      buildSpec: {
        ...lightFollowUpSpec,
        generationMode: "init",
        changeScope: "redesign",
        contextPolicy: "normal",
        verificationPolicy: "standard",
      },
      scaffoldContext: "Scaffold context",
    });

    expect(context).not.toContain("## Original Request");
  });

  describe("Generation Profile", () => {
    it("still includes Generation Profile for light follow-up when buildSpec is present", async () => {
      const { context } = await buildDynamicContext({
        intent: "website",
        generationMode: "followUp",
        buildSpec: lightFollowUpSpec,
        scaffoldContext: "Scaffold context",
      });

      expect(context).toContain("## Generation Profile");
      expect(context).toContain("- **Style direction:** brand-led");
      expect(context).toContain("- **Quality tier:** standard");
      expect(context).toContain("- **Reference families:** marketing-sites");
    });

    it("omits Generation Profile when buildSpec is absent", async () => {
      const { context } = await buildDynamicContext({
        intent: "website",
        generationMode: "init",
        scaffoldContext: "Scaffold context",
      });

      expect(context).not.toContain("## Generation Profile");
    });

    it("lists forbiddenPatterns when non-empty", async () => {
      const { context } = await buildDynamicContext({
        intent: "website",
        generationMode: "followUp",
        buildSpec: {
          ...lightFollowUpSpec,
          forbiddenPatterns: ["no-lorem", "no-stock-photos"],
        },
        scaffoldContext: "Scaffold context",
      });

      expect(context).toContain("- **Forbidden patterns:** no-lorem, no-stock-photos");
    });

    it("omits the Forbidden patterns line when forbiddenPatterns is empty", async () => {
      const { context } = await buildDynamicContext({
        intent: "website",
        generationMode: "followUp",
        buildSpec: { ...lightFollowUpSpec, forbiddenPatterns: [] },
        scaffoldContext: "Scaffold context",
      });

      expect(context).toContain("## Generation Profile");
      expect(context).not.toContain("**Forbidden patterns:**");
    });
  });

  describe("prompt assembly integration", () => {
    it("init website with brief surfaces intent, profile, scaffold, and project context in order", async () => {
      const { context } = await buildDynamicContext({
        intent: "website",
        generationMode: "init",
        brief: {
          projectTitle: "Advokatbyrån Lindström",
          brandName: "Lindström & Co",
        },
        buildSpec: {
          ...lightFollowUpSpec,
          buildIntent: "website",
          generationMode: "init",
          changeScope: "redesign",
          contextPolicy: "normal",
          verificationPolicy: "standard",
        },
        scaffoldContext: "Scaffold context",
      });

      expect(context).toContain("## Build Intent: Website");
      expect(context).toContain("## Generation Profile");
      expect(context).toContain("- **Style direction:** brand-led");
      expect(context).toContain("## Project Context");
      expect(context).toContain("Lindström");

      const buildIntentIdx = context.indexOf("## Build Intent: Website");
      const profileIdx = context.indexOf("## Generation Profile");
      const scaffoldIdx = context.indexOf("## Scaffold");
      const projectIdx = context.indexOf("## Project Context");
      expect(buildIntentIdx).toBeLessThan(profileIdx);
      expect(profileIdx).toBeLessThan(scaffoldIdx);
      expect(scaffoldIdx).toBeLessThan(projectIdx);
    });

    it("init app with route plan surfaces application intent, routes, and multi-page instruction", async () => {
      const routePlan = {
        provenance: { primarySource: "prompt" as const, sources: ["prompt" as const] },
        siteType: "app-shell" as const,
        reason: "Multi-area dashboard application",
        routes: [
          { path: "/dashboard", name: "Dashboard", intent: "Overview and KPIs", required: true },
          { path: "/settings", name: "Settings", intent: "Workspace and account settings", required: true },
          { path: "/users", name: "Users", intent: "User and role management", required: true },
        ],
      };

      const { context } = await buildDynamicContext({
        intent: "app",
        generationMode: "init",
        routePlan,
        buildSpec: {
          ...lightFollowUpSpec,
          buildIntent: "app",
          generationMode: "init",
          changeScope: "redesign",
          contextPolicy: "normal",
          verificationPolicy: "standard",
        },
        scaffoldContext: "Scaffold context",
      });

      expect(context).toContain("## Build Intent: Application");
      expect(context).toContain("## Route Plan");
      expect(context).toContain("/dashboard");
      expect(context).toContain(
        "Do not collapse this into a single long landing page. Create real App Router page files for the required routes unless the user explicitly asks to simplify.",
      );

      const buildIntentIdx = context.indexOf("## Build Intent: Application");
      const profileIdx = context.indexOf("## Generation Profile");
      const routePlanIdx = context.indexOf("## Route Plan");
      expect(buildIntentIdx).toBeLessThan(profileIdx);
      expect(profileIdx).toBeLessThan(routePlanIdx);
    });

    it("follow-up keeps mode and profile without retrieval sections", async () => {
      const { context } = await buildDynamicContext({
        intent: "website",
        generationMode: "followUp",
        buildSpec: lightFollowUpSpec,
        scaffoldContext: "Scaffold context",
      });

      expect(context).not.toContain("## Relevant Documentation");
      expect(context).not.toContain("## Relevant Template References");
      expect(context).toContain("## Generation Mode: Follow-Up");
      expect(context).toContain("## Generation Profile");
    });

    it("surfaces capability hints as a separate top-level block", async () => {
      const { context } = await buildDynamicContext({
        intent: "website",
        generationMode: "followUp",
        buildSpec: {
          ...lightFollowUpSpec,
          contextPolicy: "normal",
          verificationPolicy: "standard",
        },
        capabilityHints: "## Detected Capabilities\n\n- **Carousel/slider requested**: Use shadcn Carousel.\n- **3D/WebGL requested**: Use @react-three/fiber.",
        scaffoldContext: "Scaffold context",
      });

      expect(context).toContain("## Detected Capabilities");
      expect(context).toContain("## Scaffold");
      expect(context.indexOf("## Detected Capabilities")).toBeLessThan(
        context.indexOf("## Scaffold"),
      );
    });

    it("describes follow-up work as editing the current project state", async () => {
      const { context } = await buildDynamicContext({
        intent: "website",
        generationMode: "followUp",
        buildSpec: lightFollowUpSpec,
        scaffoldContext: "Scaffold context",
      });

      expect(context).toContain("current project state");
      expect(context).toContain("previous generations");
      expect(context).not.toContain("established in the initial generation");
    });

    it("returns pruning metadata and block trace when systemContextTokens is tight", async () => {
      const { context, pruning, blocks } = await buildDynamicContext({
        intent: "website",
        generationMode: "init",
        brief: {
          projectTitle: "Acme",
          pages: [{ name: "Home", path: "/", purpose: "Marketing", sections: [{ type: "hero", heading: "Welcome" }] }],
          seo: { titleTemplate: "T".repeat(200), metaDescription: "D".repeat(200), keywords: ["a", "b", "c"] },
        },
        buildSpec: {
          ...lightFollowUpSpec,
          buildIntent: "website",
          generationMode: "init",
          changeScope: "redesign",
          contextPolicy: "normal",
          verificationPolicy: "standard",
          tokenBudgets: {
            ...lightFollowUpSpec.tokenBudgets,
            // Minimum enforced in buildDynamicContext is 900 tokens
            systemContextTokens: 900,
          },
        },
        scaffoldContext: "Scaffold body ".repeat(80),
      });

      expect(pruning.budgetTokens).toBe(900);
      expect(pruning.usedTokens).toBeGreaterThan(0);
      expect(context.length).toBeGreaterThan(0);
      expect(pruning.droppedBlockKeys.length + pruning.keptBlockKeys.length).toBeGreaterThan(0);
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks.some((block) => block.title === "Build Intent: Website")).toBe(true);
      expect(blocks.some((block) => block.kept)).toBe(true);
    });
  });
});
