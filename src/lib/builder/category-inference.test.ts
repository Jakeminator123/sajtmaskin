import { describe, expect, it } from "vitest";

import { inferCategoriesFromText } from "./category-inference";

describe("category-inference", () => {
  it("classifies a forestry company in Vaggeryd as business (not ecommerce)", () => {
    const text =
      "Vi är ett aktiebolag i Vaggeryd som jobbar med skogsbruk, gallring och avverkning. Vi har egna skogsmaskiner och hjälper skogsägare med virke och timmer.";
    expect(inferCategoriesFromText(text)).toEqual(["business"]);
  });

  it("classifies a trucking firm as business", () => {
    const text =
      "Vi är ett åkeri med lastbilar som hjälper företag med transport och logistik i Sverige.";
    expect(inferCategoriesFromText(text)).toEqual(["business"]);
  });

  it("classifies a car repair shop as auto", () => {
    const text =
      "Välkommen till vår bilverkstad. Vi är mekaniker som gör bilreparation, däckskifte och bilvård.";
    expect(inferCategoriesFromText(text)).toEqual(["auto"]);
  });

  it("still classifies a real webshop as ecommerce", () => {
    const text =
      "Vi har en webshop där du kan handla online, lägga varor i varukorgen och få frakt hem till dörren.";
    expect(inferCategoriesFromText(text)).toEqual(["ecommerce"]);
  });

  it("does not fall back to ecommerce for a consulting agency that mentions sortiment", () => {
    const text =
      "Vi är en managementkonsult och digitalbyrå som hjälper företag med strategi och rådgivning.";
    expect(inferCategoriesFromText(text)).toEqual(["consulting"]);
  });

  it("returns empty array when nothing matches", () => {
    expect(inferCategoriesFromText("xyz 12345")).toEqual([]);
  });

  it("prefers business over ecommerce when scores tie", () => {
    // "företag" gives business 1 hit; "shop" gives ecommerce 1 hit. Without
    // the tie-breaker ecommerce would win by iteration order.
    const text = "Vi är ett företag som driver en liten workshop-studio.";
    const result = inferCategoriesFromText(text);
    expect(result).not.toEqual(["ecommerce"]);
  });

  it("classifies a construction entrepreneur as construction", () => {
    const text =
      "Vi är en byggfirma som jobbar med entreprenad, markarbete, schakt och grävning.";
    expect(inferCategoriesFromText(text)).toEqual(["construction"]);
  });

  it("classifies a VVS installer as construction", () => {
    const text =
      "VVS-installation, rörmokare och värmepump. Vi hjälper villaägare med solceller också.";
    expect(inferCategoriesFromText(text)).toEqual(["construction"]);
  });

  it("emits debug output when debug callback is provided", () => {
    const events: Array<{ label: string; payload: unknown }> = [];
    const result = inferCategoriesFromText("Vi driver en liten webshop för smycken.", {
      debug: (label, payload) => events.push({ label, payload }),
    });
    expect(result).toEqual(["ecommerce"]);
    expect(events).toHaveLength(1);
    expect(events[0]?.label).toBe("[intake] category-inference");
  });
});
