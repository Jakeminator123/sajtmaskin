import { describe, expect, it, vi } from "vitest";
import { calculateModelCost } from "@/lib/billing/model-cost";

vi.mock("@/lib/db/client", () => ({ db: {}, dbConfigured: true }));

const { buildGenerationQuote, resolveGenerationChargeDecision } =
  await import("./generation-billing");

function usageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "usage_1",
    run_id: null,
    chat_id: "chat_1",
    version_id: "version_1",
    user_id: "user_1",
    session_id: null,
    phase: "codegen",
    workload: null,
    provider: "openai",
    model: "gpt-5.6-luna",
    model_tier: null,
    input_tokens: 1_000,
    cached_input_tokens: 0,
    cache_write_tokens: 0,
    output_tokens: 100,
    reasoning_tokens: 0,
    cost_microusd: null,
    pricing_version: null,
    cost_breakdown: null,
    duration_ms: null,
    ok: true,
    error_code: null,
    meta: null,
    created_at: new Date("2026-08-12T10:00:00.000Z"),
    ...overrides,
  };
}

describe("buildGenerationQuote", () => {
  it("uses the immutable per-call cost snapshot when present", () => {
    const frozen = calculateModelCost("gpt-5.6-luna", {
      inputTokens: 1_000,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 100,
    });
    const quote = buildGenerationQuote([
      usageRow({
        cost_microusd: 123,
        pricing_version: "frozen-v1",
        cost_breakdown: { ...frozen, priceVersion: "frozen-v1" },
      }) as never,
    ]);

    expect(quote.providerCostMicroUsd).toBe(123);
    expect(quote.pricingVersions).toEqual(["frozen-v1"]);
    expect(quote.breakdown[0]?.costUsd).toBe(0.000123);
  });

  it("flags incomplete and unknown-model usage for reconciliation", () => {
    const quote = buildGenerationQuote([
      usageRow({
        id: "incomplete",
        input_tokens: null,
        cached_input_tokens: null,
        cache_write_tokens: null,
        output_tokens: null,
        reasoning_tokens: null,
      }) as never,
      usageRow({ id: "unknown", model: "provider-model-without-price" }) as never,
    ]);

    expect(quote.incompleteUsageIds).toEqual(["incomplete"]);
    expect(quote.unpricedModels).toEqual(["provider-model-without-price"]);
  });

  it("surfaces estimated price models in the quote", () => {
    const quote = buildGenerationQuote([usageRow({ model: "gpt-5.3-codex" }) as never]);
    expect(quote.estimatedModels).toEqual(["gpt-5.3-codex"]);
  });
});

function decisionFromQuote(
  rows: Array<ReturnType<typeof usageRow>>,
  overrides: Partial<Parameters<typeof resolveGenerationChargeDecision>[0]> = {},
) {
  const quote = buildGenerationQuote(rows as never);
  return {
    quote,
    decision: resolveGenerationChargeDecision({
      hasOwner: true,
      ownerIsTest: false,
      hasCompletePrice:
        quote.llmCalls > 0 &&
        quote.unpricedModels.length === 0 &&
        quote.incompleteUsageIds.length === 0,
      hasEstimatedPrice: quote.estimatedModels.length > 0,
      llmCalls: quote.llmCalls,
      hasIncompleteUsage: quote.incompleteUsageIds.length > 0,
      calculatedCredits: 7,
      lockedCredits: 0,
      existingFreeGenerationApplied: false,
      freeGenerationEligible: true,
      freeGenerationAvailable: false,
      ...overrides,
    }),
  };
}

const failedTokenlessRow = () =>
  usageRow({
    id: "failed-brief",
    phase: "brief",
    ok: false,
    error_code: "provider_timeout",
    input_tokens: null,
    cached_input_tokens: null,
    cache_write_tokens: null,
    output_tokens: null,
    reasoning_tokens: null,
    cost_microusd: null,
    cost_breakdown: null,
  });

const pendingUsageRow = () =>
  usageRow({
    id: "pending-usage",
    ok: true,
    input_tokens: null,
    cached_input_tokens: null,
    cache_write_tokens: null,
    output_tokens: null,
    reasoning_tokens: null,
  });

