import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const claimStripeBillingEvent = vi.hoisted(() => vi.fn());
const completeStripeBillingEvent = vi.hoisted(() => vi.fn());
const failStripeBillingEvent = vi.hoisted(() => vi.fn());
const getSiteSubscriptionByStripeId = vi.hoisted(() => vi.fn());
const getOpenSiteSubscription = vi.hoisted(() => vi.fn());
const updateSiteSubscription = vi.hoisted(() => vi.fn());
const grantSiteSubscriptionPeriodCredits = vi.hoisted(() => vi.fn());
const retrieveSubscriptionFresh = vi.hoisted(() => vi.fn());
const retrieveInvoiceFresh = vi.hoisted(() => vi.fn());

vi.mock("./site-subscription-events", () => ({
  claimStripeBillingEvent,
  completeStripeBillingEvent,
  failStripeBillingEvent,
}));

vi.mock("@/lib/db/services/site-subscriptions", () => ({
  getSiteSubscriptionByStripeId,
  getSiteSubscriptionByCheckoutSession: vi.fn(),
  getOpenSiteSubscription,
  updateSiteSubscription,
}));

vi.mock("./site-subscription-credits", () => ({
  grantSiteSubscriptionPeriodCredits,
}));

vi.mock("./site-subscription-reconcile", () => ({
  enqueueHostingJob: vi.fn(),
}));

vi.mock("./site-subscription-hosting", () => ({
  resolveLastPublishedRef: vi.fn(async () => "dpl:published"),
}));

vi.mock("./site-subscription-stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./site-subscription-stripe")>();
  return {
    ...actual,
    retrieveSubscriptionFresh,
    retrieveInvoiceFresh,
  };
});

const { handleSiteSubscriptionStripeEvent } = await import("./site-subscription-webhook");

const row = {
  id: "sub_row",
  user_id: "user_1",
  project_id: "prj_a",
  billing_mode: "test" as const,
  billing_customer_id: "cus_row",
  stripe_subscription_id: "sub_1",
  stripe_checkout_session_id: "cs_1",
  lifecycle_state: "active",
  hosting_state_desired: "active",
  hosting_state_actual: "active",
  last_published_ref: "dpl:published",
  current_period_end: new Date("2026-10-15T12:00:00.000Z"),
  ended_reason: null,
  ended_at: null,
};

function event(type: string, object: unknown, livemode = false): Stripe.Event {
  return { id: "evt_1", type, livemode, data: { object } } as Stripe.Event;
}

beforeEach(() => {
  vi.clearAllMocks();
  claimStripeBillingEvent.mockResolvedValue({ action: "process" });
  completeStripeBillingEvent.mockResolvedValue(undefined);
  failStripeBillingEvent.mockResolvedValue(undefined);
  getSiteSubscriptionByStripeId.mockResolvedValue(row);
  getOpenSiteSubscription.mockResolvedValue(row);
  updateSiteSubscription.mockResolvedValue(row);
  grantSiteSubscriptionPeriodCredits.mockResolvedValue({
    granted: true,
    status: "simulated",
    reason: "test_simulated",
  });
});

describe("handleSiteSubscriptionStripeEvent", () => {
  it("avvisar live-event mot testserver", async () => {
    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("invoice.paid", {}, true),
      serverBillingMode: "test",
    });
    expect(result.status).toBe(400);
    expect(result.body.error).toBe("livemode_mismatch");
    expect(claimStripeBillingEvent).not.toHaveBeenCalled();
  });

  it("kvitterar dubblettevent utan ny mutation", async () => {
    claimStripeBillingEvent.mockResolvedValue({ action: "already_completed" });
    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("invoice.paid", { id: "in_1" }),
      serverBillingMode: "test",
    });
    expect(result.status).toBe(200);
    expect(result.body.duplicate).toBe(true);
    expect(grantSiteSubscriptionPeriodCredits).not.toHaveBeenCalled();
  });

  it("retrysar in-flight event i stället för att kvittera det som klart", async () => {
    claimStripeBillingEvent.mockResolvedValue({ action: "in_flight" });
    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("invoice.paid", { id: "in_1" }),
      serverBillingMode: "test",
    });
    expect(result.status).toBe(500);
    expect(completeStripeBillingEvent).not.toHaveBeenCalled();
  });

  it("ignorerar stale payment_failed efter senare paid", async () => {
    retrieveInvoiceFresh.mockResolvedValue({
      id: "in_old",
      parent: { subscription_details: { subscription: "sub_1" } },
    });
    retrieveSubscriptionFresh.mockResolvedValue({
      id: "sub_1",
      status: "active",
      metadata: { kind: "site_subscription", projectId: "prj_a", userId: "user_1" },
      latest_invoice: { status: "paid" },
      items: { data: [{ current_period_start: 1, current_period_end: 2 }] },
    });

    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("invoice.payment_failed", { id: "in_old" }),
      serverBillingMode: "test",
    });

    expect(result.status).toBe(200);
    expect(result.body.ignored).toBe("stale_payment_failed");
    expect(updateSiteSubscription).not.toHaveBeenCalled();
  });

  it("låser inte upp fel sajt via metadata från en annan rad", async () => {
    retrieveInvoiceFresh.mockResolvedValue({
      id: "in_1",
      billing_reason: "subscription_cycle",
      period_start: 1726401600,
      period_end: 1729080000,
      parent: { subscription_details: { subscription: "sub_1" } },
    });
    retrieveSubscriptionFresh.mockResolvedValue({
      id: "sub_1",
      status: "active",
      metadata: { kind: "site_subscription", projectId: "prj_other", userId: "user_1" },
      cancel_at_period_end: false,
      items: { data: [{ current_period_start: 1726401600, current_period_end: 1729080000 }] },
    });

    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("invoice.paid", { id: "in_1" }),
      serverBillingMode: "test",
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("tenant_mismatch");
    expect(grantSiteSubscriptionPeriodCredits).not.toHaveBeenCalled();
  });
});
