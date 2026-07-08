import { describe, expect, it } from "vitest";
import { CREDIT_COST_BREAKDOWN, getCreditCost } from "./pricing";

describe("CREDIT_COST_BREAKDOWN (pricing UI single source)", () => {
  it("matches getCreditCost for every displayed row", () => {
    expect(CREDIT_COST_BREAKDOWN.generateMini).toBe(
      getCreditCost("prompt.create", { modelId: "fast" }),
    );
    expect(CREDIT_COST_BREAKDOWN.generatePro).toBe(
      getCreditCost("prompt.create", { modelId: "pro" }),
    );
    expect(CREDIT_COST_BREAKDOWN.generateMax).toBe(
      getCreditCost("prompt.create", { modelId: "max" }),
    );
    expect(CREDIT_COST_BREAKDOWN.refineMini).toBe(
      getCreditCost("prompt.refine", { modelId: "fast" }),
    );
    expect(CREDIT_COST_BREAKDOWN.refinePro).toBe(
      getCreditCost("prompt.refine", { modelId: "pro" }),
    );
    expect(CREDIT_COST_BREAKDOWN.refineMax).toBe(
      getCreditCost("prompt.refine", { modelId: "max" }),
    );
    expect(CREDIT_COST_BREAKDOWN.wizard).toBe(getCreditCost("wizard.enrich"));
    expect(CREDIT_COST_BREAKDOWN.auditBasic).toBe(getCreditCost("audit.basic"));
    expect(CREDIT_COST_BREAKDOWN.auditAdvanced).toBe(getCreditCost("audit.advanced"));
    expect(CREDIT_COST_BREAKDOWN.deploy).toBe(getCreditCost("deploy.production"));
  });

  it("locks the corrected generate/refine Mini costs (regression: UI hardcoded stale 5/3)", () => {
    expect(CREDIT_COST_BREAKDOWN.generateMini).toBe(10);
    expect(CREDIT_COST_BREAKDOWN.refineMini).toBe(6);
    expect(CREDIT_COST_BREAKDOWN.generateMini).not.toBe(5);
    expect(CREDIT_COST_BREAKDOWN.refineMini).not.toBe(3);
  });
});
