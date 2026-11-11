import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROJECT_NAME,
  MAX_SUGGESTED_PROJECT_NAME_LENGTH,
  isDefaultProjectName,
  projectNameFromPrompt,
  suggestProjectNameFromPrompt,
} from "./project-name-suggestion";

describe("projectNameFromPrompt", () => {
  // Riggbygget 2026-11-11 (V-02/V-03): projektet hette "Namnlöst projekt" och
  // publiceringen föreslog "Bygg en hemsida för Café Lindgren, ett".
  it("tar verksamhetens namn ur riggens prompt", () => {
    expect(
      projectNameFromPrompt(
        "Bygg en hemsida för Café Lindgren, ett familjeägt kafé i Uppsala med surdegsbröd, " +
          "kanelbullar och vegetarisk lunch. Startsida med en tydlig hjältebild, meny med priser.",
      ),
    ).toBe("Café Lindgren");
  });

  it.each([
    ["Skapa en modern hemsida för en frisörsalong i Malmö med öppettider och kontakt", "Frisörsalong i Malmö"],
    ["En enkel hemsida för en frisörsalong i Malmö med öppettider och kontakt", "Frisörsalong i Malmö"],
    ["Gör en sajt åt Svenssons Bygg AB som bygger altaner i Västerås", "Svenssons Bygg AB"],
    ["Jag vill ha en hemsida för min bilverkstad i Umeå.", "Bilverkstad i Umeå"],
    ["Hej! Kan du bygga en webbplats till vår yogastudio Lotus i Lund?", "Yogastudio Lotus i Lund"],
    ["Kan du hjälpa mig att skapa en sajt för Tandläkare Berg i Örebro", "Tandläkare Berg i Örebro"],
    ["Jag behöver en ny hemsida till mitt företag Nordic Fönster AB", "Nordic Fönster AB"],
    ["Ett familjeägt kafé i Uppsala som heter Café Lindgren", "Café Lindgren"],
    ["Landningssida för appen Pling – boka tvättstugan enkelt", "Appen Pling"],
    ["Restaurang Havsbris i Ystad – fisk och skaldjur vid hamnen", "Restaurang Havsbris i Ystad"],
    ['Skapa en hemsida för "Bageri Blå" i Kalmar', "Bageri Blå"],
    ["Designa en webbshop: Ljusverkstaden, handgjorda ljus från Gotland", "Ljusverkstaden"],
    ["Jag driver en frisörsalong i Göteborg med 3 anställda", "Frisörsalong i Göteborg"],
    ["kaffebar i Visby", "Kaffebar i Visby"],
    ["Hemsida för Kött med Potatis AB i Gävle", "Kött med Potatis AB i Gävle"],
    ["Bygg en sida för cafelindgren.se, med meny", "Cafelindgren.se"],
  ])("%s → %s", (prompt, expected) => {
    expect(projectNameFromPrompt(prompt)).toBe(expected);
  });

  it("kapar en lång beskrivning utan naturlig gräns på ordgräns", () => {
    const name = projectNameFromPrompt(
      "Bygg en hemsida för en familjeägd byggfirma i norra Norrland och södra Lappland",
    );
    expect(name.length).toBeLessThanOrEqual(MAX_SUGGESTED_PROJECT_NAME_LENGTH);
    expect(name).toBe("Familjeägd byggfirma i norra Norrland");
  });

  it("använder första icke-tomma raden", () => {
    expect(projectNameFromPrompt("\n  Bygg en sajt för Ateljé Ek\nMed galleri")).toBe("Ateljé Ek");
  });

  it("returnerar tom sträng när bara sajttypen eller en hälsning finns", () => {
    expect(projectNameFromPrompt("Bygg en hemsida")).toBe("");
    expect(projectNameFromPrompt("Skapa en modern sajt, gärna mörk")).toBe("");
    expect(projectNameFromPrompt("Hej!")).toBe("");
    expect(projectNameFromPrompt("   ")).toBe("");
  });
});

describe("isDefaultProjectName", () => {
  it("känner igen platshållaren och tomt namn", () => {
    expect(isDefaultProjectName(DEFAULT_PROJECT_NAME)).toBe(true);
    expect(isDefaultProjectName("  namnlöst projekt ")).toBe(true);
    expect(isDefaultProjectName(null)).toBe(true);
    expect(isDefaultProjectName("")).toBe(true);
  });

  it("skriver aldrig över ett namn användaren har satt", () => {
    expect(isDefaultProjectName("Café Lindgren")).toBe(false);
    expect(isDefaultProjectName("Namnlöst projekt 2")).toBe(false);
  });
});

describe("suggestProjectNameFromPrompt", () => {
  it("lämnar ett kort förslag orört", () => {
    expect(suggestProjectNameFromPrompt("Kaffebar i Visby")).toBe("Kaffebar i Visby");
  });

  it("tar bara första raden av en flerradig prompt", () => {
    expect(suggestProjectNameFromPrompt("Kaffebar i Visby\nMed meny och öppettider")).toBe(
      "Kaffebar i Visby",
    );
  });

  // Prod-observationen 2026-08-01: 266 tecken friprompt blev "projektnamn".
  it("kapar en lång prompt till maxlängden på ordgräns", () => {
    const prompt =
      "Bygg en modern hemsida för en liten kaffebar i Visby med meny, öppettider, " +
      "karta och ett kontaktformulär som skickar mejl till ägaren";
    const suggestion = suggestProjectNameFromPrompt(prompt);
    expect(suggestion.length).toBeLessThanOrEqual(MAX_SUGGESTED_PROJECT_NAME_LENGTH);
    expect(suggestion).toBe("Bygg en modern hemsida för en liten");
    // Ordgräns: förslaget måste vara ett prefix av prompten följt av mellanslag.
    expect(prompt.startsWith(`${suggestion} `)).toBe(true);
  });

  it("behåller hela sista ordet när gränsen träffar exakt på ordslut", () => {
    const head = "a".repeat(MAX_SUGGESTED_PROJECT_NAME_LENGTH);
    expect(suggestProjectNameFromPrompt(`${head} svans`)).toBe(head);
  });

  it("lämnar ingen trailing-interpunktion efter kapningen", () => {
    const prompt = `${"Butik med hantverk, garn, tyger och mer,"} plus kurser`;
    const suggestion = suggestProjectNameFromPrompt(prompt);
    expect(suggestion).toBe("Butik med hantverk, garn, tyger och mer");
  });

  it("strippar trailing-interpunktion även på korta förslag", () => {
    expect(suggestProjectNameFromPrompt("Kaffebar i Visby!")).toBe("Kaffebar i Visby");
  });

  it("hårdkapar en enda jättelång token utan mellanslag", () => {
    const token = "x".repeat(80);
    expect(suggestProjectNameFromPrompt(token)).toBe(
      "x".repeat(MAX_SUGGESTED_PROJECT_NAME_LENGTH),
    );
  });

  it("returnerar tom sträng när inget användbart finns kvar", () => {
    expect(suggestProjectNameFromPrompt("   ")).toBe("");
    expect(suggestProjectNameFromPrompt("!!!")).toBe("");
  });
});
