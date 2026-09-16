import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SEO_LANDING_CTA_HREF,
  SEO_LANDING_PAGES,
  SEO_LANDING_SLUGS,
  getIndexableSeoLandingRelPaths,
  getPlaceholderSeoLandingRelPaths,
  getSeoLandingEntry,
  indexableSeoLandingRelPathsFrom,
  isSeoLandingSlug,
} from "./registry";

const APP_DIR = join(process.cwd(), "src/app");

/** Existing product first segments that landing slugs must never reuse. */
const RESERVED_PRODUCT_FIRST_SEGMENTS = [
  "admin",
  "api",
  "audits",
  "avatar",
  "blogg",
  "builder",
  "buy-credits",
  "category",
  "faq",
  "konto",
  "kostnadsfri",
  "kostnadsfri-information",
  "log",
  "logg",
  "new",
  "om",
  "privacy",
  "projects",
  "r",
  "teknik",
  "templates",
  "terms",
] as const;

function existingAppFirstSegments(): string[] {
  return readdirSync(APP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("(") && !name.startsWith("_") && !name.startsWith("["));
}

describe("SEO landing registry", () => {
  it("lists unique ASCII slugs once", () => {
    const slugs = SEO_LANDING_PAGES.map((page) => page.slug);
    expect(slugs).toEqual([...SEO_LANDING_SLUGS]);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it("keeps every registered page as a real App Router route", () => {
    for (const page of SEO_LANDING_PAGES) {
      expect(existsSync(join(APP_DIR, page.slug, "page.tsx"))).toBe(true);
    }
  });

  it("does not collide with reserved product first segments", () => {
    const existing = existingAppFirstSegments();
    for (const reserved of RESERVED_PRODUCT_FIRST_SEGMENTS) {
      expect(existing).toContain(reserved);
      expect(SEO_LANDING_SLUGS).not.toContain(reserved);
    }
  });

  it("includes only ready entries in the sitemap path helper", () => {
    expect(
      indexableSeoLandingRelPathsFrom([
        {
          slug: "skapa-hemsida-med-ai",
          title: "Skapa hemsida med AI",
          description: "Riktig landningssida.",
          status: "ready",
          ctaHref: SEO_LANDING_CTA_HREF,
        },
        {
          slug: "wix-alternativ",
          title: "Wix-alternativ",
          description: "Placeholder.",
          status: "placeholder",
          ctaHref: SEO_LANDING_CTA_HREF,
        },
      ]),
    ).toEqual(["/skapa-hemsida-med-ai"]);
  });

  it("keeps placeholders out of the indexable sitemap set", () => {
    expect(SEO_LANDING_PAGES.every((page) => page.status === "placeholder")).toBe(true);
    expect(getIndexableSeoLandingRelPaths()).toEqual([]);
    expect(getPlaceholderSeoLandingRelPaths()).toEqual(
      SEO_LANDING_PAGES.map((page) => `/${page.slug}`),
    );
  });

  it("sends every landing CTA into the existing builder flow", () => {
    for (const page of SEO_LANDING_PAGES) {
      expect(page.ctaHref).toBe(SEO_LANDING_CTA_HREF);
      expect(getSeoLandingEntry(page.slug).ctaHref).toBe("/builder?new=1");
    }
  });

  it("narrows known slugs", () => {
    expect(isSeoLandingSlug("skapa-hemsida-med-ai")).toBe(true);
    expect(isSeoLandingSlug("teknik")).toBe(false);
  });
});
