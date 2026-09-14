import { describe, expect, it } from "vitest";
import {
  WIZARD_INDUSTRIES,
  WIZARD_INDUSTRY_IDS,
  WIZARD_INDUSTRY_LABELS,
  WIZARD_PURPOSE_IDS,
  WIZARD_PURPOSES,
  WIZARD_VIBE_IDS,
  WIZARD_VIBES,
  resolveWizardIndustryHint,
} from "./wizard-taxonomy";

describe("wizard-taxonomy", () => {
  it("owns the same eleven industry ids as both wizards used before the move", () => {
    expect([...WIZARD_INDUSTRY_IDS]).toEqual([
      "cafe",
      "restaurant",
      "retail",
      "tech",
      "consulting",
      "health",
      "creative",
      "education",
      "ecommerce",
      "realestate",
      "other",
    ]);
    expect(WIZARD_INDUSTRIES.map((industry) => industry.id)).toEqual([...WIZARD_INDUSTRY_IDS]);
  });

  it("keeps the existing Swedish labels, suggested features and purpose copy", () => {
    expect(WIZARD_INDUSTRY_LABELS.cafe).toBe("Café/Konditori");
    expect(WIZARD_INDUSTRY_LABELS.health).toBe("Hälsa/Wellness");
    expect(WIZARD_INDUSTRY_LABELS.other).toBe("Annat");
    expect(WIZARD_INDUSTRIES.find((industry) => industry.id === "cafe")?.suggestedFeatures).toEqual([
      "Meny",
      "Öppettider",
      "Bildgalleri",
      "Bordbokning",
    ]);
    expect([...WIZARD_PURPOSE_IDS]).toEqual([
      "sell",
      "leads",
      "portfolio",
      "inform",
      "brand",
      "booking",
      "conversion",
      "rebrand",
    ]);
    expect(WIZARD_PURPOSES.find((purpose) => purpose.id === "booking")).toEqual({
      id: "booking",
      label: "Bokningar",
      desc: "Ta emot bokningar",
    });
    expect([...WIZARD_VIBE_IDS]).toEqual([
      "modern",
      "playful",
      "brutalist",
      "luxury",
      "tech",
      "minimal",
    ]);
    expect(WIZARD_VIBES.find((vibe) => vibe.id === "modern")?.label).toBe("Modern & Clean");
  });

  it("does not add a hair/beauty industry id", () => {
    expect(WIZARD_INDUSTRY_IDS).not.toContain("hair");
    expect(WIZARD_INDUSTRY_IDS).not.toContain("beauty");
    expect(WIZARD_INDUSTRY_IDS).not.toContain("frisor");
    expect(WIZARD_INDUSTRIES.some((industry) => /frisör|skönhet|salong/i.test(industry.label))).toBe(
      false,
    );
  });
});

describe("resolveWizardIndustryHint", () => {
  it("accepts exact ids and known labels or aliases", () => {
    expect(resolveWizardIndustryHint("health")).toBe("health");
    expect(resolveWizardIndustryHint("Hälsa/Wellness")).toBe("health");
    expect(resolveWizardIndustryHint("hälsa")).toBe("health");
    expect(resolveWizardIndustryHint("Café/Konditori")).toBe("cafe");
    expect(resolveWizardIndustryHint("e-handel")).toBe("ecommerce");
    expect(resolveWizardIndustryHint("annat")).toBe("other");
  });

  it("leaves unknown free text empty so the user chooses — frisör is not health", () => {
    expect(resolveWizardIndustryHint("frisörverksamhet")).toBe("");
    expect(resolveWizardIndustryHint("frisör")).toBe("");
    expect(
      resolveWizardIndustryHint(
        "Bolaget skall bedriva frisörverksamhet samt därmed förenlig verksamhet",
      ),
    ).toBe("");
    expect(resolveWizardIndustryHint("spa-salon")).toBe("");
  });

  it("does not guess from blank or unrelated values", () => {
    expect(resolveWizardIndustryHint(null)).toBe("");
    expect(resolveWizardIndustryHint("   ")).toBe("");
    expect(resolveWizardIndustryHint("okänd bransch")).toBe("");
  });
});
