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
  isSeoLandingSlug,
} from "./registry";

const APP_DIR = join(process.cwd(), "src/app");

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

  it("does not collide with other first-segment product routes", () => {
    const registered = new Set<string>(SEO_LANDING_PAGES.map((page) => page.slug));
    const reserved = existingAppFirstSegments().filter((name) => !registered.has(name));
    for (const page of SEO_LANDING_PAGES) {
      expect(reserved).not.toContain(page.slug);
    }
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
