import { describe, expect, it } from "vitest";
import {
  deriveTemplateRuntimeGuidance,
  isStarterOrBoilerplateReference,
} from "./runtime-guidance";
import type { TemplateLibraryEntry } from "./types";

function makeEntry(
  partial: Partial<TemplateLibraryEntry> = {},
): TemplateLibraryEntry {
  return {
    id: "entry-1",
    slug: "entry-1",
    title: "Reference Entry",
    categorySlug: "saas",
    categoryName: "SaaS",
    templateUrl: "https://example.com",
    demoUrl: null,
    description: "desc",
    frameworkReason: "reason",
    frameworkMatch: true,
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
    strengths: ["verified Next.js codebase"],
    weaknesses: [],
    recommendedScaffoldIds: ["saas-landing"],
    signals: {
      auth: false,
      dashboard: false,
      pricing: true,
      blog: false,
      portfolio: false,
      ecommerce: false,
      docs: false,
      ai: false,
      multiTenant: true,
      cms: false,
    },
    classification: {
      useCaseTags: ["saas", "multi-tenant"],
      siteFormTags: ["app-shell", "landing-page"],
      technicalPatternTags: ["app-router", "billing", "multi-tenant"],
    },
    summary: "summary",
    selectedFiles: [{ path: "app/pricing/page.tsx", reason: "pricing", excerpt: "..." }],
    ...partial,
  };
}

describe("deriveTemplateRuntimeGuidance", () => {
  it("derives structured guidance from template metadata", () => {
    const guidance = deriveTemplateRuntimeGuidance(makeEntry());

    expect(guidance.styleRules.length).toBeGreaterThan(0);
    expect(guidance.sectionInventory).toContain("pricing");
    expect(guidance.avoidPatterns.length).toBeGreaterThan(0);
    expect(guidance.worldClassRubric.length).toBeGreaterThan(0);
  });

  it("respects committed runtimeGuidance when present", () => {
    const guidance = deriveTemplateRuntimeGuidance(
      makeEntry({
        runtimeGuidance: {
          styleRules: ["Custom style"],
          sectionInventory: ["Custom section"],
          avoidPatterns: ["Custom avoid"],
          worldClassRubric: ["Custom rubric"],
        },
      }),
    );

    expect(guidance).toEqual({
      styleRules: ["Custom style"],
      sectionInventory: ["Custom section"],
      avoidPatterns: ["Custom avoid"],
      worldClassRubric: ["Custom rubric"],
    });
  });

  it("treats starter/boilerplate references as structure-first", () => {
    const entry = makeEntry({
      categorySlug: "starter",
      title: "Next.js Boilerplate Starter",
      description: "A starter repo for quick setup.",
    });

    expect(isStarterOrBoilerplateReference(entry)).toBe(true);
    const guidance = deriveTemplateRuntimeGuidance(entry);
    expect(guidance.styleRules.join(" ")).toContain("starter/boilerplate");
    expect(guidance.avoidPatterns.join(" ")).toContain("starter-like");
  });
});
