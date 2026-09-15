import { describe, expect, it } from "vitest";
import {
  extractKostnadsfriCompanyProfile,
  findPersonalIdentityViolations,
  hasInvalidOrgNumber,
  normalizeKostnadsfriCompanyProfile,
} from "./company-profile";

// Ägarbeslut 2026-09-15: allowlist av bolagsfält, personnummer hårdspärrade.
// Underlaget är JakobScrape-dashens företagsvy (Zax 2.0 AB / K603156-26).
describe("findPersonalIdentityViolations", () => {
  it("namnger fältet men aldrig värdet när ett personnummer smugglats in", () => {
    const violations = findPersonalIdentityViolations({
      businessDescription: "Frisörverksamhet",
      contactPersonalId: "19748885-2517",
    });

    expect(violations).toEqual(["contactPersonalId"]);
  });

  it("tar både tolvsiffrig, tiosiffrig, plus-form och separatorlös form", () => {
    expect(findPersonalIdentityViolations({ a: "197488852517" })).toEqual(["a"]);
    expect(findPersonalIdentityViolations({ b: "748885-2517" })).toEqual(["b"]);
    expect(findPersonalIdentityViolations({ c: "080101+1234" })).toEqual(["c"]);
    expect(findPersonalIdentityViolations({ d: "7488852517" })).toEqual(["d"]);
  });

  // Guarden gick tidigare bara på toppnivåns strängar, så dashen kunde nästla
  // ledamöterna ett steg ned och passera tyst.
  it("hittar numret nästlat i objekt och i array-av-objekt", () => {
    expect(
      findPersonalIdentityViolations({
        boardMembers: [{ name: "Didar", personalId: "19748885-2517" }],
      }),
    ).toEqual(["boardMembers"]);
    expect(
      findPersonalIdentityViolations({ owner: { identity: { ssn: "748885-2517" } } }),
    ).toEqual(["owner"]);
  });

  it("fäller ett personnummer skickat som JSON-tal", () => {
    expect(findPersonalIdentityViolations({ contactPersonalId: 7488852517 })).toEqual([
      "contactPersonalId",
    ]);
  });

  it("hittar numret även inbäddat i fritext och i en lista", () => {
    expect(
      findPersonalIdentityViolations({
        businessDescription: "Ledamot 19748885-2517 äger bolaget",
      }),
    ).toEqual(["businessDescription"]);
    expect(findPersonalIdentityViolations({ people: ["Didar", "748885-2517"] })).toEqual([
      "people",
    ]);
  });

  // Organisationsnummer har identisk form och är uttryckligen tillåtet, så det
  // fältet undantas från mönsterkontrollen och valideras separat.
  it("släpper igenom organisationsnummer i orgNumber", () => {
    expect(findPersonalIdentityViolations({ orgNumber: "559599-5639" })).toEqual([]);
  });

  it("fäller ett organisationsnummer som lagts i ett annat fält", () => {
    expect(findPersonalIdentityViolations({ registeredOffice: "559599-5639" })).toEqual([
      "registeredOffice",
    ]);
  });

  it("låter vanliga adress- och postnummervärden passera", () => {
    expect(
      findPersonalIdentityViolations({
        streetAddress: "c/o Klippoteket Zax 2000 AB, Kistagången",
        postalCode: "164 40",
        city: "Kista",
        registeredAt: "2026-07-10",
      }),
    ).toEqual([]);
  });

  it("returnerar tom lista för icke-objekt", () => {
    expect(findPersonalIdentityViolations(null)).toEqual([]);
    expect(findPersonalIdentityViolations("19748885-2517")).toEqual([]);
  });
});

describe("hasInvalidOrgNumber", () => {
  it("accepterar med och utan bindestreck", () => {
    expect(hasInvalidOrgNumber({ orgNumber: "559599-5639" })).toBe(false);
    expect(hasInvalidOrgNumber({ orgNumber: "5595995639" })).toBe(false);
  });

  it("avvisar fel längd och skräp", () => {
    expect(hasInvalidOrgNumber({ orgNumber: "5595-99" })).toBe(true);
    expect(hasInvalidOrgNumber({ orgNumber: "197488852517" })).toBe(true);
    expect(hasInvalidOrgNumber({ orgNumber: "inte ett nummer" })).toBe(true);
  });

  // Fältet är undantaget personnummerguarden, så det här är enda spärren mot
  // att ett personnummer lagras och returneras som organisationsnummer.
  it("avvisar ett personnummer trots att formen är identisk", () => {
    // Luhn-giltigt personnummer: bara gruppnummerregeln (tredje siffran ≥ 2)
    // skiljer det från ett org.nr, eftersom position 3–4 bär månaden.
    expect(hasInvalidOrgNumber({ orgNumber: "811228-9874" })).toBe(true);
    expect(hasInvalidOrgNumber({ orgNumber: "8112289874" })).toBe(true);
    expect(hasInvalidOrgNumber({ orgNumber: "850709-1234" })).toBe(true);
  });

  it("avvisar fel kontrollsiffra", () => {
    expect(hasInvalidOrgNumber({ orgNumber: "559599-5630" })).toBe(true);
  });

  it("avvisar skräp runt en i övrigt giltig sifferföljd", () => {
    // Tidigare ströks alla icke-siffror bort före kontrollen.
    expect(hasInvalidOrgNumber({ orgNumber: "född 850709-1234!" })).toBe(true);
    expect(hasInvalidOrgNumber({ orgNumber: "org 559599-5639" })).toBe(true);
    expect(hasInvalidOrgNumber({ orgNumber: "55 95 99 56 39" })).toBe(true);
  });

  it("är tyst när fältet saknas", () => {
    expect(hasInvalidOrgNumber({})).toBe(false);
    expect(hasInvalidOrgNumber({ orgNumber: "" })).toBe(false);
    expect(hasInvalidOrgNumber(null)).toBe(false);
  });
});

