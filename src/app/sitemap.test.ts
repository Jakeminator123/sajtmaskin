import { describe, expect, it } from "vitest";
import { PUBLIC_CANONICAL_ORIGIN, publicCanonicalPath } from "@/lib/public-canonical-url";
import {
  SEO_LANDING_PAGES,
  getIndexableSeoLandingRelPaths,
} from "@/lib/seo-landing-pages/registry";
import sitemap, { SITEMAP_CATEGORY_SLUGS, STATIC_SITEMAP_REL_PATHS } from "./sitemap";

const PRIVATE_SITEMAP_REL_PATHS = [
  "/builder",
  "/projects",
  "/konto",
  "/admin",
  "/audits",
  "/buy-credits",
  "/avatar",
  "/analys",
  "/kostnadsfri",
  "/api",
] as const;

describe("marketing sitemap", () => {
  it("includes core marketing, blog, and legal routes once", () => {
    expect(STATIC_SITEMAP_REL_PATHS).toEqual(
      expect.arrayContaining(["/blogg", "/om", "/faq", "/templates", "/teknik", "/terms", "/privacy"]),
    );
    expect(STATIC_SITEMAP_REL_PATHS[0]).toBe("");
    expect(new Set(STATIC_SITEMAP_REL_PATHS).size).toBe(STATIC_SITEMAP_REL_PATHS.length);
  });

  it("lists only ready SEO landing pages on the canonical origin", () => {
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
      "/lovable-alternativ",
    ]);
    for (const page of SEO_LANDING_PAGES) {
      expect(STATIC_SITEMAP_REL_PATHS).not.toContain(`/${page.slug}`);
    }

    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain(`${PUBLIC_CANONICAL_ORIGIN}/skapa-hemsida`);
    expect(urls).toContain(`${PUBLIC_CANONICAL_ORIGIN}/skapa-hemsida-med-ai`);
    expect(urls).toContain(`${PUBLIC_CANONICAL_ORIGIN}/ai-hemsidebyggare`);
    expect(urls).toContain(`${PUBLIC_CANONICAL_ORIGIN}/hemsida-till-foretag`);
    expect(urls).toContain(`${PUBLIC_CANONICAL_ORIGIN}/hemsideprogram`);
    expect(urls).toContain(`${PUBLIC_CANONICAL_ORIGIN}/hemsida-utan-kod`);
    expect(urls).toContain(`${PUBLIC_CANONICAL_ORIGIN}/vad-kostar-en-hemsida`);
    expect(urls).toContain(`${PUBLIC_CANONICAL_ORIGIN}/wix-alternativ`);
    expect(urls).toContain(`${PUBLIC_CANONICAL_ORIGIN}/wordpress-alternativ`);
    expect(urls).toContain(`${PUBLIC_CANONICAL_ORIGIN}/lovable-alternativ`);
    for (const page of SEO_LANDING_PAGES) {
      if (page.status === "ready") continue;
      expect(urls).not.toContain(`${PUBLIC_CANONICAL_ORIGIN}/${page.slug}`);
    }
  });

  it("keeps public static and category routes on sajtmaskin.se", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain(PUBLIC_CANONICAL_ORIGIN);
    for (const path of STATIC_SITEMAP_REL_PATHS) {
      expect(urls).toContain(publicCanonicalPath(path));
    }
    for (const slug of SITEMAP_CATEGORY_SLUGS) {
      expect(urls).toContain(`${PUBLIC_CANONICAL_ORIGIN}/category/${slug}`);
    }
    expect(urls.every((url) => url.startsWith(`${PUBLIC_CANONICAL_ORIGIN}`))).toBe(true);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("does not invent lastModified or list private/app routes", () => {
    const entries = sitemap();
    for (const entry of entries) {
      expect(entry.lastModified).toBeUndefined();
      expect(entry.changeFrequency).toBeUndefined();
      expect(entry.priority).toBeUndefined();
    }

    const urls = entries.map((entry) => entry.url);
    for (const path of PRIVATE_SITEMAP_REL_PATHS) {
      const canonical = publicCanonicalPath(path);
      expect(urls.some((url) => url === canonical || url.startsWith(`${canonical}/`))).toBe(
        false,
      );
    }
  });
});
