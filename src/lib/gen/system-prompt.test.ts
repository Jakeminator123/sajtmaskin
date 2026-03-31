import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BuildSpec } from "./build-spec";

const searchKnowledgeBaseAsync = vi.hoisted(() => vi.fn());
const enrichWithRegistry = vi.hoisted(() => vi.fn());
const searchTemplateLibrary = vi.hoisted(() => vi.fn());
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
  searchTemplateLibrary,
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
    searchTemplateLibrary.mockReset();
    searchTemplateLibraryKeywordsOnly.mockReset();
    selectTemplateReferenceFiles.mockReset();
    getTemplateLibraryEntryById.mockReset();

    searchKnowledgeBaseAsync.mockResolvedValue([
      { title: "KB", content: "Knowledge base match" },
    ]);
    enrichWithRegistry.mockResolvedValue("Registry enrichment");
    searchTemplateLibrary.mockResolvedValue([
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
    ]);
    searchTemplateLibraryKeywordsOnly.mockReturnValue([]);
    selectTemplateReferenceFiles.mockReturnValue([
      { path: "app/page.tsx", reason: "reference", excerpt: "REFERENCE_SNIPPET" },
    ]);
    getTemplateLibraryEntryById.mockReturnValue(null);
  });

  it("skips KB and template references for narrow follow-up context", async () => {
    const context = await buildDynamicContext({
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
    expect(searchTemplateLibrary).not.toHaveBeenCalled();
  });

  it("keeps richer reference retrieval outside light follow-up mode", async () => {
    const context = await buildDynamicContext({
      intent: "website",
      originalPrompt: "Build a SaaS website with product storytelling.",
      generationMode: "init",
      buildSpec: { ...lightFollowUpSpec, generationMode: "init", changeScope: "redesign", contextPolicy: "normal", verificationPolicy: "standard" },
      scaffoldContext: "Scaffold context",
    });

    expect(context).toContain("## Relevant Documentation");
    expect(context).toContain("## Relevant Template References");
    expect(context).toContain("## Reference Code Snippets");
    expect(searchKnowledgeBaseAsync).toHaveBeenCalled();
    expect(searchTemplateLibrary).toHaveBeenCalled();
  });

  it("treats starter references as structure-only and skips snippet injection", async () => {
    searchTemplateLibrary.mockResolvedValueOnce([
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
    ]);

    const context = await buildDynamicContext({
      intent: "website",
      originalPrompt: "Build a polished agency website.",
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

    expect(context).toContain("## Relevant Template References");
    expect(context).toContain("Reference mode: structure-only (starter/boilerplate).");
    expect(context).not.toContain("## Reference Code Snippets");
  });
});