describe("normalizeKostnadsfriCompanyProfile", () => {
  it("behåller allowlistade fält och normaliserar org.nr och datum", () => {
    const profile = normalizeKostnadsfriCompanyProfile({
      orgNumber: "5595995639",
      registeredOffice: "  Stockholm ",
      city: "Kista",
      postalCode: "164 40",
      streetAddress: "c/o Klippoteket Zax 2000 AB, Kistagången",
      businessDescription: "Bolaget skall bedriva frisörverksamhet samt därmed förenlig verksamhet.",
      registeredAt: "2026-07-10T00:00:00.000Z",
    });

    expect(profile).toEqual({
      orgNumber: "559599-5639",
      registeredOffice: "Stockholm",
      city: "Kista",
      postalCode: "164 40",
      streetAddress: "c/o Klippoteket Zax 2000 AB, Kistagången",
      businessDescription: "Bolaget skall bedriva frisörverksamhet samt därmed förenlig verksamhet.",
      registeredAt: "2026-07-10",
    });
  });

  it("släpper fält utanför allowlisten — hemadress, ålder, aktiekapital, rå text", () => {
    const profile = normalizeKostnadsfriCompanyProfile({
      city: "Kista",
      homeAddress: "HÖGNÄSVÄGEN 4, 196 34 KUNGSÄNGEN",
      age: "52",
      shareCapital: "25.000 SEK",
      rawAnnouncement: "Rå kungörelsetext…",
      boardMembers: ["Didar Sabir Salim", "Adam Skkur"],
    });

    expect(profile).toEqual({ city: "Kista" });
  });

  it("returnerar null när inget allowlistat fält har värde", () => {
    expect(normalizeKostnadsfriCompanyProfile({ shareCapital: "25.000 SEK" })).toBeNull();
    expect(normalizeKostnadsfriCompanyProfile({ city: "   " })).toBeNull();
    expect(normalizeKostnadsfriCompanyProfile(null)).toBeNull();
  });

  // Guarden i routen ska ha fällt requesten långt tidigare. Det här är skyddet
  // mot en framtida anropsväg som glömmer den.
  it("lagrar inte ett personnummer även om guarden hoppats över", () => {
    const profile = normalizeKostnadsfriCompanyProfile({
      city: "Kista",
      businessDescription: "Ledamot 19748885-2517",
    });

    expect(profile).toEqual({ city: "Kista" });
  });

  it("släpper registeredAt som inte är ett verkligt kalenderdatum", () => {
    expect(normalizeKostnadsfriCompanyProfile({ registeredAt: "2026-02-31" })).toBeNull();
    expect(normalizeKostnadsfriCompanyProfile({ registeredAt: "2026-13-01" })).toBeNull();
    // Prefixmatchningen släppte tidigare igenom efterföljande skräp.
    expect(
      normalizeKostnadsfriCompanyProfile({ registeredAt: "2026-07-10 (osäkert)" }),
    ).toBeNull();
  });

  it("lagrar inte ett personnummer i orgNumber", () => {
    expect(
      normalizeKostnadsfriCompanyProfile({ city: "Kista", orgNumber: "811228-9874" }),
    ).toEqual({ city: "Kista" });
  });

  it("kapar långa värden i stället för att avvisa dem", () => {
    const profile = normalizeKostnadsfriCompanyProfile({
      businessDescription: "x".repeat(900),
    });

    expect(profile?.businessDescription).toHaveLength(600);
  });
});

describe("extractKostnadsfriCompanyProfile", () => {
  it("läser profile ur extra_data utan att röra openclaw", () => {
    const profile = extractKostnadsfriCompanyProfile({
      openclaw: { roleLabel: "Sajtagenten" },
      profile: { city: "Kista", orgNumber: "559599-5639" },
    });

    expect(profile).toEqual({ city: "Kista", orgNumber: "559599-5639" });
  });

  it("är null när extra_data saknas eller inte bär någon profil", () => {
    expect(extractKostnadsfriCompanyProfile(null)).toBeNull();
    expect(extractKostnadsfriCompanyProfile({ openclaw: {} })).toBeNull();
  });
});
