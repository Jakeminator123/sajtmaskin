import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
  getCheckoutCompletedDispatch,
  shouldDispatchSiteSubscription,
} from "./stripe-webhook-dispatch";

function session(
  mode: Stripe.Checkout.Session["mode"] | undefined,
  metadata: Stripe.Checkout.Session["metadata"] | unknown,
): Stripe.Checkout.Session {
  return { mode, metadata } as Stripe.Checkout.Session;
}

describe("getCheckoutCompletedDispatch", () => {
  it("skiljer sajt-abonnemang från credit- och domänköp", () => {
    expect(
      getCheckoutCompletedDispatch(
        session("subscription", { kind: "site_subscription" }),
      ),
    ).toBe("site_subscription");
    expect(getCheckoutCompletedDispatch(session("payment", undefined))).toBe("legacy_credits");
    expect(
      getCheckoutCompletedDispatch(session("payment", { kind: "domain_purchase" })),
    ).toBe("domain_purchase");
    expect(
      getCheckoutCompletedDispatch(session("payment", { kind: "site_subscription" })),
    ).toBe("blocked");
    expect(getCheckoutCompletedDispatch(session("subscription", undefined))).toBe("blocked");
  });
});

describe("shouldDispatchSiteSubscription", () => {
  it("tar bara sajt-abonnemangets egna events", () => {
    expect(
      shouldDispatchSiteSubscription({
        type: "checkout.session.completed",
        data: { object: session("subscription", { kind: "site_subscription" }) },
      } as Stripe.Event),
    ).toBe(true);
    expect(
      shouldDispatchSiteSubscription({
        type: "checkout.session.completed",
        data: { object: session("payment", undefined) },
      } as Stripe.Event),
    ).toBe(false);
    expect(
      shouldDispatchSiteSubscription({
        type: "invoice.paid",
        data: {
          object: {
            billing_reason: "subscription_cycle",
            parent: { subscription_details: { metadata: { kind: "site_subscription" } } },
          },
        },
      } as unknown as Stripe.Event),
    ).toBe(true);
    expect(
      shouldDispatchSiteSubscription({
        type: "invoice.paid",
        data: {
          object: {
            billing_reason: "subscription_cycle",
            parent: { subscription_details: { subscription: "sub_other" } },
          },
        },
      } as unknown as Stripe.Event),
    ).toBe(false);
  });
});
