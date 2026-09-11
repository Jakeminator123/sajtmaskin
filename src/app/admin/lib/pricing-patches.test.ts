import { describe, expect, it } from "vitest";
import { scalarCreditPatch, tierCreditPatch } from "./pricing-patches";

describe("pricing patches", () => {
  it("sends only the scalar field the operator touched", () => {
    expect(scalarCreditPatch("wizard", 14)).toEqual({ wizard: 14 });
    expect(scalarCreditPatch("auditBasic", null)).toEqual({ auditBasic: null });
    expect(Object.keys(scalarCreditPatch("deployProduction", 25))).toEqual(["deployProduction"]);
  });

  it("sends only the model tier the operator touched", () => {
    expect(tierCreditPatch("promptCreate", "premium", 14)).toEqual({
      promptCreate: { premium: 14 },
    });
    expect(tierCreditPatch("promptRefine", "pro", null)).toEqual({
      promptRefine: { pro: null },
    });
  });
});
