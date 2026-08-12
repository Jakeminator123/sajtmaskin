import { describe, expect, it } from "vitest";
import { calculateCustomerCharge, calculateModelCost, resolvePriceModel } from "./model-cost";

describe("model-cost", () => {
  it("matches provider-prefixed and dated model ids", () => {
    expect(resolvePriceModel("openai/gpt-5.6-sol")?.key).toBe("gpt-5.6-sol");
    expect(resolvePriceModel("anthropic-direct/claude-haiku-4-5-20251001")?.key).toBe(
      "claude-haiku-4-5",
    );
  });

  it("prices uncached, cache-read, cache-write and output tokens separately", () => {
    const cost = calculateModelCost("gpt-5.6-sol", {
      inputTokens: 100_000,
      cachedInputTokens: 20_000,
      cacheWriteTokens: 10_000,
      outputTokens: 10_000,
    });

    expect(cost).not.toBeNull();
    // 70k*$5 + 20k*$0.5 + 10k*$6.25 + 10k*$30 = $0.7225
    expect(cost?.costUsd).toBeCloseTo(0.7225, 6);
    expect(cost?.uncachedInputTokens).toBe(70_000);
  });

  it("applies the GPT-5.6 long-context uplift to the whole request", () => {
    const cost = calculateModelCost("gpt-5.6-terra", {
      inputTokens: 300_000,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 100_000,
    });
    expect(cost?.longContext).toBe(true);
    expect(cost?.costUsd).toBeCloseTo(3.75, 6);
  });

  it("does not double-count Anthropic cache counters already included in SDK input", () => {
    const cost = calculateModelCost("claude-haiku-4-5", {
      inputTokens: 70_000,
      cachedInputTokens: 20_000,
      cacheWriteTokens: 10_000,
      outputTokens: 10_000,
    });

    expect(cost?.inputSemantics).toBe("total_includes_cache");
    expect(cost?.uncachedInputTokens).toBe(40_000);
    // 40k*$1 + 20k*$0.1 + 10k*$1.25 + 10k*$5 = $0.1045
    expect(cost?.costUsd).toBeCloseTo(0.1045, 6);
  });

  it("turns provider cost into whole credits with markup", () => {
    expect(
      calculateCustomerCharge({
        providerCostMicroUsd: 1_428_571,
        usdToSekOre: 1_050,
        markupBasisPoints: 28_000,
        sekPerCreditOre: 300,
      }),
    ).toEqual({ providerCostOre: 1500, billableOre: 4200, credits: 14 });
  });
});
