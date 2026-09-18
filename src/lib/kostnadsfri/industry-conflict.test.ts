import { describe, expect, it } from "vitest";
import {
  assertNoHospitalityGamingConflict,
  hospitalityIndustryConflictsWithGamingText,
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
});
