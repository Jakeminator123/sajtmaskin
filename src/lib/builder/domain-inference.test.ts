import { describe, expect, it } from "vitest";
import { inferDomain, inferSiteTypeHintFromDomain } from "./domain-inference";

describe("canonical domain inference", () => {
  it("uses the shared domain rules for Swedish diacritic-rich brief hints", () => {
    expect(inferDomain("Bygg en hemsida för en frisörsalong i Malmö")).toBe("spa-salon");
    expect(inferSiteTypeHintFromDomain("Bygg en hemsida för en frisörsalong i Malmö")).toBe(
      "spa or salon site",
    );
  });

  it("keeps Deep Brief site-type hints aligned with config/domain-rules.json", () => {
    expect(inferSiteTypeHintFromDomain("Skapa en sajt för ett boutiquehotell vid havet")).toBe(
      "hotel or hospitality site",
    );
    expect(inferSiteTypeHintFromDomain("Modern hemsida för en kreativ byrå")).toBe(
      "agency or services site",
    );
    expect(inferSiteTypeHintFromDomain("Meny och bokning för ett litet café")).toBe(
      "restaurant or cafe site",
    );
  });
});
