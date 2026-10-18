import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SEO_LANDING_CTA_HREF,
  SEO_LANDING_PAGES,
  SEO_LANDING_STALE_COPY_PATTERNS,
  getReadyRelatedSeoLandingSlugs,
} from "./registry";

const APP_DIR = join(process.cwd(), "src/app");

const VOLATILE_PRICE_PATTERNS = [/\d+\s*kr\b/i, /\b(?:49|99|179)\b/];

const CROWNING_PATTERNS = [
  /Sajtmaskin är bäst/i,
  /bästa (?:AI-)?hemsidebyggaren/i,
];

const LIB_DIR = join(process.cwd(), "src/lib/seo-landing-pages");

function pageSource(slug: string, file: `${string}.tsx`) {
  return readFileSync(join(APP_DIR, slug, file), "utf8");
}

function resolvedContent(slug: string) {
  const content = pageSource(slug, `${slug}-content.tsx`);
  if (content.includes("IndustryLandingContent")) {
    return `${content}\n${readFileSync(join(LIB_DIR, "industry-landing.tsx"), "utf8")}`;
  }
  if (content.includes("ComparisonLandingContent")) {
    return `${content}\n${readFileSync(join(LIB_DIR, "comparison-landing.tsx"), "utf8")}`;
  }
  return content;
}

describe("SEO landing content invariants", () => {
  it("keeps one primary H1, product CTA and ready related hrefs in every ready page", () => {
    for (const page of SEO_LANDING_PAGES) {
      if (page.status !== "ready") continue;

      const pageTsx = pageSource(page.slug, "page.tsx");
      const content = resolvedContent(page.slug);

      expect(pageTsx).toContain(`createSeoLandingMetadata("${page.slug}")`);
      expect(content.match(/<h1\b/g) ?? []).toHaveLength(1);
      expect(content).toContain("{entry.plannedH1}");
      expect(content).toContain("SEO_LANDING_CTA_HREF");
      expect(page.ctaHref).toBe(SEO_LANDING_CTA_HREF);

      const readyRelated = getReadyRelatedSeoLandingSlugs(page.relatedSlugs);
      expect(readyRelated.length).toBeGreaterThan(0);
      for (const related of readyRelated) {
        expect(content).toContain(`href={\`/\${slug}\`}`);
        expect(page.relatedSlugs).toContain(related);
      }
    }
  });

  it("keeps ready copy free of stale placeholders, volatile prices and crowning claims", () => {
    for (const page of SEO_LANDING_PAGES) {
      if (page.status !== "ready") continue;
      const content = resolvedContent(page.slug);

      for (const pattern of SEO_LANDING_STALE_COPY_PATTERNS) {
        expect(content, `${page.slug} stale copy ${pattern}`).not.toMatch(pattern);
      }
      for (const pattern of VOLATILE_PRICE_PATTERNS) {
        expect(content, `${page.slug} volatile price ${pattern}`).not.toMatch(pattern);
      }
      for (const pattern of CROWNING_PATTERNS) {
        expect(content, `${page.slug} crowning claim ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
