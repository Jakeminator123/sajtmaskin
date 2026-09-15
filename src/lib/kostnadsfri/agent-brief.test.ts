import { describe, expect, it } from "vitest";
import type { KostnadsfriCompanyData, MiniWizardData } from "./index";
import {
  buildKostnadsfriAgentBrief,
  kostnadsfriAgentBriefLines,
  normalizeKostnadsfriAgentBrief,
} from "./agent-brief";

// Underlaget är JakobScrape-dashens företagsvy: allowlistad profil plus de
// kolumner `kostnadsfri_pages` äger.
const companyData: KostnadsfriCompanyData = {
  slug: "zax-2-0-ab",
  companyName: "Zax 2.0 AB",
  industry: null,
  website: null,
  contactEmail: "info@zax.example",
  contactName: "Jan Rickard Mandahl",
  openclawConfig: null,
  profile: {
    orgNumber: "559599-5639",
    registeredOffice: "Stockholm",
    city: "Kista",
    postalCode: "164 40",
    streetAddress: "c/o Klippoteket Zax 2000 AB, Kistagången",
    businessDescription: "Bolaget skall bedriva frisörverksamhet samt därmed förenlig verksamhet.",
    registeredAt: "2026-07-10",
  },
};

const wizardData: MiniWizardData = {
  companyName: "Zax Frisör",
  industry: "health",
  website: "https://zax.example",
  location: "Kista",
  description: "Vi klipper och färgar hår i Kista sedan 2026.",
  purposes: ["booking", "leads"],
  targetAudience: "Boende i Kista och norra Stockholm",
  usp: "Drop-in på kvällar",
  designVibe: "luxury",
  paletteName: "Ocean",
  colorPrimary: "#000000",
  colorSecondary: "#333333",
  colorAccent: "#2dd4bf",
};

describe("buildKostnadsfriAgentBrief", () => {
  it("bygger underlag ur bolagsdata innan wizarden svarat", () => {
    const brief = buildKostnadsfriAgentBrief({
      stage: "wizard",
      companyData,
      fallbackCompanyName: "Zax 2 0 Ab",
    });

    expect(brief).toEqual({
      stage: "wizard",
      companyName: "Zax 2.0 AB",
      contactFirstName: "Jan",
      city: "Kista",
      businessDescription:
        "Bolaget skall bedriva frisörverksamhet samt därmed förenlig verksamhet.",
      businessDescriptionSource: "register",
    });
  });

  it("låter wizardens bekräftade svar vinna varje överlapp", () => {
    const brief = buildKostnadsfriAgentBrief({
      stage: "handoff",
      companyData,
      fallbackCompanyName: "Zax 2 0 Ab",
      wizardData,
    });

    expect(brief.companyName).toBe("Zax Frisör");
    expect(brief.industryLabel).toBe("Hälsa/Wellness");
    expect(brief.website).toBe("https://zax.example");
    expect(brief.businessDescription).toBe("Vi klipper och färgar hår i Kista sedan 2026.");
    expect(brief.businessDescriptionSource).toBe("wizard");
    expect(brief.purposeLabels).toEqual(["Bokningar", "Leads"]);
    expect(brief.targetAudience).toBe("Boende i Kista och norra Stockholm");
    expect(brief.usp).toBe("Drop-in på kvällar");
    expect(brief.vibeLabel).toBe("Luxury");
    expect(brief.paletteName).toBe("Ocean");
  });

  it("tar aldrig med org.nr, postnummer, gatuadress eller registreringsdatum", () => {
    const brief = buildKostnadsfriAgentBrief({
      stage: "handoff",
      companyData,
      fallbackCompanyName: "Zax 2 0 Ab",
      wizardData,
    });
    const dumped = JSON.stringify(brief);

    expect(dumped).not.toContain("559599-5639");
    expect(dumped).not.toContain("164 40");
    expect(dumped).not.toContain("Kistagången");
    expect(dumped).not.toContain("c/o");
    expect(dumped).not.toContain("2026-07-10");
    // Kontakt-e-post hör i registret, inte i ett samtalsunderlag.
    expect(dumped).not.toContain("info@zax.example");
  });

  it("tar bara förnamnet som tilltal, aldrig efternamnet", () => {
    const brief = buildKostnadsfriAgentBrief({
      stage: "gate",
      companyData,
      fallbackCompanyName: "Zax 2 0 Ab",
    });

    expect(brief.contactFirstName).toBe("Jan");
    expect(JSON.stringify(brief)).not.toContain("Mandahl");
  });

  it("faller tillbaka på säte när postort saknas, och på slug-namnet utan DB-rad", () => {
    const withoutCity = buildKostnadsfriAgentBrief({
      stage: "wizard",
      companyData: { ...companyData, profile: { registeredOffice: "Stockholm" } },
      fallbackCompanyName: "Zax 2 0 Ab",
    });
    expect(withoutCity.city).toBe("Stockholm");

    const withoutRow = buildKostnadsfriAgentBrief({
      stage: "gate",
      companyData: null,
      fallbackCompanyName: "Zax 2 0 Ab",
    });
    expect(withoutRow).toEqual({ stage: "gate", companyName: "Zax 2 0 Ab" });
  });

  it("sätter bransch bara när fritexten är ett verkligt fack", () => {
    const unknown = buildKostnadsfriAgentBrief({
      stage: "wizard",
      companyData: { ...companyData, industry: "frisörverksamhet" },
      fallbackCompanyName: "Zax 2 0 Ab",
    });
    expect(unknown.industryLabel).toBeUndefined();

    const alias = buildKostnadsfriAgentBrief({
      stage: "wizard",
      companyData: { ...companyData, industry: "Hälsa/Wellness" },
      fallbackCompanyName: "Zax 2 0 Ab",
    });
    expect(alias.industryLabel).toBe("Hälsa/Wellness");
  });

  it("kapar verksamhetstexten så kontextblocket förblir bundet", () => {
    const brief = buildKostnadsfriAgentBrief({
      stage: "wizard",
      companyData: {
        ...companyData,
        profile: { businessDescription: "x".repeat(900) },
      },
      fallbackCompanyName: "Zax 2 0 Ab",
    });

    expect(brief.businessDescription).toHaveLength(600);
  });
});

