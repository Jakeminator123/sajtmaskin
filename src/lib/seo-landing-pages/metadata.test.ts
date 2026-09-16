import { describe, expect, it } from "vitest";
import { URLS } from "@/lib/config";
import { createSeoLandingMetadata, seoLandingMetadataFromEntry } from "./metadata";
import { SEO_LANDING_CTA_HREF, SEO_LANDING_PAGES } from "./registry";

describe("SEO landing metadata", () => {
  it("marks placeholders as noindex with a self canonical", () => {
    for (const page of SEO_LANDING_PAGES) {
      const metadata = createSeoLandingMetadata(page.slug);
      expect(metadata.title).toBe(`Testsida — ${page.title}`);
      expect(metadata.description).toBe(
        "Intern testsida för Sajtmaskin. Inte avsedd för sökindexering.",
      );
      expect(metadata.robots).toEqual({ index: false, follow: false });
      expect(metadata.alternates).toEqual({
        canonical: `${URLS.baseUrl}/${page.slug}`,
      });
    }
  });

  it("indexes a ready entry with its public title and description", () => {
    const metadata = seoLandingMetadataFromEntry({
      slug: "skapa-hemsida-med-ai",
      title: "Skapa hemsida med AI",
      description: "Riktig landningssida.",
      status: "ready",
      ctaHref: SEO_LANDING_CTA_HREF,
    });

    expect(metadata.title).toBe("Skapa hemsida med AI");
    expect(metadata.description).toBe("Riktig landningssida.");
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.alternates).toEqual({
      canonical: `${URLS.baseUrl}/skapa-hemsida-med-ai`,
    });
  });
});
