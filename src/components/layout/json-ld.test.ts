import { describe, expect, it } from "vitest";
import { CREDIT_PACKAGES } from "@/lib/billing/credit-packages";
import { PUBLIC_CANONICAL_ORIGIN } from "@/lib/public-canonical-url";
import {
  BreadcrumbListJsonLd,
  FaqPageJsonLd,
  OrganizationJsonLd,
  SoftwareApplicationJsonLd,
} from "./json-ld";

function jsonLdFrom(element: { props: { data: Record<string, unknown> } } | null) {
  expect(element).not.toBeNull();
  return element!.props.data;
}

describe("public JSON-LD", () => {
  it("presents the product brand as Organization and keeps the legal entity as legalName", () => {
    const data = jsonLdFrom(OrganizationJsonLd() as never);
    expect(data["@type"]).toBe("Organization");
    expect(data.name).toBe("Sajtmaskin");
    expect(data.legalName).toBe("Pretty Good B.V.");
    expect(data.url).toBe(PUBLIC_CANONICAL_ORIGIN);
    expect(data.logo).toBe(`${PUBLIC_CANONICAL_ORIGIN}/icon.svg`);
    expect(data.email).toBe("support@sajtmaskin.se");
  });

  it("derives SoftwareApplication offers from CREDIT_PACKAGES", () => {
    const data = jsonLdFrom(SoftwareApplicationJsonLd() as never);
    const prices = CREDIT_PACKAGES.map((pkg) => pkg.price);
    expect(data["@type"]).toBe("SoftwareApplication");
    expect(data.name).toBe("Sajtmaskin");
    expect(data.offers).toEqual({
      "@type": "AggregateOffer",
      priceCurrency: "SEK",
      lowPrice: String(Math.min(...prices)),
      highPrice: String(Math.max(...prices)),
      offerCount: CREDIT_PACKAGES.length,
    });
  });

  it("omits empty breadcrumb and FAQ graphs", () => {
    expect(BreadcrumbListJsonLd({ items: [] })).toBeNull();
    expect(FaqPageJsonLd({ items: [] })).toBeNull();
  });

  it("emits BreadcrumbList and FAQPage only for provided visible items", () => {
    const crumbs = jsonLdFrom(
      BreadcrumbListJsonLd({
        items: [
          { name: "Sajtmaskin", url: PUBLIC_CANONICAL_ORIGIN },
          { name: "Priser", url: `${PUBLIC_CANONICAL_ORIGIN}/priser` },
        ],
      }) as never,
    );
    expect(crumbs["@type"]).toBe("BreadcrumbList");
    expect(crumbs.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Sajtmaskin",
        item: PUBLIC_CANONICAL_ORIGIN,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Priser",
        item: `${PUBLIC_CANONICAL_ORIGIN}/priser`,
      },
    ]);

    const faq = jsonLdFrom(
      FaqPageJsonLd({
        items: [{ q: "Vad är en credit?", a: "1 kr = 1 credit." }],
      }) as never,
    );
    expect(faq["@type"]).toBe("FAQPage");
    expect(faq.mainEntity).toEqual([
      {
        "@type": "Question",
        name: "Vad är en credit?",
        acceptedAnswer: { "@type": "Answer", text: "1 kr = 1 credit." },
      },
    ]);
  });
});
