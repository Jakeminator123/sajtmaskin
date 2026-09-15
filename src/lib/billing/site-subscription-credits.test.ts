import { beforeEach, describe, expect, it, vi } from "vitest";

const getPeriodGrant = vi.hoisted(() => vi.fn());
const insertPeriodGrant = vi.hoisted(() => vi.fn());
const updatePeriodGrant = vi.hoisted(() => vi.fn());
const createTransaction = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/site-subscriptions", () => ({
  getPeriodGrant,
  insertPeriodGrant,
  updatePeriodGrant,
}));

vi.mock("@/lib/db/services/transactions", () => ({
  createTransaction,
}));

const { grantSiteSubscriptionPeriodCredits, siteSubscriptionPeriodLedgerKey } = await import(
  "./site-subscription-credits"
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("grantSiteSubscriptionPeriodCredits", () => {
  it("simulerar testgrants utan att röra ledgern", async () => {
    getPeriodGrant.mockResolvedValue(null);
    insertPeriodGrant.mockResolvedValue({ id: "g1", status: "simulated" });

    const result = await grantSiteSubscriptionPeriodCredits({
      subscriptionId: "sub_1",
      userId: "user_1",
      billingMode: "test",
      periodId: "p1726401600",
      periodStart: new Date("2026-09-15T12:00:00.000Z"),
      periodEnd: new Date("2026-10-15T12:00:00.000Z"),
      billingReason: "subscription_cycle",
    });

    expect(result).toEqual({
      granted: true,
      status: "simulated",
      reason: "test_simulated",
    });
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("slutför en pending live-grant i stället för att kvittera den som redan given", async () => {
    getPeriodGrant.mockResolvedValue({
      id: "g_pending",
      subscription_id: "sub_1",
      user_id: "user_1",
      billing_mode: "live",
      period_id: "p1726401600",
      status: "pending",
      ledger_idempotency_key: "site_sub_period:live:sub_1:p1726401600",
    });
    createTransaction.mockResolvedValue({ id: "tx_1" });
    updatePeriodGrant.mockResolvedValue({ id: "g_pending", status: "granted" });

    const result = await grantSiteSubscriptionPeriodCredits({
      subscriptionId: "sub_1",
      userId: "user_1",
      billingMode: "live",
      periodId: "p1726401600",
      periodStart: new Date("2026-09-15T12:00:00.000Z"),
      periodEnd: new Date("2026-10-15T12:00:00.000Z"),
      billingReason: "subscription_create",
    });

    expect(result.reason).toBe("live_ledger");
    expect(createTransaction).toHaveBeenCalledWith(
      "user_1",
      "purchase",
      40,
      "Sajt-abonnemang: inkluderade credits",
      undefined,
      undefined,
      { idempotencyKey: "site_sub_period:live:sub_1:p1726401600" },
    );
    expect(insertPeriodGrant).not.toHaveBeenCalled();
  });

  it("bygger samma ledgernyckel som D1-schemat", () => {
    expect(siteSubscriptionPeriodLedgerKey("live", "sub_1", "p1726401600")).toBe(
      "site_sub_period:live:sub_1:p1726401600",
    );
  });
});
