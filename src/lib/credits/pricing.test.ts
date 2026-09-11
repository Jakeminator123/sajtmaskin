import { describe, expect, it } from "vitest";
import {
  CREDIT_COST_BREAKDOWN,
  DEFAULT_CREDIT_ACTION_PRICES,
  getCreditCost,
  type CreditPriceOverrides,
} from "./pricing";

describe("CREDIT_COST_BREAKDOWN (pricing UI single source)", () => {
  it("matches getCreditCost for every displayed row", () => {
    expect(CREDIT_COST_BREAKDOWN.generatePremium).toBe(
      getCreditCost("prompt.create", { modelId: "premium" }),
    );
    expect(CREDIT_COST_BREAKDOWN.generatePro).toBe(
      getCreditCost("prompt.create", { modelId: "pro" }),
    );
    expect(CREDIT_COST_BREAKDOWN.generateMax).toBe(
      getCreditCost("prompt.create", { modelId: "max" }),
    );
    expect(CREDIT_COST_BREAKDOWN.refinePremium).toBe(
      getCreditCost("prompt.refine", { modelId: "premium" }),
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

  it("locks the Premium generate/refine costs", () => {
    expect(CREDIT_COST_BREAKDOWN.generatePremium).toBe(10);
    expect(CREDIT_COST_BREAKDOWN.refinePremium).toBe(6);
  });
});

describe("DEFAULT_CREDIT_ACTION_PRICES (seed for pricing_settings)", () => {
  it("reproduces getCreditCost for every action with no overrides", () => {
    expect(DEFAULT_CREDIT_ACTION_PRICES.promptCreate.premium).toBe(
      getCreditCost("prompt.create", { modelId: "premium" }),
    );
    expect(DEFAULT_CREDIT_ACTION_PRICES.promptRefine.pro).toBe(
      getCreditCost("prompt.refine", { modelId: "pro" }),
    );
    expect(DEFAULT_CREDIT_ACTION_PRICES.wizard).toBe(getCreditCost("wizard.enrich"));
    expect(DEFAULT_CREDIT_ACTION_PRICES.auditBasic).toBe(getCreditCost("audit.basic"));
    expect(DEFAULT_CREDIT_ACTION_PRICES.auditAdvanced).toBe(getCreditCost("audit.advanced"));
    expect(DEFAULT_CREDIT_ACTION_PRICES.deployPreview).toBe(getCreditCost("deploy.preview"));
    expect(DEFAULT_CREDIT_ACTION_PRICES.deployProduction).toBe(getCreditCost("deploy.production"));
    expect(DEFAULT_CREDIT_ACTION_PRICES.openclawTip).toBe(getCreditCost("openclaw.tip"));
  });
});

describe("getCreditCost overrides", () => {
  it("lets an operator-set price win over the constant", () => {
    const overrides: CreditPriceOverrides = {
      promptCreate: { premium: 14 },
      promptRefine: { pro: 2 },
      wizard: 20,
      auditBasic: 0,
      deployProduction: 30,
      openclawTip: 5,
    };
    expect(getCreditCost("prompt.create", { modelId: "premium" }, overrides)).toBe(14);
    expect(getCreditCost("prompt.refine", { modelId: "pro" }, overrides)).toBe(2);
    expect(getCreditCost("wizard.enrich", {}, overrides)).toBe(20);
    expect(getCreditCost("audit.basic", {}, overrides)).toBe(0);
    expect(getCreditCost("deploy.production", {}, overrides)).toBe(30);
    expect(getCreditCost("openclaw.tip", {}, overrides)).toBe(5);
  });

  it("falls back per field, so a partial row cannot zero out untouched actions", () => {
    const overrides: CreditPriceOverrides = { promptCreate: { premium: 14 } };
    expect(getCreditCost("prompt.create", { modelId: "pro" }, overrides)).toBe(
      DEFAULT_CREDIT_ACTION_PRICES.promptCreate.pro,
    );
    expect(getCreditCost("audit.advanced", {}, overrides)).toBe(
      DEFAULT_CREDIT_ACTION_PRICES.auditAdvanced,
    );
    expect(getCreditCost("deploy.preview", {}, overrides)).toBe(
      DEFAULT_CREDIT_ACTION_PRICES.deployPreview,
    );
  });

  it("ignores a value that is not a non-negative integer", () => {
    // A charge must never be NaN, fractional or negative because a row was
    // edited badly — the constant is the safe answer.
    const broken = {
      wizard: Number.NaN,
      auditBasic: -5,
      auditAdvanced: 12.5,
      deployProduction: "20",
      promptCreate: { premium: null },
    } as unknown as CreditPriceOverrides;
    expect(getCreditCost("wizard.enrich", {}, broken)).toBe(DEFAULT_CREDIT_ACTION_PRICES.wizard);
    expect(getCreditCost("audit.basic", {}, broken)).toBe(DEFAULT_CREDIT_ACTION_PRICES.auditBasic);
    expect(getCreditCost("audit.advanced", {}, broken)).toBe(
      DEFAULT_CREDIT_ACTION_PRICES.auditAdvanced,
    );
    expect(getCreditCost("deploy.production", {}, broken)).toBe(
      DEFAULT_CREDIT_ACTION_PRICES.deployProduction,
    );
    expect(getCreditCost("prompt.create", { modelId: "premium" }, broken)).toBe(
      DEFAULT_CREDIT_ACTION_PRICES.promptCreate.premium,
    );
  });

  it("treats null/undefined overrides as the default price list", () => {
    expect(getCreditCost("wizard.enrich", {}, null)).toBe(DEFAULT_CREDIT_ACTION_PRICES.wizard);
    expect(getCreditCost("wizard.enrich", {}, undefined)).toBe(DEFAULT_CREDIT_ACTION_PRICES.wizard);
  });
});
