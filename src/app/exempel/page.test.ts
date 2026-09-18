import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EXEMPEL_CANONICAL_URL, EXEMPEL_DISCLOSURE } from "@/lib/exempel/showcase-sites";
import { metadata } from "./page";

describe("/exempel metadata", () => {
  it("is indexable with the production canonical and social cards", () => {
    expect(metadata.title).toBe("Exempel på hemsidor");
    expect(metadata.description).toMatch(/rekonstruktion/i);
    expect(metadata.description).not.toMatch(/kundcase/i);
    expect(metadata.alternates).toEqual({ canonical: EXEMPEL_CANONICAL_URL });
    expect(metadata.alternates?.canonical).toBe("https://sajtmaskin.se/exempel");
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.openGraph).toMatchObject({
      url: EXEMPEL_CANONICAL_URL,
      locale: "sv_SE",
      type: "website",
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      description: EXEMPEL_DISCLOSURE,
    });
  });

  it("pins the production canonical in source like /analys", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/exempel/page.tsx"), "utf8");
    expect(source).toMatch(/canonical: EXEMPEL_CANONICAL_URL/);
    expect(EXEMPEL_CANONICAL_URL).toBe("https://sajtmaskin.se/exempel");
  });
});
