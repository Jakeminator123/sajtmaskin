import { describe, it, expect } from "vitest";
import {
  consumeMandateStep,
  createArmedMandate,
  DEFAULT_FOLLOWUP_COUNT,
  describeMandate,
  isMandateActive,
  MAX_FOLLOWUP_COUNT,
  parseArmingDirective,
  parseStopDirective,
} from "./armed-mandate";

describe("parseArmingDirective", () => {
  it("returns null for ordinary messages (OpenClaw stays passive)", () => {
    expect(parseArmingDirective("kan du förklara vad en scaffold är?")).toBeNull();
    expect(parseArmingDirective("bygg en sajt åt mig")).toBeNull();
    expect(parseArmingDirective("")).toBeNull();
  });

  it("detects a follow-up mandate with an explicit count", () => {
    const directive = parseArmingDirective("gör 5 follow-ups och buggranska det suspekta");
    expect(directive).not.toBeNull();
    expect(directive?.mode).toBe("followups");
    expect(directive?.count).toBe(5);
  });

  it("detects follow-ups without a count → default", () => {
    const directive = parseArmingDirective("kör follow-ups och buggranska");
    expect(directive?.mode).toBe("followups");
    expect(directive?.count).toBe(DEFAULT_FOLLOWUP_COUNT);
  });

  it("clamps an excessive follow-up count to the ceiling", () => {
    const directive = parseArmingDirective("gör 99 follow-ups");
    expect(directive?.count).toBe(MAX_FOLLOWUP_COUNT);
  });

  it("detects a review-next mandate", () => {
    const directive = parseArmingDirective(
      "granska nästa meddelande jag skapar och ta notis om allt",
    );
    expect(directive?.mode).toBe("review_next");
    expect(directive?.count).toBe(1);
  });
});

describe("parseStopDirective", () => {
  it("detects stop words", () => {
    for (const text of ["stopp", "Stoppa nu", "avbryt", "sluta", "stop please"]) {
      expect(parseStopDirective(text)).toBe(true);
    }
  });

  it("ignores unrelated text", () => {
    expect(parseStopDirective("fortsätt gärna")).toBe(false);
  });
});

describe("mandate lifecycle", () => {
  it("creates and consumes a bounded mandate", () => {
    const mandate = createArmedMandate({ mode: "followups", count: 2, reason: "x" }, 1000);
    expect(mandate.remaining).toBe(2);
    expect(isMandateActive(mandate)).toBe(true);

    const after1 = consumeMandateStep(mandate);
    expect(after1?.remaining).toBe(1);
    expect(isMandateActive(after1)).toBe(true);

    const after2 = consumeMandateStep(after1);
    expect(after2).toBeNull();
    expect(isMandateActive(after2)).toBe(false);
  });

  it("describeMandate reflects state", () => {
    expect(describeMandate(null)).toMatch(/ingen aktiv/i);
    expect(describeMandate(createArmedMandate({ mode: "review_next", count: 1, reason: "" }))).toMatch(
      /granskar nästa/i,
    );
    expect(
      describeMandate(createArmedMandate({ mode: "followups", count: 3, reason: "" })),
    ).toMatch(/3 follow-up/i);
  });
});
