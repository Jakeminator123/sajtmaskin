import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SEO_LANDING_CTA_HREF,
  SEO_LANDING_FOOTER_GUIDE_LINKS,
  SEO_LANDING_HUB_SLUGS,
  SEO_LANDING_PAGES,
  SEO_LANDING_PLACEHOLDER_READY_MESSAGE,
  SEO_LANDING_SLUGS,
  SEO_LANDING_STALE_COPY_PATTERNS,
  assertSeoLandingPlaceholderAllowed,
  getIndexableSeoLandingRelPaths,
  getPlaceholderSeoLandingRelPaths,
  getReadyRelatedSeoLandingSlugs,
  getSeoLandingEntry,
  getSeoLandingHubLinks,
  indexableSeoLandingRelPathsFrom,
  isSeoLandingSlug,
  readyRelatedSeoLandingSlugs,
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
          plannedH1: "Skapa hemsida med AI – från beskrivning till första version",
          intent: "Hur man skapar en hemsida med AI",
          relatedSlugs: ["skapa-hemsida"],
          status: "ready",
          ctaHref: SEO_LANDING_CTA_HREF,
        },
        {
          slug: "wix-alternativ",
          title: "Wix-alternativ",
          description: "Placeholder.",
          plannedH1: "Wix-alternativ – jämför arbetssätt innan du byter",
          intent: "Saklig Wix-jämförelse",
          relatedSlugs: ["hemsideprogram"],
          status: "placeholder",
          ctaHref: SEO_LANDING_CTA_HREF,
        },
      ]),
    ).toEqual(["/skapa-hemsida-med-ai"]);
  });

  it("keeps unfinished pages out of the indexable sitemap set", () => {
    const readySlugs = new Set(
      SEO_LANDING_PAGES.filter((page) => page.status === "ready").map((page) => page.slug),
    );
    expect(readySlugs).toEqual(
      new Set([
        "skapa-hemsida",
        "skapa-hemsida-med-ai",
        "ai-hemsidebyggare",
        "hemsida-till-foretag",
        "hemsideprogram",
        "hemsida-utan-kod",
        "vad-kostar-en-hemsida",
        "wix-alternativ",
        "wordpress-alternativ",
        "lovable-alternativ",
      ]),
    );
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
    expect(getPlaceholderSeoLandingRelPaths()).toEqual(
      SEO_LANDING_PAGES.filter((page) => !readySlugs.has(page.slug)).map((page) => `/${page.slug}`),
    );
    expect(
      SEO_LANDING_PAGES.filter((page) => !readySlugs.has(page.slug)).every(
        (page) => page.status === "placeholder",
      ),
    ).toBe(true);
  });

  it("sends every landing CTA into the existing builder flow", () => {
    for (const page of SEO_LANDING_PAGES) {
      expect(page.ctaHref).toBe(SEO_LANDING_CTA_HREF);
      expect(getSeoLandingEntry(page.slug).ctaHref).toBe("/builder?new=1");
    }
  });

  it("narrows known slugs", () => {
    expect(isSeoLandingSlug("skapa-hemsida-med-ai")).toBe(true);
    expect(isSeoLandingSlug("hemsida-utan-kod")).toBe(true);
    expect(isSeoLandingSlug("vad-kostar-en-hemsida")).toBe(true);
    expect(isSeoLandingSlug("teknik")).toBe(false);
  });

  it("keeps related slugs inside the register and off the same page", () => {
    for (const page of SEO_LANDING_PAGES) {
      expect(page.relatedSlugs.length).toBeGreaterThan(0);
      for (const related of page.relatedSlugs) {
        expect(isSeoLandingSlug(related)).toBe(true);
        expect(related).not.toBe(page.slug);
      }
    }
  });

  it("keeps every registered page ready with unique title, description and H1", () => {
    expect(SEO_LANDING_PAGES).toHaveLength(SEO_LANDING_SLUGS.length);
    expect(SEO_LANDING_PAGES.every((page) => page.status === "ready")).toBe(true);

    const titles = SEO_LANDING_PAGES.map((page) => page.title);
    const descriptions = SEO_LANDING_PAGES.map((page) => page.description);
    const headings = SEO_LANDING_PAGES.map((page) => page.plannedH1);
    const intents = SEO_LANDING_PAGES.map((page) => page.intent);

    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    expect(new Set(headings).size).toBe(headings.length);
    expect(new Set(intents).size).toBe(intents.length);

    for (const page of SEO_LANDING_PAGES) {
      expect(page.title.trim().length).toBeGreaterThan(20);
      expect(page.description.trim().length).toBeGreaterThan(80);
      expect(page.plannedH1.trim().length).toBeGreaterThan(20);
      expect(page.ctaHref).toBe(SEO_LANDING_CTA_HREF);
    }
  });

  it("keeps the related graph connected without placeholder or orphan ready pages", () => {
    const inbound = new Map<string, Set<string>>();
    for (const page of SEO_LANDING_PAGES) {
      inbound.set(page.slug, new Set());
    }
    for (const page of SEO_LANDING_PAGES) {
      const readyRelated = readyRelatedSeoLandingSlugs(page.relatedSlugs);
      expect(readyRelated).toEqual([...page.relatedSlugs]);
      for (const related of readyRelated) {
        inbound.get(related)?.add(page.slug);
      }
    }
    for (const page of SEO_LANDING_PAGES) {
      if (page.status !== "ready") continue;
      expect(inbound.get(page.slug)?.size, `${page.slug} has no inbound related link`).toBeGreaterThan(
        0,
      );
    }
  });

  it("lets broad hubs reach narrower intents and competitor pages", () => {
    expect(getSeoLandingEntry("skapa-hemsida").relatedSlugs).toEqual(
      expect.arrayContaining([
        "skapa-hemsida-med-ai",
        "hemsida-till-foretag",
        "hemsideprogram",
        "vad-kostar-en-hemsida",
      ]),
    );
    expect(getSeoLandingEntry("hemsideprogram").relatedSlugs).toEqual(
      expect.arrayContaining(["wix-alternativ", "wordpress-alternativ"]),
    );
    expect(getSeoLandingEntry("ai-hemsidebyggare").relatedSlugs).toEqual(
      expect.arrayContaining(["lovable-alternativ"]),
    );
  });

  it("exposes four footer hubs instead of the full cluster", () => {
    expect(SEO_LANDING_FOOTER_GUIDE_LINKS.map((link) => link.slug)).toEqual([
      "skapa-hemsida",
      "skapa-hemsida-med-ai",
      "vad-kostar-en-hemsida",
      "hemsideprogram",
    ]);
    expect(SEO_LANDING_FOOTER_GUIDE_LINKS).toHaveLength(4);
    for (const link of SEO_LANDING_FOOTER_GUIDE_LINKS) {
      expect(getSeoLandingEntry(link.slug).status).toBe("ready");
    }
  });

  it("exposes a ready-only hub for public chrome without dumping all ten slugs", () => {
    expect(SEO_LANDING_HUB_SLUGS.length).toBeGreaterThanOrEqual(5);
    expect(SEO_LANDING_HUB_SLUGS.length).toBeLessThan(SEO_LANDING_SLUGS.length);
    expect(SEO_LANDING_HUB_SLUGS).toContain("skapa-hemsida");
    expect(SEO_LANDING_HUB_SLUGS).toContain("hemsideprogram");
    expect(SEO_LANDING_HUB_SLUGS).not.toContain("wix-alternativ");

    const links = getSeoLandingHubLinks();
    expect(links.map((link) => link.slug)).toEqual([...SEO_LANDING_HUB_SLUGS]);
    for (const link of links) {
      expect(getSeoLandingEntry(link.slug).status).toBe("ready");
      expect(link.href).toBe(`/${link.slug}`);
      expect(link.label.length).toBeGreaterThan(0);
    }
  });

  it("filters related slugs to ready registry entries", () => {
    expect(getReadyRelatedSeoLandingSlugs(["skapa-hemsida", "hemsideprogram"])).toEqual([
      "skapa-hemsida",
      "hemsideprogram",
    ]);
  });

  it("does not describe ready sibling pages as unfinished placeholders", () => {
    for (const page of SEO_LANDING_PAGES) {
      if (page.status !== "ready") continue;
      const source = readFileSync(join(APP_DIR, page.slug, `${page.slug}-content.tsx`), "utf8");
      for (const pattern of SEO_LANDING_STALE_COPY_PATTERNS) {
        expect(source, `${page.slug} still has stale sibling copy ${pattern}`).not.toMatch(
          pattern,
        );
      }
      for (const related of page.relatedSlugs) {
        expect(getSeoLandingEntry(related).status).toBe("ready");
      }
    }
  });

  it("allows the shared placeholder only for placeholder entries", () => {
    expect(() =>
      assertSeoLandingPlaceholderAllowed({
        ...getSeoLandingEntry("lovable-alternativ"),
        status: "placeholder",
      }),
    ).not.toThrow();
    expect(() =>
      assertSeoLandingPlaceholderAllowed(getSeoLandingEntry("lovable-alternativ")),
    ).toThrow(SEO_LANDING_PLACEHOLDER_READY_MESSAGE);
  });

  it("fails closed when a ready route still mounts SeoLandingPlaceholder", () => {
    for (const page of SEO_LANDING_PAGES) {
      const source = readFileSync(join(APP_DIR, page.slug, "page.tsx"), "utf8");
      const usesPlaceholder =
        /<SeoLandingPlaceholder\b/.test(source) ||
        /^\s*import[\s\S]*\bSeoLandingPlaceholder\b/m.test(source);
      if (usesPlaceholder) {
        expect(page.status).toBe("placeholder");
      }
      if (page.status === "ready") {
        expect(usesPlaceholder).toBe(false);
      }
    }
  });
});
