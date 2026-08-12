import { afterEach, describe, expect, it } from "vitest";

import {
  CONTENT_REVISION_GATE_ENV_KEY,
  classifyRevisionMatch,
  isContentRevisionGateEnabled,
  isKnownRevisionMismatch,
  shortRevision,
} from "./content-revision";

const REVISION_A = "a".repeat(32);
const REVISION_B = "b".repeat(32);

afterEach(() => {
  delete process.env[CONTENT_REVISION_GATE_ENV_KEY];
});

describe("isContentRevisionGateEnabled", () => {
  it("är av som default — att släppa flaggan är ett ägarbeslut", () => {
    expect(isContentRevisionGateEnabled()).toBe(false);
  });

  it("kräver exakt 'true' (en halvsatt flagga slår inte på jämförelsen)", () => {
    for (const value of ["", "1", "yes", "on", "false", "TRUE"]) {
      process.env[CONTENT_REVISION_GATE_ENV_KEY] = value;
      expect(isContentRevisionGateEnabled()).toBe(false);
    }
    process.env[CONTENT_REVISION_GATE_ENV_KEY] = " true ";
    expect(isContentRevisionGateEnabled()).toBe(true);
  });
});

describe("classifyRevisionMatch", () => {
  it("lika revisioner är svaret på frågan", () => {
    expect(classifyRevisionMatch(REVISION_A, REVISION_A)).toBe("current");
  });

  it("olika KÄNDA revisioner är mismatch — symmetriskt, oavsett riktning", () => {
    expect(classifyRevisionMatch(REVISION_A, REVISION_B)).toBe("stale");
    expect(classifyRevisionMatch(REVISION_B, REVISION_A)).toBe("stale");
  });

  it("saknad revision på någon sida är okänd, aldrig mismatch (beslut 1b)", () => {
    for (const missing of [null, undefined, "", "   "]) {
      expect(classifyRevisionMatch(missing, REVISION_A)).toBe("unknown");
      expect(classifyRevisionMatch(REVISION_A, missing)).toBe("unknown");
    }
    expect(classifyRevisionMatch(null, null)).toBe("unknown");
  });

  it("isKnownRevisionMismatch är sann bara för det blockerande läget", () => {
    expect(isKnownRevisionMismatch(REVISION_A, REVISION_B)).toBe(true);
    expect(isKnownRevisionMismatch(REVISION_A, REVISION_A)).toBe(false);
    expect(isKnownRevisionMismatch(null, REVISION_A)).toBe(false);
  });
});

describe("shortRevision", () => {
  it("kortar till läsbart prefix och säger 'okänd' när revisionen saknas", () => {
    expect(shortRevision(REVISION_A)).toBe("aaaaaaaa");
    expect(shortRevision(null)).toBe("okänd");
    expect(shortRevision("  ")).toBe("okänd");
  });
});
