import { describe, expect, it } from "vitest";
import {
  MAX_CONTRACT_CLARIFICATION_ROUNDS,
  resolveClarificationCapMaxOutputTokens,
  shouldOfferContractClarification,
  shouldUseClarificationCapBuild,
} from "./contract-clarification-policy";

describe("shouldOfferContractClarification", () => {
  it("allows up to MAX-1 answered rounds before blocking new questions", () => {
    expect(shouldOfferContractClarification(true, 0)).toBe(true);
    expect(shouldOfferContractClarification(true, MAX_CONTRACT_CLARIFICATION_ROUNDS - 1)).toBe(
      true,
    );
    expect(shouldOfferContractClarification(true, MAX_CONTRACT_CLARIFICATION_ROUNDS)).toBe(false);
  });

  it("never offers when there is no question", () => {
    expect(shouldOfferContractClarification(false, 0)).toBe(false);
  });
});

describe("shouldUseClarificationCapBuild", () => {
  it("triggers at MAX confirmed answers", () => {
    expect(shouldUseClarificationCapBuild(MAX_CONTRACT_CLARIFICATION_ROUNDS - 1)).toBe(false);
    expect(shouldUseClarificationCapBuild(MAX_CONTRACT_CLARIFICATION_ROUNDS)).toBe(true);
  });
});

describe("resolveClarificationCapMaxOutputTokens", () => {
  it("returns a positive floor", () => {
    const n = resolveClarificationCapMaxOutputTokens("max");
    expect(n).toBeGreaterThanOrEqual(8_192);
  });
});
