import { describe, expect, it } from "vitest";
import {
  WIZARD_INDUSTRIES,
  WIZARD_INDUSTRY_IDS,
  WIZARD_INDUSTRY_LABELS,
  WIZARD_PURPOSE_IDS,
  WIZARD_PURPOSES,
  WIZARD_VIBE_IDS,
  WIZARD_VIBES,
  isWizardIndustryId,
  resolveWizardIndustryHint,
  wizardIndustryLabel,
  wizardPurposeLabel,
  wizardVibeLabel,
} from "./wizard-taxonomy";

const INHERITED_OBJECT_KEYS = [
  "constructor",
  "toString",
  "valueOf",
  "hasOwnProperty",
  "__proto__",
] as const;

function expectAllowedIndustryHint(value: unknown) {
  expect(typeof value).toBe("string");
  expect(value === "" || isWizardIndustryId(value as string)).toBe(true);
  if (value !== "") {
    expect([...WIZARD_INDUSTRY_IDS]).toContain(value);
  }
}

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

  it("does not treat inherited Object keys as industry ids", () => {
    for (const key of INHERITED_OBJECT_KEYS) {
      const resolved = resolveWizardIndustryHint(key);
      expect(resolved, key).toBe("");
      expectAllowedIndustryHint(resolved);
      expect(typeof resolved).toBe("string");
    }
  });

  it("returns only empty or an allowed industry id for known inputs", () => {
    const samples = [
      ...WIZARD_INDUSTRY_IDS,
      ...WIZARD_INDUSTRIES.map((industry) => industry.label),
      "hälsa",
      "e-handel",
      "annat",
      "konditori",
      "restaurang",
      "frisörverksamhet",
      "constructor",
      null,
      "   ",
    ];
    for (const sample of samples) {
      expectAllowedIndustryHint(resolveWizardIndustryHint(sample));
    }
  });
});

describe("wizard label lookups", () => {
  it("returns known purpose and vibe labels", () => {
    expect(wizardPurposeLabel("booking")).toBe("Bokningar");
    expect(wizardPurposeLabel("sell")).toBe("Sälja");
    expect(wizardVibeLabel("modern")).toBe("Modern & Clean");
    expect(wizardIndustryLabel("health")).toBe("Hälsa/Wellness");
  });

  it("falls back for inherited Object keys instead of returning a function", () => {
    for (const key of INHERITED_OBJECT_KEYS) {
      expect(wizardPurposeLabel(key, "purpose-fallback")).toBe("purpose-fallback");
      expect(wizardPurposeLabel(key)).toBe(key);
      expect(typeof wizardPurposeLabel(key)).toBe("string");
      expect(wizardPurposeLabel(key)).not.toBeTypeOf("function");

      expect(wizardVibeLabel(key, "vibe-fallback")).toBe("vibe-fallback");
      expect(wizardVibeLabel(key)).toBe(key);
      expect(typeof wizardVibeLabel(key)).toBe("string");
      expect(wizardVibeLabel(key)).not.toBeTypeOf("function");

      expect(wizardIndustryLabel(key, "industry-fallback")).toBe("industry-fallback");
      expect(typeof wizardIndustryLabel(key)).toBe("string");
    }
  });
});
