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
    scaffoldChars: 12_000,
    refsChars: 4_000,
    systemContextChars: 18_000,
  },
};

describe("buildDynamicContext", () => {
  it("does not inject KB or template-library sections", async () => {
    const { context } = await buildDynamicContext({
      intent: "website",
      originalPrompt: "Build a SaaS website with product storytelling.",
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

  describe("Generation Profile", () => {
    it("still includes Generation Profile for light follow-up when buildSpec is present", async () => {
      const { context } = await buildDynamicContext({
        intent: "website",
        originalPrompt: "Förbättra copy och SEO i hero-sektionen men behåll designen.",
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
        originalPrompt: "Build a landing page.",
        generationMode: "init",
        scaffoldContext: "Scaffold context",
      });

      expect(context).not.toContain("## Generation Profile");
    });

    it("lists forbiddenPatterns when non-empty", async () => {
      const { context } = await buildDynamicContext({
        intent: "website",
        originalPrompt: "Tweak hero copy only.",
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
        originalPrompt: "Tweak hero copy only.",
        generationMode: "followUp",
        buildSpec: { ...lightFollowUpSpec, forbiddenPatterns: [] },
        scaffoldContext: "Scaffold context",
      });

      expect(context).toContain("## Generation Profile");
      expect(context).not.toContain("**Forbidden patterns:**");
    });
  });

  describe("prompt assembly integration", () => {
    it("init website with brief surfaces intent, profile, project context, and original request in order", async () => {
      const { context } = await buildDynamicContext({
        intent: "website",
        generationMode: "init",
        originalPrompt: "Build a professional law firm website",
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
      expect(context).toContain("## Original Request");
      expect(context).toContain("Build a professional law firm website");

      const buildIntentIdx = context.indexOf("## Build Intent: Website");
      const profileIdx = context.indexOf("## Generation Profile");
      const scaffoldIdx = context.indexOf("## Scaffold");
      const projectIdx = context.indexOf("## Project Context");
      const originalIdx = context.indexOf("## Original Request");
      expect(buildIntentIdx).toBeLessThan(profileIdx);
      expect(profileIdx).toBeLessThan(scaffoldIdx);
      expect(scaffoldIdx).toBeLessThan(projectIdx);
      expect(projectIdx).toBeLessThan(originalIdx);
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
        originalPrompt: "Build an internal admin application",
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
        originalPrompt: "Tweak hero copy only; keep layout.",
        generationMode: "followUp",
        buildSpec: lightFollowUpSpec,
        scaffoldContext: "Scaffold context",
      });

      expect(context).not.toContain("## Relevant Documentation");
      expect(context).not.toContain("## Relevant Template References");
      expect(context).toContain("## Generation Mode: Follow-Up");
      expect(context).toContain("## Generation Profile");
    });

    it("truncates very long original request in follow-up mode", async () => {
      const long = "x".repeat(500);
      const { context } = await buildDynamicContext({
        intent: "website",
        originalPrompt: long,
        generationMode: "followUp",
        buildSpec: lightFollowUpSpec,
        scaffoldContext: "Scaffold",
      });

      expect(context).toContain("## Original Request (summary)");
      expect(context).toContain("500 chars, truncated");
    });
  });
});
