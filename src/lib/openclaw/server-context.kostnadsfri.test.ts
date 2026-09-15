import { describe, expect, it, vi } from "vitest";

// `resolve-file-context` drar in db-klienten, som kräver POSTGRES_URL vid import.
// Kontextblocket är rent och rör aldrig filkontexten här.
vi.mock("./resolve-file-context", () => ({ resolveFileContext: vi.fn() }));

import { buildOpenClawContextBlock } from "./server-context";

/**
 * Kampanjunderlaget reser från browsern i `window.__SITEMASKIN_CONTEXT`, så
 * kontextblocket måste både visa det och normalisera om det.
 */
describe("buildOpenClawContextBlock — kampanjunderlag", () => {
  it("skriver ut underlaget som egen sektion", () => {
    const block = buildOpenClawContextBlock({
      page: "kostnadsfri",
      companyName: "Zax Frisör",
      kostnadsfriBrief: {
        stage: "handoff",
        companyName: "Zax Frisör",
        contactFirstName: "Jan",
        city: "Kista",
        industryLabel: "Hälsa/Wellness",
        businessDescription: "Vi klipper och färgar hår i Kista.",
        purposeLabels: ["Bokningar"],
      },
    });

    expect(block).toContain("[KAMPANJ-UNDERLAG]");
    expect(block).toContain("Tilltalsnamn: Jan");
    expect(block).toContain("Ort: Kista");
    expect(block).toContain("Bransch: Hälsa/Wellness");
    expect(block).toContain("Mål med sajten: Bokningar");
    expect(block).toContain("[/KAMPANJ-UNDERLAG]");
  });

  it("utelämnar sektionen helt utan underlag", () => {
    const block = buildOpenClawContextBlock({ page: "builder", companyName: "Zax Frisör" });
    expect(block).not.toContain("KAMPANJ-UNDERLAG");
  });

  it("litar inte på klientens objekt — okända fält och skräp faller bort", () => {
    const block = buildOpenClawContextBlock({
      page: "kostnadsfri",
      kostnadsfriBrief: {
        companyName: "Zax Frisör",
        orgNumber: "559599-5639",
        streetAddress: "c/o Klippoteket, Kistagången",
        industryLabel: "Frisörsalong",
      },
    });

    expect(block).toContain("[KAMPANJ-UNDERLAG]");
    expect(block).not.toContain("559599-5639");
    expect(block).not.toContain("Kistagången");
    expect(block).not.toContain("Frisörsalong");
    // Okänt steg faller tillbaka på lösenordssteget i stället för att gissa.
    expect(block).toContain("Steg: lösenordssteget");
  });

  it("hoppar över ett underlag utan företagsnamn", () => {
    const block = buildOpenClawContextBlock({
      page: "kostnadsfri",
      kostnadsfriBrief: { stage: "handoff", city: "Kista" },
    });
    expect(block).not.toContain("KAMPANJ-UNDERLAG");
  });

  it("skriver uppföljningsdirektiv i systemkanalen, inte som chattreplik", () => {
    const block = buildOpenClawContextBlock({
      page: "kostnadsfri",
      kostnadsfriBrief: { stage: "handoff", companyName: "Zax Frisör" },
      kostnadsfriCampaign: { followupsSkipped: false, remaining: 5, buildStarted: false },
    });

    expect(block).toContain("[KAMPANJ-MANUS]");
    expect(block).toContain("Uppföljningsdirektiv");
    expect(block).toContain("Fråga vad som skiljer dem från konkurrenterna.");
    expect(block).toContain("Rådgivningskvot: 5");
    expect(block.toLowerCase()).not.toMatch(/generering|ombyggnad/);
  });
});
