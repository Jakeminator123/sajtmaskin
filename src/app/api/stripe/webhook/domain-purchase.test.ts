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
  markPaidResult: { outcome: "paid", order: { id: "ord_1", domain: "x.com" } } as Record<
    string,
    unknown
  >,
};

const calls = {
  fulfil: vi.fn<() => Promise<{ status: string; reason?: string }>>(async () => ({
    status: "registered",
  })),
  markPaid: vi.fn(async () => state.markPaidResult),
  markExpired: vi.fn(async () => undefined),
  refundOrder: vi.fn(async () => true),
  refundCreate: vi.fn(async () => ({ id: "re_1" })),
  createTransaction: vi.fn(async () => ({})),
  getTransactionByStripeSession: vi.fn(async () => null),
};

let constructedEvent: unknown = null;

vi.mock("stripe", () => ({
  default: class FakeStripe {
    webhooks = {
      constructEvent: () => constructedEvent,
    };
    refunds = {
      create: (...args: unknown[]) => calls.refundCreate(...(args as [])),
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
  refundDomainOrder: (...args: unknown[]) => calls.refundOrder(...(args as [])),
}));

vi.mock("@/lib/db/services/domain-orders", () => ({
  markDomainOrderPaid: (...args: unknown[]) => calls.markPaid(...(args as [])),
  markDomainOrderExpired: (...args: unknown[]) => calls.markExpired(...(args as [])),
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
  state.markPaidResult = { outcome: "paid", order: { id: "ord_1", domain: "x.com" } };
  calls.markPaid.mockImplementation(async () => state.markPaidResult);
  calls.fulfil.mockImplementation(async () => ({ status: "registered" }));
  calls.refundOrder.mockImplementation(async () => true);
  calls.refundCreate.mockImplementation(async () => ({ id: "re_1" }));
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
    // Second delivery of a run that FINISHED: the conditional update matches
    // nothing and the row has moved past `paid`.
    state.markPaidResult = {
      outcome: "already_handled",
      order: { id: "ord_1", domain: "x.com", status: "registered" },
    };
    constructedEvent = domainSessionEvent("checkout.session.completed");

    const res = await POST(webhookRequest() as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.alreadyHandled).toBe(true);
    expect(calls.fulfil).not.toHaveBeenCalled();
  });

  it("resumes fulfilment when the first delivery died after marking the order paid", async () => {
    // The dangerous shape: `already_handled` because the row is `paid`, but
    // nothing was ever registered. Answering 200 here would burn Stripe's
    // retry and leave the customer charged with no domain and no refund.
    // Safe to resume — `fulfilDomainOrder` claims `paid` → `registering`
    // atomically, so a true duplicate loses the claim before the registrar.
    state.markPaidResult = {
      outcome: "already_handled",
      order: { id: "ord_1", domain: "x.com", status: "paid" },
    };
    constructedEvent = domainSessionEvent("checkout.session.completed");

    const res = await POST(webhookRequest() as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.outcome).toBe("registered");
    expect(calls.fulfil).toHaveBeenCalledTimes(1);
    expect(calls.fulfil).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ord_1", status: "paid" }),
    );
  });

  it("refunds instead of pocketing a payment for an order it cannot find", async () => {
    state.markPaidResult = { outcome: "not_found" };
    constructedEvent = domainSessionEvent("checkout.session.completed");

    const res = await POST(webhookRequest() as never);
    const body = await res.json();

    // Retrying cannot conjure the order, but the customer WAS charged — the
    // money has to go back rather than sit unreconciled.
    expect(res.status).toBe(200);
    expect(body.outcome).toBe("refunded");
    expect(calls.refundCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: "pi_1" }),
    );
    expect(calls.fulfil).not.toHaveBeenCalled();
  });

  it("refunds a late payment whose name someone else already took", async () => {
    // The order lapsed, another customer bought the name, and the database
    // refused to revive it. Selling it twice is impossible; keeping the money
    // must be too.
    state.markPaidResult = { outcome: "domain_taken" };
    constructedEvent = domainSessionEvent("checkout.session.completed");

    const res = await POST(webhookRequest() as never);
    const body = await res.json();
    expect(body.outcome).toBe("refunded");
    expect(calls.refundOrder).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ord_1", stripe_payment_intent: "pi_1" }),
      "domain_taken_before_late_payment",
    );
    expect(calls.fulfil).not.toHaveBeenCalled();
  });

  it("refunds a domain session that carries no order id", async () => {
    constructedEvent = {
      id: "evt_x",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_domain_x",
          payment_intent: "pi_x",
          metadata: { kind: "domain_purchase" },
        },
      },
    };
    const res = await POST(webhookRequest() as never);
    const body = await res.json();
    expect(body.outcome).toBe("refunded");
    expect(calls.refundCreate).toHaveBeenCalled();
  });

  it("marks the order paid keyed on the order id, not the session id", async () => {
    // Keying on the session id would miss an order whose session id never got
    // persisted — a payable session no lookup could match.
    constructedEvent = domainSessionEvent("checkout.session.completed");
    await POST(webhookRequest() as never);
    expect(calls.markPaid).toHaveBeenCalledWith("ord_1", "cs_domain_1", "pi_1");
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
    expect(calls.markExpired).toHaveBeenCalledWith("ord_1");
    expect(calls.fulfil).not.toHaveBeenCalled();
  });

  it("reports the fulfilment outcome verbatim instead of compensating itself", async () => {
    // The webhook must NOT try to refund on its own: only `fulfilDomainOrder`
    // knows whether the registrar was already called, and refunding after a
    // successful purchase would hand the domain over for free.
    calls.fulfil.mockImplementationOnce(async () => ({
      status: "needs_manual_handling",
      reason: "post_registration_failure",
    }));
    constructedEvent = domainSessionEvent("checkout.session.completed");

    const res = await POST(webhookRequest() as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.outcome).toBe("needs_manual_handling");
    expect(calls.refundCreate).not.toHaveBeenCalled();
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
