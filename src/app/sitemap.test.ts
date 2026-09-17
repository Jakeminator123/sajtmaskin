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

  it("includes only ready SEO landing pages, never unfinished placeholders", () => {
    expect(getIndexableSeoLandingRelPaths()).toEqual([
      "/skapa-hemsida",
      "/skapa-hemsida-med-ai",
      "/ai-hemsidebyggare",
      "/hemsida-till-foretag",
      "/hemsideprogram",
      "/hemsida-utan-kod",
      "/vad-kostar-en-hemsida",
      "/wix-alternativ",
      "/wordpress-alternativ",
    ]);
    for (const page of SEO_LANDING_PAGES) {
      expect(STATIC_SITEMAP_REL_PATHS).not.toContain(`/${page.slug}`);
    }

    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain(`${URLS.baseUrl}/skapa-hemsida`);
    expect(urls).toContain(`${URLS.baseUrl}/skapa-hemsida-med-ai`);
    expect(urls).toContain(`${URLS.baseUrl}/ai-hemsidebyggare`);
    expect(urls).toContain(`${URLS.baseUrl}/hemsida-till-foretag`);
    expect(urls).toContain(`${URLS.baseUrl}/hemsideprogram`);
    expect(urls).toContain(`${URLS.baseUrl}/hemsida-utan-kod`);
    expect(urls).toContain(`${URLS.baseUrl}/vad-kostar-en-hemsida`);
    expect(urls).toContain(`${URLS.baseUrl}/wix-alternativ`);
    expect(urls).toContain(`${URLS.baseUrl}/wordpress-alternativ`);
    for (const page of SEO_LANDING_PAGES) {
      if (page.status === "ready") continue;
      expect(urls).not.toContain(`${URLS.baseUrl}/${page.slug}`);
    }
  });
});

