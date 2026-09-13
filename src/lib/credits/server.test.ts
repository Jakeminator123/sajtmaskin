import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const createTransaction = vi.hoisted(() => vi.fn());
const getTransactionByIdempotency = vi.hoisted(() => vi.fn());
const isTestUser = vi.hoisted(() => vi.fn(() => false));
const resolvePricingSettings = vi.hoisted(() =>
  vi.fn(async () => ({ creditActionPrices: {} as Record<string, unknown> })),
);

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/db/services/transactions", () => ({
  createTransaction,
  getTransactionByIdempotency,
}));
vi.mock("@/lib/db/services/users", () => ({ isTestUser }));
vi.mock("@/lib/db/services/pricing-settings", () => ({ resolvePricingSettings }));

const { prepareCredits, remainingCreditsAfterCharge } = await import("./server");

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: "user_1",
    email: "user@example.com",
    diamonds: 0,
    free_generation_available: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  isTestUser.mockReturnValue(false);
  getTransactionByIdempotency.mockResolvedValue(null);
  resolvePricingSettings.mockResolvedValue({ creditActionPrices: {} });
});

describe("prepareCredits account-bound free generation", () => {
  it("requires an account for generation", async () => {
    getCurrentUser.mockResolvedValue(null);
    const prepared = await prepareCredits(new Request("https://example.test"), "prompt.create");
    expect(prepared.ok).toBe(false);
    if (!prepared.ok) expect(prepared.response.status).toBe(401);
  });

  it("allows the entitlement only on a version-settled generation path", async () => {
    getCurrentUser.mockResolvedValue(account());
    const prepared = await prepareCredits(
      new Request("https://example.test"),
      "prompt.create",
      {},
      { allowFreeGeneration: true },
    );

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.usingFreeGeneration).toBe(true);
    await prepared.commit();
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("does not turn template imports into unlimited free generations", async () => {
    getCurrentUser.mockResolvedValue(account());
    const prepared = await prepareCredits(
      new Request("https://example.test"),
      "prompt.template",
      {},
      { allowFreeGeneration: true },
    );
    expect(prepared.ok).toBe(false);
    if (!prepared.ok) expect(prepared.response.status).toBe(402);
  });

  it("does not use the entitlement when the caller did not opt into settlement", async () => {
    getCurrentUser.mockResolvedValue(account());
    const prepared = await prepareCredits(new Request("https://example.test"), "prompt.create");
    expect(prepared.ok).toBe(false);
    if (!prepared.ok) expect(prepared.response.status).toBe(402);
  });
});


describe("prepareCredits durable entitlement helper (B1 ledger)", () => {
  it("passes the durable key to the atomic debit", async () => {
    getCurrentUser.mockResolvedValue(account({ diamonds: 22, free_generation_available: false }));
    const prepared = await prepareCredits(
      new Request("https://example.test"),
      "wizard.enrich",
      {},
      { idempotencyKey: "11111111-1111-4111-8111-111111111111" },
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    await prepared.commit();
    expect(createTransaction).toHaveBeenCalledWith(
      "user_1", "wizard_enrich", -11, "Wizard-analys", undefined, undefined,
      { idempotencyKey: "11111111-1111-4111-8111-111111111111" },
    );
  });

  it("allows a retry with no remaining balance when the key is already entitled", async () => {
    getCurrentUser.mockResolvedValue(account({ diamonds: 0, free_generation_available: false }));
    getTransactionByIdempotency.mockResolvedValue({
      id: "tx_1",
      user_id: "user_1",
      type: "wizard_enrich",
      idempotency_key: "11111111-1111-4111-8111-111111111111",
    });
    const prepared = await prepareCredits(
      new Request("https://example.test"),
      "wizard.enrich",
      {},
      { idempotencyKey: "11111111-1111-4111-8111-111111111111" },
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.usingExistingEntitlement).toBe(true);
    await prepared.commit();
    expect(createTransaction).not.toHaveBeenCalled();
  });
});

describe("prepareCredits reads the operator-set price", () => {
  it("charges the price from pricing_settings, not the constant", async () => {
    resolvePricingSettings.mockResolvedValue({ creditActionPrices: { wizard: 19 } });
    getCurrentUser.mockResolvedValue(account({ diamonds: 22, free_generation_available: false }));

    const prepared = await prepareCredits(new Request("https://example.test"), "wizard.enrich");

    expect(prepared.cost).toBe(19);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    await prepared.commit();
    expect(createTransaction).toHaveBeenCalledWith(
      "user_1", "wizard_enrich", -19, "Wizard-analys", undefined, undefined,
      { idempotencyKey: undefined },
    );
  });

  it("keeps the gate working when the price row cannot be read", async () => {
    // resolvePricingSettings degrades to defaults rather than throwing; the
    // gate must still produce today's price instead of failing the request.
    resolvePricingSettings.mockResolvedValue({ creditActionPrices: {} });
    getCurrentUser.mockResolvedValue(account({ diamonds: 22, free_generation_available: false }));

    const prepared = await prepareCredits(new Request("https://example.test"), "wizard.enrich");

    expect(prepared.cost).toBe(11);
  });
});

describe("remainingCreditsAfterCharge", () => {
  it("follows the server charge, not a stale client price", () => {
    const clientGuess = 30 - 15;
    const remaining = remainingCreditsAfterCharge({
      diamonds: 30,
      cost: 25,
      charged: true,
    });
    expect(remaining).toBe(5);
    expect(remaining).not.toBe(clientGuess);
  });

  it("leaves the balance unchanged when the charge was skipped", () => {
    expect(
      remainingCreditsAfterCharge({ diamonds: 30, cost: 25, charged: false }),
    ).toBe(30);
  });
});
