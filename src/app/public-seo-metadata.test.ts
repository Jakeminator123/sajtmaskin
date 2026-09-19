import { describe, expect, it } from "vitest";
import { PUBLIC_CANONICAL_ORIGIN } from "@/lib/public-canonical-url";
import { metadata as faqMetadata } from "./faq/layout";
import { metadata as builderMetadata } from "./builder/layout";
import { metadata as projectsMetadata } from "./projects/layout";
import { metadata as auditsMetadata } from "./audits/layout";
import { metadata as buyCreditsMetadata } from "./buy-credits/layout";
import { metadata as kontoMetadata } from "./konto/layout";
import { metadata as homeMetadata } from "./page";
import { metadata as omMetadata } from "./om/page";
import { generateMetadata as generateCategoryMetadata } from "./category/[type]/layout";

const NOINDEX = { index: false, follow: false };

describe("public and private SEO metadata", () => {
  it("gives the homepage a self canonical on sajtmaskin.se", () => {
    expect(homeMetadata.alternates).toEqual({
      canonical: PUBLIC_CANONICAL_ORIGIN,
    });
  });

  it("gives public information pages a self canonical on sajtmaskin.se", () => {
    expect(omMetadata.alternates).toEqual({
      canonical: `${PUBLIC_CANONICAL_ORIGIN}/om`,
    });
    expect(faqMetadata.alternates).toEqual({
      canonical: `${PUBLIC_CANONICAL_ORIGIN}/faq`,
    });
    expect(faqMetadata.alternates?.canonical).not.toBe(`${PUBLIC_CANONICAL_ORIGIN}/`);
  });

  it("marks app-internal surfaces noindex", () => {
    expect(builderMetadata.robots).toEqual(NOINDEX);
    expect(projectsMetadata.robots).toEqual(NOINDEX);
    expect(auditsMetadata.robots).toEqual(NOINDEX);
    expect(buyCreditsMetadata.robots).toEqual(NOINDEX);
    expect(kontoMetadata.robots).toEqual(NOINDEX);
  });

  it("gives category pages their own canonical, not the homepage", async () => {
    const metadata = await generateCategoryMetadata({
      params: Promise.resolve({ type: "ai" }),
    });
    expect(metadata.alternates).toEqual({
      canonical: `${PUBLIC_CANONICAL_ORIGIN}/category/ai`,
    });
    expect(metadata.title).toBe("AI");
  });
});
