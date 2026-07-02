import { describe, expect, it } from "vitest";
import type { BuildSpec } from "./build-spec";
import { buildDynamicContext } from "./system-prompt";

const lightFollowUpSpec: BuildSpec = {
  buildIntent: "website",
  generationMode: "followUp",
  changeScope: "copy",
  scaffoldId: "landing-page",
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
  routeRealization: {
    mode: "full",
    primaryRoutePath: "/",
    fullRoutePaths: ["/"],
    shellRoutePaths: [],
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
      expect(context).toContain("## Scaffold Variant (this generation)");
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

    it("surfaces the variant signature motif, font pairings, and prompt hints in the variant block", async () => {
      // Generic guidance fields (styleRules, sectionInventory, avoidPatterns,
      // worldClassRubric) were removed from variants 2026-04-17 (Val A) — the
      // variant block now relies on its high-signal design axes (motif, fonts,
      // promptHints, themeTokens). See docs/contracts/scaffold-system.md.
      const { context } = await buildDynamicContext({
        intent: "website",
        generationMode: "init",
        buildSpec: {
          ...lightFollowUpSpec,
          buildIntent: "website",
          generationMode: "init",
          changeScope: "redesign",
          contextPolicy: "normal",
          verificationPolicy: "standard",
        },
        scaffoldContext: "Scaffold context",
        resolvedVariant: {
          id: "landing-page/editorial-lux",
          scaffoldId: "landing-page",
          label: "Editorial Lux",
          description: "Luxury editorial landing page",
          keywords: ["editorial", "luxury"],
          fontPairings: [{ heading: "Playfair Display", body: "Inter" }],
          signatureMotif: "Large image-led editorial rhythm",
          colorMode: "light",
          promptHints: ["Lead with an editorial hero and layered credibility"],
          sourceTemplateIds: ["vercel-acme"],
        },
      });

      expect(context).toContain("## Scaffold Variant (this generation)");
      expect(context).toContain("Large image-led editorial rhythm");
      expect(context).toContain("Playfair Display + Inter");
      expect(context).toContain("Lead with an editorial hero and layered credibility");
      // The legacy guidance blocks must NOT appear anymore.
      expect(context).not.toContain("- **Style rules from curated references:**");
      expect(context).not.toContain("- **Section inventory to favor:**");
      expect(context).not.toContain("- **Avoid patterns:**");
      expect(context).not.toContain("- **World-class quality bar:**");
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

    it("emits canonical route paths section so the LLM uses exact href targets", async () => {
      const routePlan = {
        provenance: { primarySource: "brief" as const, sources: ["brief" as const] },
        siteType: "brochure" as const,
        reason: "Brief-defined Swedish blog routes",
        routes: [
          { path: "/", name: "Hem", intent: "Landningssida", required: true },
          { path: "/blogg", name: "Blogg", intent: "Inlägg", required: true },
        ],
      };

      const { context } = await buildDynamicContext({
        intent: "website",
        generationMode: "init",
        routePlan,
        buildSpec: {
          ...lightFollowUpSpec,
          generationMode: "init",
          contextPolicy: "normal",
          verificationPolicy: "standard",
        },
        scaffoldContext: "Scaffold context",
      });

      expect(context).toContain("### Canonical route paths");
      expect(context).toContain("`/blogg`");
      expect(context).not.toContain("- `/blog`\n");
      expect(context).toContain("Hard rules for navigation expressions:");
      expect(context).toContain("Never invent paths");
      expect(context).toContain("href ↔ route cross-check");
      expect(context).toContain("### Lucide icons commonly needed");
      expect(context).toContain(
        'CRITICAL: Each icon used in JSX MUST be imported from "lucide-react".',
      );
      // Plan-12 fix (#14): sub-route bouncer rule must be present in the
      // canonical-route-paths block so the LLM never emits an auto-redirect
      // from a slug page back to '/'. Bug repro chat 2026-04-24:
      // /afrikanska-bonor rendered then router.push('/') in useEffect.
      expect(context).toContain("Sub-routes");
      expect(context).toContain("router.push('/')");
      expect(context).toContain("redirect('/')");
      expect(context).toContain("window.location.href = '/'");
    });

    it("describes init shell policy when route realization defers extra routes", async () => {
      const routePlan = {
        provenance: { primarySource: "prompt" as const, sources: ["prompt" as const] },
        siteType: "brochure" as const,
        reason: "Multiple pages planned from prompt",
        routes: [
          { path: "/", name: "Home", intent: "Primary landing page", required: true },
          { path: "/about", name: "About", intent: "Company story", required: false },
          { path: "/contact", name: "Contact", intent: "Lead capture", required: false },
        ],
      };

      const { context } = await buildDynamicContext({
        intent: "website",
        generationMode: "init",
        routePlan,
        buildSpec: {
          ...lightFollowUpSpec,
          generationMode: "init",
          changeScope: "page-addition",
          contextPolicy: "normal",
          verificationPolicy: "standard",
          routeRealization: {
            mode: "primary-full-with-shells",
            primaryRoutePath: "/",
            fullRoutePaths: ["/"],
            shellRoutePaths: ["/about", "/contact"],
          },
        },
        scaffoldContext: "Scaffold context",
      });

      expect(context).toContain("**Primary route:** `/`");
      expect(context).toContain("Fully realize only `/` in this generation");
      expect(context).toContain("`/about` — About [shell now]");
      expect(context).toContain("`/contact` — Contact [shell now]");
      expect(context).toContain("clear primary CTA such as 'Skapa sida'");
      expect(context).toContain("deliberate builder-owned placeholder states");
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

    it("surfaces capability hints inside the toolkit block", async () => {
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

      expect(context).toContain("## Your Toolkit");
      expect(context).toContain("- Capability hints:");
      expect(context).toContain("**Carousel/slider requested**: Use shadcn Carousel.");
      expect(context.indexOf("## Scaffold")).toBeLessThan(
        context.indexOf("## Your Toolkit"),
      );
    });

    it("builds the toolkit block from the synced local shadcn registry surface", async () => {
      const { context } = await buildDynamicContext({
        intent: "website",
        generationMode: "followUp",
        buildSpec: {
          ...lightFollowUpSpec,
          contextPolicy: "normal",
          verificationPolicy: "standard",
        },
        scaffoldContext: "Scaffold context",
      });

      expect(context).toContain("## Your Toolkit");
      expect(context).toContain("Import shadcn primitives from `@/components/ui/<subpath>`");
      expect(context).toContain("do not invent a parallel UI kit");
    });

    it("keeps UI Recipes compact instead of injecting full registry source", async () => {
      const longExample = [
        "import Link from \"next/link\";",
        "import { Button } from \"@/components/ui/button\";",
        "",
        "export default function HugeExample() {",
        "  return <section>",
        "    <Button asChild><Link href=\"/\">Start</Link></Button>",
        "  </section>;",
        "}",
        "x".repeat(20_000),
      ].join("\n");

      const { context } = await buildDynamicContext({
        intent: "website",
        generationMode: "init",
        buildSpec: lightFollowUpSpec,
        uiRecipes: [
          {
            name: "@example/huge",
            source: "official",
            itemType: "block",
            files: [{ path: "registry/radix-vega/blocks/huge/page.tsx", content: longExample }],
            reason: "test",
          },
        ],
      });

      expect(context).toContain("## UI Recipes");
      expect(context).toContain("Useful file/API patterns");
      expect(context).toContain("HugeExample");
      expect(context).not.toContain("x".repeat(100));
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

    it("brief-derived content appears only once as Project Context, not also as Custom Instructions", async () => {
      const brief = {
        projectTitle: "Veterinärkliniken Hund & Katt",
        brandName: "Hund & Katt",
        oneSentencePitch: "Professionell djurvård i Malmö.",
        targetAudience: "Djurägare i södra Sverige",
        toneAndVoice: ["varm", "professionell"],
        pages: [
          { name: "Hem", path: "/", purpose: "Landningssida", sections: [{ type: "hero", heading: "Välkommen" }] },
        ],
      };
      const { context } = await buildDynamicContext({
        intent: "website",
        generationMode: "init",
        brief,
        buildSpec: {
          ...lightFollowUpSpec,
          generationMode: "init",
          changeScope: "redesign",
          contextPolicy: "normal",
          verificationPolicy: "standard",
        },
      });

      expect(context).toContain("## Project Context");
      expect(context).toContain("Hund & Katt");
      const projectContextCount = context.split("## Project Context").length - 1;
      expect(projectContextCount).toBe(1);
    });

    it("custom instructions from user appear separately and do not duplicate brief content", async () => {
      const brief = {
        projectTitle: "TestSite",
        brandName: "TestBrand",
      };
      const userInstructions = "Always use Swedish copy. Prefer dark theme.";
      const { context } = await buildDynamicContext({
        intent: "website",
        generationMode: "init",
        brief,
        customInstructions: userInstructions,
        buildSpec: {
          ...lightFollowUpSpec,
          generationMode: "init",
          changeScope: "redesign",
          contextPolicy: "normal",
          verificationPolicy: "standard",
        },
      });

      expect(context).toContain("## Custom Instructions (from the user)");
      expect(context).toContain(userInstructions);
      expect(context).toContain("## Project Context");
      expect(context).toContain("TestBrand");
      const customIdx = context.indexOf("## Custom Instructions (from the user)");
      const projectIdx = context.indexOf("## Project Context");
      expect(customIdx).toBeLessThan(projectIdx);
    });

    it("omits Pages & Sections when brief pages have no section detail (Route Plan covers paths)", async () => {
      const brief = {
        projectTitle: "MyShop",
        pages: [
          { name: "Home", path: "/", purpose: "Landing page" },
          { name: "About", path: "/about", purpose: "Company info" },
        ],
      };
      const { context } = await buildDynamicContext({
        intent: "website",
        generationMode: "init",
        brief,
        buildSpec: {
          ...lightFollowUpSpec,
          generationMode: "init",
          changeScope: "redesign",
          contextPolicy: "normal",
          verificationPolicy: "standard",
        },
      });

      expect(context).toContain("## Project Context");
      expect(context).not.toContain("## Pages & Sections");
    });

    it("includes Pages & Sections only for pages that have section-level detail", async () => {
      const brief = {
        projectTitle: "MyShop",
        pages: [
          { name: "Home", path: "/", purpose: "Landing", sections: [{ type: "hero", heading: "Welcome" }] },
          { name: "About", path: "/about", purpose: "Company info" },
        ],
      };
      const { context } = await buildDynamicContext({
        intent: "website",
        generationMode: "init",
        brief,
        buildSpec: {
          ...lightFollowUpSpec,
          generationMode: "init",
          changeScope: "redesign",
          contextPolicy: "normal",
          verificationPolicy: "standard",
        },
      });

      expect(context).toContain("## Pages & Sections");
      expect(context).toContain("Home");
      expect(context).toContain("hero");
      expect(context).not.toContain("About");
    });

    it("deduplicates imagery styleKeywords that already appear in visualDirection", async () => {
      const brief = {
        projectTitle: "StyleTest",
        visualDirection: {
          styleKeywords: ["minimalist", "bold"],
        },
        imagery: {
          styleKeywords: ["minimalist", "cinematic"],
          suggestedSubjects: ["mountain landscape"],
        },
      };
      const { context } = await buildDynamicContext({
        intent: "website",
        generationMode: "init",
        brief,
        buildSpec: {
          ...lightFollowUpSpec,
          generationMode: "init",
          changeScope: "redesign",
          contextPolicy: "normal",
          verificationPolicy: "standard",
        },
      });

      expect(context).toContain("## Imagery (from brief)");
      expect(context).toContain("cinematic");
      expect(context).toContain("mountain landscape");
      const imagerySection = context.slice(context.indexOf("## Imagery"));
      const minimalistInImagery = (imagerySection.match(/minimalist/g) || []).length;
      expect(minimalistInImagery).toBe(0);
    });
  });

});
