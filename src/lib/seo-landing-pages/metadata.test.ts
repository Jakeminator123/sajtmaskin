import { afterEach, describe, expect, it, vi } from "vitest";
import { PUBLIC_CANONICAL_ORIGIN } from "@/lib/public-canonical-url";
import { createSeoLandingMetadata, seoLandingMetadataFromEntry } from "./metadata";
import { SEO_LANDING_CTA_HREF, SEO_LANDING_PAGES } from "./registry";

describe("SEO landing metadata", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("marks placeholders as noindex and ready pages as indexable, all with a self canonical", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    for (const page of SEO_LANDING_PAGES) {
      const metadata = createSeoLandingMetadata(page.slug);
      const isReady = page.status === "ready";
      expect(metadata.title).toBe(isReady ? page.title : `Testsida — ${page.title}`);
      expect(metadata.description).toBe(
        isReady
          ? page.description
          : "Intern testsida för Sajtmaskin. Inte avsedd för sökindexering.",
      );
      expect(metadata.robots).toEqual(
        isReady ? { index: true, follow: true } : { index: false, follow: false },
      );
      expect(metadata.alternates).toEqual({
        canonical: `${PUBLIC_CANONICAL_ORIGIN}/${page.slug}`,
      });
    }
  });

  it("indexes a ready entry with its public title and description", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const metadata = seoLandingMetadataFromEntry({
      slug: "skapa-hemsida-med-ai",
      title: "Skapa hemsida med AI",
      description: "Riktig landningssida.",
      plannedH1: "Skapa hemsida med AI – från beskrivning till första version",
      intent: "Hur man skapar en hemsida med AI",
      relatedSlugs: ["skapa-hemsida"],
      status: "ready",
      ctaHref: SEO_LANDING_CTA_HREF,
    });

    expect(metadata.title).toBe("Skapa hemsida med AI");
    expect(metadata.description).toBe("Riktig landningssida.");
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.alternates).toEqual({
      canonical: `${PUBLIC_CANONICAL_ORIGIN}/skapa-hemsida-med-ai`,
    });
  });

  it("keeps ready landing pages noindex on preview so they cannot become a second index", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const metadata = createSeoLandingMetadata("skapa-hemsida");
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.alternates).toEqual({
      canonical: `${PUBLIC_CANONICAL_ORIGIN}/skapa-hemsida`,
    });
  });
});
