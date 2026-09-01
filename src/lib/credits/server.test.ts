import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const createTransaction = vi.hoisted(() => vi.fn());
const getTransactionByIdempotency = vi.hoisted(() => vi.fn());
const isTestUser = vi.hoisted(() => vi.fn(() => false));

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/db/services/transactions", () => ({
  createTransaction,
  getTransactionByIdempotency,
}));
vi.mock("@/lib/db/services/users", () => ({ isTestUser }));

const { prepareCredits } = await import("./server");

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


describe("prepareCredits wizard-run entitlement (B1)", () => {
  it("passes the durable key to the atomic debit", async () => {
    getCurrentUser.mockResolvedValue(account({ diamonds: 22, free_generation_available: false }));
    const prepared = await prepareCredits(
      new Request("https://example.test"),
      "wizard.enrich",
      {},
      { idempotencyKey: "wizard:run-1" },
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    await prepared.commit();
    expect(createTransaction).toHaveBeenCalledWith(
      "user_1", "wizard_enrich", -11, "Wizard-analys", undefined, undefined,
      { idempotencyKey: "wizard:run-1" },
    );
  });

  it("allows a retry with no remaining balance when the run is already entitled", async () => {
    getCurrentUser.mockResolvedValue(account({ diamonds: 0, free_generation_available: false }));
    getTransactionByIdempotency.mockResolvedValue({
      id: "tx_1",
      user_id: "user_1",
      type: "wizard_enrich",
      idempotency_key: "wizard:run-1",
    });
    const prepared = await prepareCredits(
      new Request("https://example.test"),
      "wizard.enrich",
      {},
      { idempotencyKey: "wizard:run-1" },
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.usingExistingEntitlement).toBe(true);
    await prepared.commit();
    expect(createTransaction).not.toHaveBeenCalled();
  });
});