describe("normalizeKostnadsfriAgentBrief", () => {
  it("kräver företagsnamn och godtar bara kända steg", () => {
    expect(normalizeKostnadsfriAgentBrief(null)).toBeNull();
    expect(normalizeKostnadsfriAgentBrief("Zax")).toBeNull();
    expect(normalizeKostnadsfriAgentBrief({ city: "Kista" })).toBeNull();
    expect(
      normalizeKostnadsfriAgentBrief({ companyName: "Zax", stage: "root" })?.stage,
    ).toBe("gate");
  });

  it("applicerar om caps och fältlista på klientstyrd input", () => {
    const brief = normalizeKostnadsfriAgentBrief({
      stage: "handoff",
      companyName: "Zax 2.0 AB",
      contactFirstName: "Jan Rickard",
      businessDescription: "y".repeat(900),
      purposeLabels: ["Bokningar", "Leads", "", 42],
      orgNumber: "559599-5639",
      streetAddress: "c/o Klippoteket",
    });

    expect(brief?.contactFirstName).toBe("Jan");
    expect(brief?.businessDescription).toHaveLength(600);
    expect(brief?.purposeLabels).toEqual(["Bokningar", "Leads"]);
    // Okända nycklar följer inte med bara för att avsändaren skickade dem.
    expect(JSON.stringify(brief)).not.toContain("559599-5639");
    expect(JSON.stringify(brief)).not.toContain("Klippoteket");
  });

  it("släpper igenom en bransch bara om den fortfarande är ett fack", () => {
    expect(
      normalizeKostnadsfriAgentBrief({ companyName: "Zax", industryLabel: "Hälsa/Wellness" })
        ?.industryLabel,
    ).toBe("Hälsa/Wellness");
    expect(
      normalizeKostnadsfriAgentBrief({ companyName: "Zax", industryLabel: "Frisörsalong" })
        ?.industryLabel,
    ).toBeUndefined();
  });

  it("godtar bara register- eller wizard-källa för verksamhetstexten", () => {
    expect(
      normalizeKostnadsfriAgentBrief({
        companyName: "Zax",
        businessDescription: "Bekräftad",
        businessDescriptionSource: "wizard",
      })?.businessDescriptionSource,
    ).toBe("wizard");
    expect(
      normalizeKostnadsfriAgentBrief({
        companyName: "Zax",
        businessDescription: "Register",
        businessDescriptionSource: "register",
      })?.businessDescriptionSource,
    ).toBe("register");
    expect(
      normalizeKostnadsfriAgentBrief({
        companyName: "Zax",
        businessDescription: "Okänd",
        businessDescriptionSource: "gpt",
      })?.businessDescriptionSource,
    ).toBeUndefined();
  });
});

describe("kostnadsfriAgentBriefLines", () => {
  it("ger inga rader utan underlag", () => {
    expect(kostnadsfriAgentBriefLines(null)).toEqual([]);
  });

  it("märker registertext som torr prosa som ska omformuleras", () => {
    const lines = kostnadsfriAgentBriefLines(
      buildKostnadsfriAgentBrief({
        stage: "wizard",
        companyData,
        fallbackCompanyName: "Zax 2 0 Ab",
      }),
    );
    const block = lines.join("\n");

    expect(block).toContain(
      "Verksamhet enligt registret (torr registerprosa — omformulera, citera inte)",
    );
    expect(block).not.toContain("kundens bekräftade beskrivning");
  });

  it("märker wizardens bekräftade beskrivning som kundens underlag", () => {
    const brief = buildKostnadsfriAgentBrief({
      stage: "handoff",
      companyData,
      fallbackCompanyName: "Zax 2 0 Ab",
      wizardData,
    });
    const lines = kostnadsfriAgentBriefLines(brief);
    const block = lines.join("\n");

    expect(brief.businessDescriptionSource).toBe("wizard");
    expect(lines[0]).toBe("[KAMPANJ-UNDERLAG]");
    expect(lines.at(-1)).toBe("[/KAMPANJ-UNDERLAG]");
    expect(block).toContain("Steg: wizardsvaren klara, bygget startar");
    expect(block).toContain("Företag: Zax Frisör");
    expect(block).toContain("aldrig i sajtens innehåll");
    expect(block).toContain("Verksamhet (kundens bekräftade beskrivning — utgå från den)");
    expect(block).not.toContain("enligt registret");
    expect(block).not.toContain("omformulera, citera inte");
  });
});
