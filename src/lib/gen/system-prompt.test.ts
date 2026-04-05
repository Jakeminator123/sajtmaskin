import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BuildSpec } from "./build-spec";

const searchKnowledgeBaseAsync = vi.hoisted(() => vi.fn());
const enrichWithRegistry = vi.hoisted(() => vi.fn());
const searchTemplateLibraryWithDiagnostics = vi.hoisted(() => vi.fn());
const searchTemplateLibraryKeywordsOnly = vi.hoisted(() => vi.fn());
const selectTemplateReferenceFiles = vi.hoisted(() => vi.fn());
const getTemplateLibraryEntryById = vi.hoisted(() => vi.fn());
const getStaticCoreFromWorkspace = vi.hoisted(() => vi.fn(() => "STATIC_CORE"));

vi.mock("./context/knowledge-base", () => ({
  searchKnowledgeBaseAsync,
}));

vi.mock("./context/registry-enricher", () => ({
  enrichWithRegistry,
}));

vi.mock("./template-library/search", () => ({
  searchTemplateLibraryWithDiagnostics,
  searchTemplateLibraryKeywordsOnly,
  selectTemplateReferenceFiles,
}));

vi.mock("./template-library/catalog", () => ({
  getTemplateLibraryEntryById,
}));

vi.mock("./static-core-loader", () => ({
  getStaticCoreFromWorkspace,
}));

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
  beforeEach(() => {
    searchKnowledgeBaseAsync.mockReset();
    enrichWithRegistry.mockReset();
    searchTemplateLibraryWithDiagnostics.mockReset();
    searchTemplateLibraryKeywordsOnly.mockReset();
    selectTemplateReferenceFiles.mockReset();
    getTemplateLibraryEntryById.mockReset();

    searchKnowledgeBaseAsync.mockResolvedValue({
      matches: [{ title: "KB", content: "Knowledge base match" }],
      mode: "keyword",
    });
    enrichWithRegistry.mockResolvedValue("Registry enrichment");
    searchTemplateLibraryWithDiagnostics.mockResolvedValue({
      results: [
        {
          entry: {
            id: "ref-1",
            slug: "ref-1",
            title: "Reference One",
            categorySlug: "saas",
            categoryName: "SaaS",
            templateUrl: "https://example.com/template",
            demoUrl: null,
            description: "desc",
            frameworkReason: "reason",
            frameworkMatch: 1,
            verdict: "valid",
            qualityScore: 88,
            repo: {
              url: null,
              normalizedUrl: null,
              subpath: null,
              clonePath: null,
              packageManager: "unknown",
              hasNext: true,
              hasReact: true,
              isMonorepo: false,
              hasAppDir: true,
              hasSrcAppDir: false,
            },
            stackTags: [],
            usefulLines: [],
            noiseLines: [],
            strengths: ["layout"],
            weaknesses: [],
            recommendedScaffoldFamilies: ["landing-page"],
            signals: {
              auth: false,
              dashboard: false,
              pricing: false,
              blog: false,
              portfolio: false,
              ecommerce: false,
              docs: false,
              ai: false,
              multiTenant: false,
              cms: false,
            },
            summary: "summary",
            selectedFiles: [
              { path: "app/page.tsx", reason: "reference", excerpt: "REFERENCE_SNIPPET" },
            ],
          },
          score: 0.91,
        },
      ],
      diagnostics: {
        mode: "embedding",
        catalogSize: 12,
        usedEmbeddings: true,
        topScore: 0.91,
      },
    });
    searchTemplateLibraryKeywordsOnly.mockReturnValue([]);
    selectTemplateReferenceFiles.mockReturnValue([
      { path: "app/page.tsx", reason: "reference", excerpt: "REFERENCE_SNIPPET" },
    ]);
    getTemplateLibraryEntryById.mockReturnValue(null);
  });

  it("skips KB and template references for narrow follow-up context", async () => {
    const { context } = await buildDynamicContext({
      intent: "website",
      originalPrompt: "Förbättra copy och SEO i hero-sektionen men behåll designen.",
      generationMode: "followUp",
      buildSpec: lightFollowUpSpec,
      scaffoldContext: "Scaffold context",
    });

    expect(context).not.toContain("## Relevant Documentation");
    expect(context).not.toContain("## Relevant Template References");
    expect(context).not.toContain("## Reference Code Snippets");
    expect(searchKnowledgeBaseAsync).not.toHaveBeenCalled();
    expect(searchTemplateLibraryWithDiagnostics).not.toHaveBeenCalled();
  });

  it("keeps richer reference retrieval outside light follow-up mode", async () => {
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

    expect(context).toContain("## Relevant Documentation");
    expect(context).toContain("## Relevant Template References");
    expect(context).toContain("## Reference Code Snippets");
    expect(context).toContain("## Generation Profile");
    expect(context).toContain("Style direction:");
    expect(searchKnowledgeBaseAsync).toHaveBeenCalled();
    expect(searchTemplateLibraryWithDiagnostics).toHaveBeenCalled();
  });

  it("treats starter references as structure-only and skips snippet injection", async () => {
    searchTemplateLibraryWithDiagnostics.mockResolvedValueOnce({
      results: [
        {
          entry: {
            id: "starter-ref",
            slug: "starter-ref",
            title: "Next.js Boilerplate Starter",
            categorySlug: "starter",
            categoryName: "Starter",
            templateUrl: "https://example.com/starter",
            demoUrl: null,
            description: "Starter baseline",
            frameworkReason: "reason",
            frameworkMatch: 1,
            verdict: "valid",
            qualityScore: 86,
            repo: {
              url: null,
              normalizedUrl: null,
              subpath: null,
              clonePath: null,
              packageManager: "unknown",
              hasNext: true,
              hasReact: true,
              isMonorepo: false,
              hasAppDir: true,
              hasSrcAppDir: false,
            },
            stackTags: [],
            usefulLines: [],
            noiseLines: [],
            strengths: ["starter shell"],
            weaknesses: [],
            recommendedScaffoldFamilies: ["base-nextjs"],
            signals: {
              auth: false,
              dashboard: false,
              pricing: false,
              blog: false,
              portfolio: false,
              ecommerce: false,
              docs: false,
              ai: false,
              multiTenant: false,
              cms: false,
            },
            summary: "starter summary",
            selectedFiles: [
              { path: "app/page.tsx", reason: "reference", excerpt: "STARTER_SNIPPET" },
            ],
          },
          score: 0.95,
        },
      ],
      diagnostics: {
        mode: "embedding",
        catalogSize: 12,
        usedEmbeddings: true,
        topScore: 0.95,
      },
    });

    const { context } = await buildDynamicContext({
      intent: "website",
      originalPrompt: "Build a polished agency website.",
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

    expect(context).toContain("## Relevant Template References");
    expect(context).toContain("Reference mode: structure-only (starter/boilerplate).");
    expect(context).not.toContain("## Reference Code Snippets");
  });

  it("keeps structured reference guidance but skips snippets for scoped follow-up edits", async () => {
    const { context } = await buildDynamicContext({
      intent: "website",
      originalPrompt: "Tighten spacing and make the hero calmer without changing the site structure.",
      generationMode: "followUp",
      buildSpec: {
        ...lightFollowUpSpec,
        generationMode: "followUp",
        changeScope: "local-layout",
        contextPolicy: "normal",
        verificationPolicy: "standard",
      },
      scaffoldContext: "Scaffold context",
    });

    expect(context).toContain("## Relevant Template References");
    expect(context).not.toContain("## Reference Code Snippets");
  });

  it("surfaces template retrieval fallback status when semantic search falls back", async () => {
    searchTemplateLibraryWithDiagnostics.mockResolvedValueOnce({
      results: [
        {
          entry: {
            id: "ref-1",
            slug: "ref-1",
            title: "Reference One",
            categorySlug: "saas",
            categoryName: "SaaS",
            templateUrl: "https://example.com/template",
            demoUrl: null,
            description: "desc",
            frameworkReason: "reason",
            frameworkMatch: 1,
            verdict: "valid",
            qualityScore: 88,
            repo: {
              url: null,
              normalizedUrl: null,
              subpath: null,
              clonePath: null,
              packageManager: "unknown",
              hasNext: true,
              hasReact: true,
              isMonorepo: false,
              hasAppDir: true,
              hasSrcAppDir: false,
            },
            stackTags: [],
            usefulLines: [],
            noiseLines: [],
            strengths: ["layout"],
            weaknesses: [],
            recommendedScaffoldFamilies: ["landing-page"],
            signals: {
              auth: false,
              dashboard: false,
              pricing: false,
              blog: false,
              portfolio: false,
              ecommerce: false,
              docs: false,
              ai: false,
              multiTenant: false,
              cms: false,
            },
            summary: "summary",
            selectedFiles: [
              { path: "app/page.tsx", reason: "reference", excerpt: "REFERENCE_SNIPPET" },
            ],
          },
          score: 0.35,
        },
      ],
      diagnostics: {
        mode: "keyword_fallback",
        catalogSize: 12,
        usedEmbeddings: true,
        reason: "no_embedding_hits",
      },
    });

    const { context } = await buildDynamicContext({
      intent: "website",
      originalPrompt: "Build a modern marketing site with strong conversion flow.",
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

    expect(context).toContain(
      "Retrieval status: Semantic template search found no strong hits, so references came from keyword fallback only.",
    );
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
      expect(context).not.toContain("## Relevant Documentation");
      expect(context).not.toContain("## Relevant Template References");
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
        source: "prompt" as const,
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

    it("follow-up light context omits doc and template sections but keeps mode and profile", async () => {
      const { context } = await buildDynamicContext({
        intent: "website",
        originalPrompt: "Tweak hero copy only; keep layout.",
        generationMode: "followUp",
        buildSpec: lightFollowUpSpec,
        scaffoldContext: "Scaffold context",
      });

      expect(context).not.toContain("## Relevant Documentation");
      expect(context).not.toContain("## Relevant Template References");
      expect(context).not.toContain("## Reference Code Snippets");
      expect(context).toContain("## Generation Mode: Follow-Up");
      expect(context).toContain("## Generation Profile");
    });

    it("design-heavy follow-up with light buildSpec still runs KB + template retrieval", async () => {
      const { context, templateLibrarySearchDiagnostics } = await buildDynamicContext({
        intent: "website",
        originalPrompt: "Complete redesign: new hero, animations, and color system for the landing page.",
        generationMode: "followUp",
        buildSpec: lightFollowUpSpec,
      });

      expect(searchKnowledgeBaseAsync).toHaveBeenCalled();
      expect(searchTemplateLibraryWithDiagnostics).toHaveBeenCalled();
      expect(context).toContain("## Relevant Documentation");
      expect(context).toContain("## Relevant Template References");
      expect(templateLibrarySearchDiagnostics?.mode).toBe("embedding");
    });
  });
});
