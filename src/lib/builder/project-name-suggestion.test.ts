import { describe, expect, it } from "vitest";
import {
  MAX_SUGGESTED_PROJECT_NAME_LENGTH,
  suggestProjectNameFromPrompt,
} from "./project-name-suggestion";

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
