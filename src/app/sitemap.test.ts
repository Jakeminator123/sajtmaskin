import { describe, expect, it } from "vitest";
import { URLS } from "@/lib/config";
import {
  SEO_LANDING_PAGES,
  getIndexableSeoLandingRelPaths,
} from "@/lib/seo-landing-pages/registry";
import sitemap, { STATIC_SITEMAP_REL_PATHS } from "./sitemap";

describe("marketing sitemap static paths", () => {
  it("includes core marketing, blog, and legal routes", () => {
    expect(STATIC_SITEMAP_REL_PATHS).toEqual(
      expect.arrayContaining(["/blogg", "/om", "/faq", "/templates", "/teknik", "/terms", "/privacy"]),
    );
    expect(STATIC_SITEMAP_REL_PATHS[0]).toBe("");
  });

  it("lists each static path once", () => {
    const set = new Set(STATIC_SITEMAP_REL_PATHS);
    expect(set.size).toBe(STATIC_SITEMAP_REL_PATHS.length);
  });

  it("omits unfinished SEO landing placeholders", () => {
    expect(getIndexableSeoLandingRelPaths()).toEqual([]);
    for (const page of SEO_LANDING_PAGES) {
      expect(STATIC_SITEMAP_REL_PATHS).not.toContain(`/${page.slug}`);
    }

    const urls = sitemap().map((entry) => entry.url);
    for (const page of SEO_LANDING_PAGES) {
      expect(urls).not.toContain(`${URLS.baseUrl}/${page.slug}`);
    }
  });
});

