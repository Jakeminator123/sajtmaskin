/**
 * Stripe webhook — the domain-purchase branch.
 *
 * Two failures this guards against, both of which cost real money:
 *
 *   1. A domain session falling through to the credits branch. The two flows
 *      share one endpoint and one event type, and the credits branch decides
 *      "is this new?" by looking for a transaction row — which a domain order
 *      never creates. Without the metadata check it would look new forever and
 *      try to grant diamonds for a domain purchase.
 *   2. A redelivered event fulfilling twice. Stripe retries for hours; the
 *      conditional `pending_payment → paid` update is what makes the second
 *      delivery a no-op instead of a second registrar order.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  paidOrder: null as Record<string, unknown> | null,
  existingOrder: null as Record<string, unknown> | null,
};

const calls = {
  fulfil: vi.fn(async () => ({ status: "registered" as const })),
  markPaid: vi.fn(async () => state.paidOrder),
  markExpired: vi.fn(async () => undefined),
  createTransaction: vi.fn(async () => ({})),
  getTransactionByStripeSession: vi.fn(async () => null),
};

let constructedEvent: unknown = null;

vi.mock("stripe", () => ({
  default: class FakeStripe {
    webhooks = {
      constructEvent: () => constructedEvent,
    };
    static errors = { StripeError: class extends Error {} };
  },
}));

vi.mock("@/lib/config", () => ({
  SECRETS: { stripeSecretKey: "sk_test_x", stripeWebhookSecret: "whsec_x" },
}));

vi.mock("@/lib/db/services/transactions", () => ({
  createTransaction: (...args: unknown[]) => calls.createTransaction(...(args as [])),
  getTransactionByStripeSession: (...args: unknown[]) =>
    calls.getTransactionByStripeSession(...(args as [])),
}));

vi.mock("@/lib/db/services/users", () => ({
  getUserById: async () => ({ id: "usr_1", email: "a@b.c" }),
}));

vi.mock("@/lib/domains/fulfilment", () => ({
  fulfilDomainOrder: (...args: unknown[]) => calls.fulfil(...(args as [])),
}));

vi.mock("@/lib/db/services/domain-orders", () => ({
  markDomainOrderPaid: (...args: unknown[]) => calls.markPaid(...(args as [])),
  markDomainOrderExpired: (...args: unknown[]) => calls.markExpired(...(args as [])),
  getDomainOrderByStripeSession: async () => state.existingOrder,
}));

const { POST } = await import("./route");

function webhookRequest(): Request {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    body: "{}",
    headers: { "stripe-signature": "t=1,v1=deadbeef" },
  });
}

function domainSessionEvent(type: string, sessionId = "cs_domain_1") {
  return {
    id: "evt_1",
    type,
    data: {
      object: {
        id: sessionId,
        payment_intent: "pi_1",
        metadata: { kind: "domain_purchase", domainOrderId: "ord_1", userId: "usr_1" },
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.paidOrder = { id: "ord_1", domain: "x.com" };
  state.existingOrder = null;
  calls.markPaid.mockImplementation(async () => state.paidOrder);
  calls.fulfil.mockImplementation(async () => ({ status: "registered" as const }));
});

describe("stripe webhook — domain purchase", () => {
  it("fulfils a paid domain order and never touches the credits ledger", async () => {
    constructedEvent = domainSessionEvent("checkout.session.completed");
    const res = await POST(webhookRequest() as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.outcome).toBe("registered");
    expect(calls.fulfil).toHaveBeenCalledTimes(1);
    expect(calls.createTransaction).not.toHaveBeenCalled();
    // Must branch BEFORE the credits idempotency lookup, which knows nothing
    // about domain orders.
    expect(calls.getTransactionByStripeSession).not.toHaveBeenCalled();
  });

  it("treats a redelivered event as already handled and does not fulfil twice", async () => {
    // Second delivery: the conditional update matches nothing.
    state.paidOrder = null;
    state.existingOrder = { id: "ord_1", status: "registered" };
    constructedEvent = domainSessionEvent("checkout.session.completed");

    const res = await POST(webhookRequest() as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.alreadyHandled).toBe(true);
    expect(calls.fulfil).not.toHaveBeenCalled();
  });

  it("does not ask Stripe to retry a session it has no order for", async () => {
    state.paidOrder = null;
    state.existingOrder = null;
    constructedEvent = domainSessionEvent("checkout.session.completed");

    const res = await POST(webhookRequest() as never);
    const body = await res.json();

    // A signed session with no matching order cannot be fixed by retrying, so
    // a 500 would just generate noise for hours.
    expect(res.status).toBe(200);
    expect(body.ignored).toBe("unknown_domain_order");
    expect(calls.fulfil).not.toHaveBeenCalled();
  });

  it("asks Stripe to retry when the paid-marking itself failed", async () => {
    calls.markPaid.mockImplementationOnce(async () => {
      throw new Error("db down");
    });
    constructedEvent = domainSessionEvent("checkout.session.completed");

    const res = await POST(webhookRequest() as never);
    expect(res.status).toBe(500);
    expect(calls.fulfil).not.toHaveBeenCalled();
  });

  it("releases the reservation when the checkout window expires", async () => {
    constructedEvent = domainSessionEvent("checkout.session.expired", "cs_domain_2");
    const res = await POST(webhookRequest() as never);

    expect(res.status).toBe(200);
    expect(calls.markExpired).toHaveBeenCalledWith("cs_domain_2");
    expect(calls.fulfil).not.toHaveBeenCalled();
  });

  it("swallows a fulfilment crash rather than inviting a redelivery", async () => {
    // The charge succeeded and the order is already claimed as `registering`.
    // A 500 would make Stripe redeliver into an order no one can claim again.
    calls.fulfil.mockImplementationOnce(async () => {
      throw new Error("boom");
    });
    constructedEvent = domainSessionEvent("checkout.session.completed");

    const res = await POST(webhookRequest() as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.outcome).toBe("fulfilment_error");
  });

  it("still credits diamonds for an ordinary credits session", async () => {
    constructedEvent = {
      id: "evt_2",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_credits_1",
          payment_intent: "pi_2",
          metadata: { userId: "usr_1", packageId: "pkg_10", diamonds: "10" },
        },
      },
    };

    const res = await POST(webhookRequest() as never);
    expect(res.status).toBe(200);
    expect(calls.createTransaction).toHaveBeenCalledTimes(1);
    expect(calls.fulfil).not.toHaveBeenCalled();
  });
});
