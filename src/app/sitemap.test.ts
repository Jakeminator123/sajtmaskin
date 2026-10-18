import { describe, expect, it } from "vitest";
import { PUBLIC_CANONICAL_ORIGIN, publicCanonicalPath } from "@/lib/public-canonical-url";
import { getIndexableBlogRelPaths } from "@/lib/blog/posts";
import {
  SEO_LANDING_PAGES,
  SEO_LANDING_SLUGS,
  getIndexableSeoLandingRelPaths,
} from "@/lib/seo-landing-pages/registry";
import sitemap, { NOINDEX_CATEGORY_SLUGS, STATIC_SITEMAP_REL_PATHS } from "./sitemap";

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
  it("includes core marketing and legal routes once", () => {
    expect(STATIC_SITEMAP_REL_PATHS).toEqual(
      expect.arrayContaining([
        "/om",
        "/exempel",
        "/faq",
        "/templates",
        "/teknik",
        "/priser",
        "/terms",
        "/privacy",
      ]),
    );
    expect(STATIC_SITEMAP_REL_PATHS[0]).toBe("");
    expect(new Set(STATIC_SITEMAP_REL_PATHS).size).toBe(STATIC_SITEMAP_REL_PATHS.length);
  });

  it("includes the blog index and published posts once editorial posts exist", () => {
    expect(STATIC_SITEMAP_REL_PATHS).not.toContain("/blogg");
    const urls = sitemap().map((entry) => entry.url);
    for (const path of getIndexableBlogRelPaths()) {
      expect(urls).toContain(publicCanonicalPath(path));
    }
    expect(urls).toContain(publicCanonicalPath("/blogg"));
    expect(urls).toContain(publicCanonicalPath("/blogg/vad-kostar-en-hemsida-2026"));
  });

  it("lists only ready SEO landing pages on the canonical origin", () => {
    expect(getIndexableSeoLandingRelPaths()).toEqual(SEO_LANDING_SLUGS.map((slug) => `/${slug}`));
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
    expect(urls).toContain(`${PUBLIC_CANONICAL_ORIGIN}/exempel`);
    expect(urls).toContain(`${PUBLIC_CANONICAL_ORIGIN}/lovable-alternativ`);
    expect(urls).toContain(`${PUBLIC_CANONICAL_ORIGIN}/squarespace-alternativ`);
    expect(urls).toContain(`${PUBLIC_CANONICAL_ORIGIN}/one-com-alternativ`);
    expect(urls).toContain(`${PUBLIC_CANONICAL_ORIGIN}/hemsida-frisor`);
    for (const page of SEO_LANDING_PAGES) {
      if (page.status === "ready") continue;
      expect(urls).not.toContain(`${PUBLIC_CANONICAL_ORIGIN}/${page.slug}`);
    }
  });

  it("keeps public static routes on sajtmaskin.se and omits thin category indexes", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain(PUBLIC_CANONICAL_ORIGIN);
    expect(urls).toContain(publicCanonicalPath("/priser"));
    for (const path of STATIC_SITEMAP_REL_PATHS) {
      expect(urls).toContain(publicCanonicalPath(path));
    }
    expect(NOINDEX_CATEGORY_SLUGS).toHaveLength(9);
    for (const slug of NOINDEX_CATEGORY_SLUGS) {
      expect(urls).not.toContain(`${PUBLIC_CANONICAL_ORIGIN}/category/${slug}`);
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

  it("omits lastModified when no owned modification date exists", () => {
    for (const entry of sitemap()) {
      expect(entry.lastModified).toBeUndefined();
    }
  });
});
