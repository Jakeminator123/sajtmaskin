import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
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

  it("makes the ledger the headline total when every call carries one", () => {
    const basis = resolveCostBasis([
      { rows: 4, ledgerRows: 4, ledgerUsd: 3.5, pricedUsd: 2.0 },
      { rows: 6, ledgerRows: 6, ledgerUsd: 1.25, pricedUsd: 1.1 },
    ]);

    expect(basis.basis).toBe("ledger");
    // Detta är hela poängen: rubriksiffran ÄR ledgersumman, inte
    // token-uppskattningen som strukturellt missar long-context.
    expect(basis.totalUsd).toBeCloseTo(4.75, 6);
    expect(basis.ledgerUsd).toBeCloseTo(4.75, 6);
    expect(basis.estimateUsd).toBeCloseTo(3.1, 6);
    expect(basis.rowsWithoutLedger).toBe(0);
  });

  it("falls back to the token estimate only for calls without a ledger value", () => {
    const basis = resolveCostBasis([{ rows: 4, ledgerRows: 2, ledgerUsd: 2.0, pricedUsd: 1.6 }]);

    expect(basis.basis).toBe("mixed");
    expect(basis.rowsWithoutLedger).toBe(2);
    // Halva gruppen saknar ledger → halva uppskattningen läggs på.
    expect(basis.totalUsd).toBeCloseTo(2.8, 6);
  });

  it("keeps the estimate as the total when no call has a ledger value", () => {
    const basis = resolveCostBasis([{ rows: 3, ledgerRows: 0, ledgerUsd: 0, pricedUsd: 0.9 }]);

    expect(basis.basis).toBe("estimate");
    expect(basis.totalUsd).toBeCloseTo(0.9, 6);
  });

  it("never counts more ledger rows than calls", () => {
    const basis = resolveCostBasis([{ rows: 2, ledgerRows: 99, ledgerUsd: 1, pricedUsd: 1 }]);

    expect(basis.ledgerRows).toBe(2);
    expect(basis.rowsWithoutLedger).toBe(0);
    expect(basis.basis).toBe("ledger");
  });

  it("keeps per-group totals summing to the aggregate", () => {
    // Modell-, fas- och dagstabellerna kör resolveCostBasis per grupp medan
    // rubriken kör den över alla. Går de isär visar vyn fyra siffror igen.
    const groups = [
      { rows: 4, ledgerRows: 4, ledgerUsd: 3.5, pricedUsd: 2.0 },
      { rows: 4, ledgerRows: 2, ledgerUsd: 2.0, pricedUsd: 1.6 },
      { rows: 3, ledgerRows: 0, ledgerUsd: 0, pricedUsd: 0.9 },
    ];
    const perGroup = groups.reduce((sum, g) => sum + resolveCostBasis([g]).totalUsd, 0);

    expect(resolveCostBasis(groups).totalUsd).toBeCloseTo(perGroup, 6);
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
