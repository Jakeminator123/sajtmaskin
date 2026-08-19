import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  groupCostUsd,
  priceUsageRow,
  resolveCostBasis,
  resolveCostSource,
  sourceTableName,
} from "./generation-cost-price.mjs";

const pricing = JSON.parse(
  readFileSync(join(process.cwd(), "config/ai_models/pricing.json"), "utf8"),
);

describe("generation-cost source routing", () => {
  it("defaults unknown values to llm_usage", () => {
    expect(resolveCostSource(undefined)).toBe("usage");
    expect(resolveCostSource("llm_usage")).toBe("usage");
    expect(sourceTableName("usage")).toBe("llm_usage");
  });

  it("keeps the older codegen tables as explicit fallbacks", () => {
    expect(resolveCostSource("logs")).toBe("logs");
    expect(resolveCostSource("engine_generation_logs")).toBe("logs");
    expect(resolveCostSource("telemetry")).toBe("telemetry");
    expect(sourceTableName("logs")).toBe("engine_generation_logs");
    expect(sourceTableName("telemetry")).toBe("generation_telemetry");
  });
});

describe("generation-cost pricing matches billing model-cost", () => {
  it("prices cache read/write cheaper than uncached input", () => {
    const priced = priceUsageRow(pricing, {
      model: "gpt-5.6-sol",
      inputTokens: 100_000,
      cachedInputTokens: 20_000,
      cacheWriteTokens: 10_000,
      outputTokens: 10_000,
    });

    expect(priced.priced).toBe(true);
    expect(priced.uncachedInputTokens).toBe(70_000);
    expect(priced.totalUsd).toBeCloseTo(0.7225, 6);
  });

  it("does not apply long-context uplift on aggregated volumes", () => {
    const perCall = priceUsageRow(pricing, {
      model: "gpt-5.6-terra",
      inputTokens: 300_000,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 100_000,
    });
    const aggregated = priceUsageRow(
      pricing,
      {
        model: "gpt-5.6-terra",
        inputTokens: 300_000,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 100_000,
      },
      "standard",
      { applyLongContext: false },
    );

    expect(perCall.longContext).toBe(true);
    expect(aggregated.longContext).toBe(false);
    expect(aggregated.totalUsd).toBeLessThan(perCall.totalUsd);
  });

  it("stays in ledger mode when the only unledgered calls are tokenless", () => {
    // llm_usage lagrar avbrutna/misslyckade anrop med null-ledger by design.
    // Räknades de som otäckta skulle ledger-läget aldrig kunna nås, och hela
    // fixen vore verkningslös.
    const basis = resolveCostBasis([
      { rows: 10, ledgerRows: 7, unledgeredBillableRows: 0, ledgerUsd: 4.0, pricedUsd: 3.0 },
    ]);

    expect(basis.basis).toBe("ledger");
    expect(basis.totalUsd).toBeCloseTo(4.0, 6);
    expect(basis.rowsWithoutLedger).toBe(3);
    expect(basis.unledgeredBillableRows).toBe(0);
  });

  it("drops out of ledger mode as soon as a call with tokens lacks one", () => {
    const basis = resolveCostBasis([
      { rows: 10, ledgerRows: 7, unledgeredBillableRows: 2, ledgerUsd: 4.0, pricedUsd: 3.0 },
    ]);

    expect(basis.basis).toBe("partial");
    expect(basis.totalUsd).toBeCloseTo(3.0, 6);
  });

  it("makes the ledger the headline total when every call carries one", () => {
    const basis = resolveCostBasis([
      { rows: 4, ledgerRows: 4, unledgeredBillableRows: 0, ledgerUsd: 3.5, pricedUsd: 2.0 },
      { rows: 6, ledgerRows: 6, unledgeredBillableRows: 0, ledgerUsd: 1.25, pricedUsd: 1.1 },
    ]);

    expect(basis.basis).toBe("ledger");
    // Hela poängen: rubriken ÄR ledgersumman, inte token-uppskattningen som
    // strukturellt missar long-context.
    expect(basis.totalUsd).toBeCloseTo(4.75, 6);
    expect(basis.estimateUsd).toBeCloseTo(3.1, 6);
    expect(basis.rowsWithoutLedger).toBe(0);
  });

  it("stays an honest estimate when the ledger only covers some calls", () => {
    // Ingen blandning: en delvis täckt period är en uppskattning rakt igenom,
    // med ledgersumman redovisad bredvid. Att fylla ut de otäckta anropen pro
    // rata vore inte invariant under gruppering.
    const basis = resolveCostBasis([
      { rows: 4, ledgerRows: 2, unledgeredBillableRows: 2, ledgerUsd: 2.0, pricedUsd: 1.6 },
    ]);

    expect(basis.basis).toBe("partial");
    expect(basis.totalUsd).toBeCloseTo(1.6, 6);
    expect(basis.ledgerUsd).toBeCloseTo(2.0, 6);
    expect(basis.rowsWithoutLedger).toBe(2);
  });

  it("keeps the estimate as the total when no call has a ledger value", () => {
    const basis = resolveCostBasis([
      { rows: 3, ledgerRows: 0, unledgeredBillableRows: 3, ledgerUsd: 0, pricedUsd: 0.9 },
    ]);

    expect(basis.basis).toBe("estimate");
    expect(basis.totalUsd).toBeCloseTo(0.9, 6);
  });

  it("never counts more ledger rows than calls", () => {
    const basis = resolveCostBasis([
      { rows: 2, ledgerRows: 99, unledgeredBillableRows: 0, ledgerUsd: 1, pricedUsd: 1 },
    ]);

    expect(basis.ledgerRows).toBe(2);
    expect(basis.rowsWithoutLedger).toBe(0);
    expect(basis.basis).toBe("ledger");
  });

  it("gives the same total no matter how the calls are partitioned", () => {
    // Regressionslåset. Rubriken grupperar per modell+fas över hela fönstret,
    // dagstabellen per dag+modell+fas. Med en enda bas och ren summering ger
    // båda partitionerna samma tal — det gjorde den tidigare pro-ratan inte.
    const fine = [
      { rows: 2, ledgerRows: 2, unledgeredBillableRows: 0, ledgerUsd: 5, pricedUsd: 10 },
      { rows: 2, ledgerRows: 2, unledgeredBillableRows: 0, ledgerUsd: 1, pricedUsd: 2 },
    ];
    const coarse = [
      { rows: 4, ledgerRows: 4, unledgeredBillableRows: 0, ledgerUsd: 6, pricedUsd: 12 },
    ];
    const basis = resolveCostBasis(coarse).basis;

    expect(resolveCostBasis(fine).totalUsd).toBeCloseTo(resolveCostBasis(coarse).totalUsd, 6);
    expect(fine.reduce((sum, g) => sum + groupCostUsd(g, basis), 0)).toBeCloseTo(6, 6);
  });

  it("groupCostUsd follows the report-wide basis, not the group's own coverage", () => {
    const covered = { rows: 2, ledgerRows: 2, ledgerUsd: 5, pricedUsd: 10 };

    expect(groupCostUsd(covered, "ledger")).toBeCloseTo(5, 6);
    expect(groupCostUsd(covered, "partial")).toBeCloseTo(10, 6);
    expect(groupCostUsd(covered, "estimate")).toBeCloseTo(10, 6);
  });

  it("handles an empty period without producing NaN", () => {
    const basis = resolveCostBasis([]);

    expect(basis.basis).toBe("estimate");
    expect(basis.totalUsd).toBe(0);
    expect(basis.rows).toBe(0);
  });

  it("does not treat the whole input as uncached", () => {
    const naive = priceUsageRow(pricing, {
      model: "gpt-5.6-sol",
      inputTokens: 100_000,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 10_000,
    });
    const withCache = priceUsageRow(pricing, {
      model: "gpt-5.6-sol",
      inputTokens: 100_000,
      cachedInputTokens: 20_000,
      cacheWriteTokens: 10_000,
      outputTokens: 10_000,
    });

    expect(withCache.totalUsd).toBeLessThan(naive.totalUsd);
  });
});
