/**
 * Fulfilment: what happens to the customer's money when the registrar step
 * does not go to plan.
 *
 * Every test here is about an outcome that must NOT be possible — two
 * registrar orders for one payment, a charge with nothing delivered, a
 * purchase completed at a price the customer never approved.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const dbState = {
  claimSucceeds: true,
  claimThrows: false,
};

const calls = {
  register: vi.fn(),
  refundCreate: vi.fn(),
  addDomainToProject: vi.fn(),
  markRegistered: vi.fn(),
  markRefunded: vi.fn(),
  markFailed: vi.fn(),
  setLinked: vi.fn(),
};

const providerState = {
  id: "vercel" as string,
  canRegister: true,
  available: true as boolean | null,
  binding: true,
  wholesaleSek: 110 as number | null,
};

vi.mock("@/lib/db/services/domain-orders", () => ({
  claimDomainOrderForRegistration: async () => {
    if (dbState.claimThrows) throw new Error("db down");
    return dbState.claimSucceeds;
  },
  markDomainOrderRegistered: (...args: unknown[]) => {
    calls.markRegistered(...args);
    return Promise.resolve();
  },
  markDomainOrderRefunded: (...args: unknown[]) => {
    calls.markRefunded(...args);
    return Promise.resolve();
  },
  markDomainOrderRegistrationFailed: (...args: unknown[]) => {
    calls.markFailed(...args);
    return Promise.resolve();
  },
  setDomainAddedToProject: (...args: unknown[]) => {
    calls.setLinked(...args);
    return Promise.resolve();
  },
}));

vi.mock("@/lib/config", () => ({
  SECRETS: { stripeSecretKey: "sk_test_x" },
}));

vi.mock("@/lib/vercel/vercel-client", () => ({
  isVercelConfigured: () => true,
  addDomainToProject: (...args: unknown[]) => {
    calls.addDomainToProject(...args);
    return Promise.resolve({ name: "x", apexName: "x", verified: false });
  },
}));

vi.mock("@/lib/domains/registrar", () => ({
  tldOf: (domain: string) => domain.split(".").pop() ?? "",
  providersForTld: () => [
    {
      id: providerState.id,
      canRegister: () => providerState.canRegister,
      getQuote: async () => ({
        registrar: providerState.id,
        available: providerState.available,
        quote: {
          customerSek:
            providerState.wholesaleSek === null ? null : providerState.wholesaleSek * 5,
          wholesaleSek: providerState.wholesaleSek,
          currency: "SEK" as const,
          source: providerState.binding ? ("registrar" as const) : ("reference" as const),
          binding: providerState.binding,
          periodYears: 1,
        },
        error: null,
      }),
      register: (...args: unknown[]) => {
        calls.register(...args);
        return Promise.resolve({ registrarOrderId: "reg_1" });
      },
    },
  ],
}));

vi.mock("stripe", () => ({
  default: class FakeStripe {
    refunds = {
      create: (...args: unknown[]) => {
        calls.refundCreate(...args);
        return Promise.resolve({ id: "re_1" });
      },
    };
  },
}));

const { fulfilDomainOrder } = await import("./fulfilment");

type TestOrder = Parameters<typeof fulfilDomainOrder>[0];

function orderFixture(overrides: Partial<TestOrder> = {}): TestOrder {
  return {
    id: "ord_1",
    domain: "mitt-bygge.com",
    registrar: "vercel",
    stripe_payment_intent: "pi_1",
    // Customer paid 5x the 110 kr wholesale.
    price_ore: 55_000,
    vercel_project_id: "prj_1",
    ...overrides,
  } as TestOrder;
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.claimSucceeds = true;
  dbState.claimThrows = false;
  providerState.id = "vercel";
  providerState.canRegister = true;
  providerState.available = true;
  providerState.binding = true;
  providerState.wholesaleSek = 110;
});

describe("fulfilDomainOrder", () => {
  it("registers, records and links on the happy path", async () => {
    const outcome = await fulfilDomainOrder(orderFixture());
    expect(outcome).toEqual({
      status: "registered",
      registrarOrderId: "reg_1",
      linkedToProject: true,
    });
    expect(calls.register).toHaveBeenCalledTimes(1);
    expect(calls.markRegistered).toHaveBeenCalledWith("ord_1", "reg_1");
    expect(calls.refundCreate).not.toHaveBeenCalled();
  });

  it("does nothing when another delivery already claimed the order", async () => {
    // The whole point of the claim: a redelivered webhook must not place a
    // second registrar order against one payment.
    dbState.claimSucceeds = false;
    const outcome = await fulfilDomainOrder(orderFixture());
    expect(outcome).toEqual({ status: "already_handled" });
    expect(calls.register).not.toHaveBeenCalled();
    expect(calls.refundCreate).not.toHaveBeenCalled();
  });

  it("refunds when registration throws", async () => {
    calls.register.mockImplementationOnce(() => {
      throw new Error("registrar exploded");
    });
    const outcome = await fulfilDomainOrder(orderFixture());
    expect(outcome.status).toBe("refunded");
    expect(calls.refundCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: "pi_1" }),
    );
    expect(calls.markRefunded).toHaveBeenCalled();
    expect(calls.markRegistered).not.toHaveBeenCalled();
  });

  it("refunds instead of buying when the name was taken during checkout", async () => {
    providerState.available = false;
    const outcome = await fulfilDomainOrder(orderFixture());
    expect(outcome).toEqual({
      status: "refunded",
      reason: "domain_taken_before_fulfilment",
    });
    expect(calls.register).not.toHaveBeenCalled();
  });

  it("refunds instead of buying when the registrar can no longer quote", async () => {
    providerState.binding = false;
    const outcome = await fulfilDomainOrder(orderFixture());
    expect(outcome.status).toBe("refunded");
    expect(calls.register).not.toHaveBeenCalled();
  });

  it("refunds instead of buying at a loss when wholesale exceeded the charge", async () => {
    // Customer paid 550 kr; wholesale is now 600 kr. Completing the purchase
    // would spend more than they approved on their behalf.
    providerState.wholesaleSek = 600;
    const outcome = await fulfilDomainOrder(orderFixture({ price_ore: 55_000 }));
    expect(outcome).toEqual({
      status: "refunded",
      reason: "wholesale_price_exceeded_charge",
    });
    expect(calls.register).not.toHaveBeenCalled();
  });

  it("absorbs a normal wholesale increase rather than refunding a good sale", async () => {
    providerState.wholesaleSek = 140;
    const outcome = await fulfilDomainOrder(orderFixture({ price_ore: 55_000 }));
    expect(outcome.status).toBe("registered");
    expect(calls.register).toHaveBeenCalledTimes(1);
  });

  it("escalates to manual handling when the refund itself fails", async () => {
    calls.register.mockImplementationOnce(() => {
      throw new Error("registrar exploded");
    });
    calls.refundCreate.mockImplementationOnce(() => {
      throw new Error("stripe down");
    });
    const outcome = await fulfilDomainOrder(orderFixture());
    expect(outcome.status).toBe("needs_manual_handling");
    // The row has to carry why, or a stuck charge is invisible.
    expect(calls.markFailed).toHaveBeenCalledWith(
      "ord_1",
      expect.stringContaining("refund failed"),
    );
  });

  it("keeps a registered domain registered when project linking fails", async () => {
    calls.addDomainToProject.mockImplementationOnce(() => {
      throw new Error("vercel down");
    });
    const outcome = await fulfilDomainOrder(orderFixture());
    expect(outcome).toEqual({
      status: "registered",
      registrarOrderId: "reg_1",
      linkedToProject: false,
    });
    expect(calls.markRegistered).toHaveBeenCalled();
    expect(calls.refundCreate).not.toHaveBeenCalled();
  });

  it("refunds when an unexpected error hits before the registrar is called", async () => {
    // The webhook cannot compensate for this — it has no way to know whether
    // the registrar ran. Nothing was bought here, so the money goes back.
    dbState.claimThrows = true;
    const outcome = await fulfilDomainOrder(orderFixture());
    expect(outcome.status).toBe("refunded");
    expect(calls.register).not.toHaveBeenCalled();
    expect(calls.refundCreate).toHaveBeenCalled();
  });

  it("never refunds after the registrar call, even on an unexpected error", async () => {
    // The domain may already be bought. Refunding would hand it over for free,
    // so this is the one path that deliberately keeps the money and escalates.
    calls.markRegistered.mockImplementationOnce(() => {
      throw new Error("db down after purchase");
    });
    const outcome = await fulfilDomainOrder(orderFixture());
    expect(outcome.status).toBe("needs_manual_handling");
    expect(calls.register).toHaveBeenCalledTimes(1);
    expect(calls.refundCreate).not.toHaveBeenCalled();
    expect(calls.markFailed).toHaveBeenCalledWith(
      "ord_1",
      expect.stringContaining("post_registration_failure"),
    );
  });

  it("refunds when no configured provider can fulfil the order", async () => {
    providerState.canRegister = false;
    const outcome = await fulfilDomainOrder(orderFixture());
    expect(outcome).toEqual({ status: "refunded", reason: "registrar_unavailable" });
    expect(calls.register).not.toHaveBeenCalled();
  });
});