describe("settlement snapshot with failed or pending usage", () => {
  it("charges the priced amount when a failed tokenless row sits beside a priced call", () => {
    const priced = usageRow({ id: "priced-codegen" });
    const { quote, decision } = decisionFromQuote([failedTokenlessRow(), priced]);
    const pricedOnly = buildGenerationQuote([priced as never]);

    expect(quote.incompleteUsageIds).toEqual([]);
    expect(quote.providerCostMicroUsd).toBe(pricedOnly.providerCostMicroUsd);
    expect(quote.providerCostMicroUsd).toBeGreaterThan(0);
    expect(decision).toMatchObject({
      desiredCredits: 7,
      status: "charged",
      freeGenerationApplied: false,
    });
  });

  it("still settles as usage_incomplete when a succeeded row has no tokens yet", () => {
    const { quote, decision } = decisionFromQuote([
      pendingUsageRow(),
      usageRow({ id: "priced-codegen" }),
    ]);

    expect(quote.incompleteUsageIds).toEqual(["pending-usage"]);
    expect(decision).toMatchObject({
      desiredCredits: 0,
      status: "usage_incomplete",
      freeGenerationApplied: false,
    });
  });

  it("still applies the free entitlement when a failed tokenless row is present", () => {
    const { quote, decision } = decisionFromQuote(
      [failedTokenlessRow(), usageRow({ id: "priced-codegen" })],
      { freeGenerationAvailable: true, calculatedCredits: 7 },
    );

    expect(quote.incompleteUsageIds).toEqual([]);
    expect(decision).toMatchObject({
      desiredCredits: 0,
      status: "free_generation",
      freeGenerationApplied: true,
      shouldClaimFreeGeneration: true,
    });
  });
});

describe("resolveGenerationChargeDecision", () => {
  const complete = {
    hasOwner: true,
    ownerIsTest: false,
    hasCompletePrice: true,
    hasEstimatedPrice: false,
    llmCalls: 2,
    hasIncompleteUsage: false,
    calculatedCredits: 7,
    lockedCredits: 0,
    existingFreeGenerationApplied: false,
    freeGenerationEligible: true,
    freeGenerationAvailable: true,
  };

  it("claims exactly one account-bound generation without debiting credits", () => {
    expect(resolveGenerationChargeDecision(complete)).toMatchObject({
      desiredCredits: 0,
      status: "free_generation",
      freeGenerationApplied: true,
      shouldClaimFreeGeneration: true,
    });
  });

  it("keeps repeated settlement of the free version idempotently free", () => {
    expect(
      resolveGenerationChargeDecision({
        ...complete,
        existingFreeGenerationApplied: true,
        freeGenerationAvailable: false,
      }),
    ).toMatchObject({
      desiredCredits: 0,
      status: "free_generation",
      shouldClaimFreeGeneration: false,
    });
  });

  it("debits the next version after the entitlement has been consumed", () => {
    expect(
      resolveGenerationChargeDecision({ ...complete, freeGenerationAvailable: false }),
    ).toMatchObject({
      desiredCredits: 7,
      status: "charged",
      freeGenerationApplied: false,
    });
  });

  it("never claims the free site generation for a post-processing-only marker", () => {
    expect(
      resolveGenerationChargeDecision({
        ...complete,
        freeGenerationEligible: false,
      }),
    ).toMatchObject({
      desiredCredits: 7,
      status: "charged",
      freeGenerationApplied: false,
      shouldClaimFreeGeneration: false,
    });
  });

  it.each([
    {
      label: "no usage",
      input: { hasCompletePrice: false, llmCalls: 0, hasIncompleteUsage: false },
      status: "no_usage",
    },
    {
      label: "incomplete usage",
      input: { hasCompletePrice: false, llmCalls: 1, hasIncompleteUsage: true },
      status: "usage_incomplete",
    },
    {
      label: "unpriced usage",
      input: { hasCompletePrice: false, llmCalls: 1, hasIncompleteUsage: false },
      status: "unpriced",
    },
  ])("claims the entitlement without hiding $label reconciliation state", ({ input, status }) => {
    expect(
      resolveGenerationChargeDecision({
        ...complete,
        ...input,
      }),
    ).toMatchObject({
      desiredCredits: 0,
      status,
      freeGenerationApplied: true,
      shouldClaimFreeGeneration: true,
    });
  });

  it("keeps incomplete reconciliation status even on an already-free version", () => {
    expect(
      resolveGenerationChargeDecision({
        ...complete,
        hasCompletePrice: false,
        llmCalls: 1,
        hasIncompleteUsage: true,
        lockedCredits: 3,
        existingFreeGenerationApplied: true,
        freeGenerationAvailable: false,
      }),
    ).toMatchObject({
      desiredCredits: 0,
      status: "needs_reconciliation",
      freeGenerationApplied: true,
      shouldClaimFreeGeneration: false,
    });
  });
});
