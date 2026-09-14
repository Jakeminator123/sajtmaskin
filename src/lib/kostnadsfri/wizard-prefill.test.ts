import { describe, expect, it } from "vitest";
import { prefillMiniWizardFromCompanyData } from "./wizard-prefill";

const zaxProfile = {
  orgNumber: "559599-5639",
  registeredOffice: "Stockholm",
  city: "Kista",
  postalCode: "164 40",
  streetAddress: "c/o Klippoteket Zax 2000 AB, Kistagången",
  businessDescription: "Bolaget skall bedriva frisörverksamhet samt därmed förenlig verksamhet.",
  registeredAt: "2026-07-10",
};

describe("prefillMiniWizardFromCompanyData", () => {
  it("fills location and description from the profile, city before registered office", () => {
    const prefill = prefillMiniWizardFromCompanyData({
      companyName: "Zax 2.0 AB",
      industry: "frisörverksamhet",
      website: "https://zax.example",
      profile: zaxProfile,
    });

    expect(prefill).toEqual({
      companyName: "Zax 2.0 AB",
      industry: "",
      website: "https://zax.example",
      location: "Kista",
      description: "Bolaget skall bedriva frisörverksamhet samt därmed förenlig verksamhet.",
    });
    expect(prefill.location).not.toContain("Kistagången");
    expect(prefill.location).not.toContain("c/o");
  });

  it("falls back to registeredOffice when city is missing", () => {
    const prefill = prefillMiniWizardFromCompanyData({
      companyName: "Zax 2.0 AB",
      industry: null,
      website: null,
      profile: { registeredOffice: "Stockholm", streetAddress: "Hemlig c/o" },
    });

    expect(prefill.location).toBe("Stockholm");
    expect(prefill.website).toBe("");
    expect(prefill.description).toBe("");
  });

  it("sets industry only on a known id or alias, never from businessDescription", () => {
    expect(
      prefillMiniWizardFromCompanyData({
        companyName: "Café Södermalm",
        industry: "cafe",
        website: null,
        profile: { businessDescription: "frisörverksamhet" },
      }).industry,
    ).toBe("cafe");

    expect(
      prefillMiniWizardFromCompanyData({
        companyName: "Hälsa AB",
        industry: "Hälsa/Wellness",
        website: null,
        profile: null,
      }).industry,
    ).toBe("health");

    expect(
      prefillMiniWizardFromCompanyData({
        companyName: "Zax 2.0 AB",
        industry: null,
        website: null,
        profile: { businessDescription: "frisörverksamhet" },
      }).industry,
    ).toBe("");
  });
});
