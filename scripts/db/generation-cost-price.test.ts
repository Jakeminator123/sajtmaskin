import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  priceUsageRow,
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
