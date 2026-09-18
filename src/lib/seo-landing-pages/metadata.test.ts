import { describe, expect, it } from "vitest";
import { URLS } from "@/lib/config";
import { createSeoLandingMetadata, seoLandingMetadataFromEntry } from "./metadata";
import { SEO_LANDING_CTA_HREF, SEO_LANDING_PAGES } from "./registry";

describe("SEO landing metadata", () => {
  it("marks placeholders as noindex and ready pages as indexable, all with a self canonical", () => {
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
        canonical: `${URLS.baseUrl}/${page.slug}`,
      });
      expect(metadata.openGraph).toEqual({
        title: metadata.title,
        description: metadata.description,
        url: `${URLS.baseUrl}/${page.slug}`,
        type: "website",
        locale: "sv_SE",
        siteName: "Sajtmaskin",
      });
      expect(metadata.twitter).toEqual({
        card: "summary_large_image",
        title: metadata.title,
        description: metadata.description,
      });
    }
  });

  it("indexes a ready entry with its public title and description", () => {
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
      canonical: `${URLS.baseUrl}/skapa-hemsida-med-ai`,
    });
    expect(metadata.openGraph?.url).toBe(`${URLS.baseUrl}/skapa-hemsida-med-ai`);
    expect(metadata.twitter).toEqual(
      expect.objectContaining({ card: "summary_large_image" }),
    );
  });
});
