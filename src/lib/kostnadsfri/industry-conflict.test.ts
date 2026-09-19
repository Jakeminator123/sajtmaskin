import { describe, expect, it } from "vitest";
import {
  assertNoHospitalityGamingConflict,
  compiledPromptHasHospitalityGamingConflict,
  hospitalityIndustryConflictsWithGamingText,
  kostnadsfriIndustryConflictFromResponse,
  KostnadsfriIndustryConflictError,
} from "./industry-conflict";

describe("hospitality vs gaming/lottery conflict", () => {
  it("does not treat an empty industry as restaurant", () => {
    expect(
      hospitalityIndustryConflictsWithGamingText(
        "",
        "Vi bygger lotteri- och spelplattformar",
      ),
    ).toBe(false);
    expect(() =>
      assertNoHospitalityGamingConflict("", "Casino och spellicens"),
    ).not.toThrow();
  });

  it("flags restaurant/cafe/health against lottery or gaming platform prose", () => {
    expect(
      hospitalityIndustryConflictsWithGamingText(
        "restaurant",
        "Lotteri och spelplattformar för reglerade marknader",
      ),
    ).toBe(true);
    expect(
      hospitalityIndustryConflictsWithGamingText("cafe", undefined, "igaming platform"),
    ).toBe(true);
    expect(
      hospitalityIndustryConflictsWithGamingText("health", "Sportsbook och live casino"),
    ).toBe(true);
  });

  it("leaves a matching hospitality brief alone", () => {
    expect(
      hospitalityIndustryConflictsWithGamingText(
        "restaurant",
        "Husmanskost och boka bord i Gamla stan",
      ),
    ).toBe(false);
  });

  it("throws a typed conflict instead of returning a hybrid", () => {
    expect(() =>
      assertNoHospitalityGamingConflict("restaurant", "Lotteriplattform med spellicens"),
    ).toThrow(KostnadsfriIndustryConflictError);
  });

  it("rebuilds the typed error from a 409 response body", () => {
    const err = kostnadsfriIndustryConflictFromResponse(
      { code: "kostnadsfri_industry_conflict" },
      "restaurant",
    );
    expect(err).toBeInstanceOf(KostnadsfriIndustryConflictError);
    expect(err?.industryId).toBe("restaurant");
    expect(kostnadsfriIndustryConflictFromResponse({ error: "Failed to create prompt" })).toBeNull();
  });

  it("flags a compiled restaurant+lottery prompt the client could POST", () => {
    const incidentPrompt =
      'Build a professional website for "ImpactWin Group AB", a Restaurang/Bar company based in Stockholm.\n' +
      "About the company: Utvecklar digitala plattformar för lotteriförsäljning.";
    expect(compiledPromptHasHospitalityGamingConflict(incidentPrompt)).toBe(true);
    expect(compiledPromptHasHospitalityGamingConflict("Bygg en sajt")).toBe(false);
  });
});
