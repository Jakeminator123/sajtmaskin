import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const claimStripeBillingEvent = vi.hoisted(() => vi.fn());
const completeStripeBillingEvent = vi.hoisted(() => vi.fn());
const failStripeBillingEvent = vi.hoisted(() => vi.fn());
const getSiteSubscriptionByStripeId = vi.hoisted(() => vi.fn());
const getSiteSubscriptionByCheckoutSession = vi.hoisted(() => vi.fn());
const getOpenSiteSubscription = vi.hoisted(() => vi.fn());
const updateSiteSubscription = vi.hoisted(() => vi.fn());
const grantSiteSubscriptionPeriodCredits = vi.hoisted(() => vi.fn());
const retrieveSubscriptionFresh = vi.hoisted(() => vi.fn());
const retrieveInvoiceFresh = vi.hoisted(() => vi.fn());
const enqueueHostingJob = vi.hoisted(() => vi.fn());

vi.mock("./site-subscription-events", () => ({
  claimStripeBillingEvent,
  completeStripeBillingEvent,
  failStripeBillingEvent,
}));

vi.mock("@/lib/db/services/site-subscriptions", () => ({
  getSiteSubscriptionByStripeId,
  getSiteSubscriptionByCheckoutSession,
  getOpenSiteSubscription,
  updateSiteSubscription,
}));

vi.mock("./site-subscription-credits", () => ({
  grantSiteSubscriptionPeriodCredits,
}));

vi.mock("./site-subscription-reconcile", () => ({
  enqueueHostingJob,
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

const { fulfillPaidSubscriptionRow, handleSiteSubscriptionStripeEvent } = await import(
  "./site-subscription-webhook"
);

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

function siteInvoice(overrides: Record<string, unknown> = {}) {
  return {
    parent: {
      subscription_details: {
        metadata: { kind: "site_subscription" },
        subscription: "sub_1",
      },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  claimStripeBillingEvent.mockResolvedValue({ action: "process" });
  completeStripeBillingEvent.mockResolvedValue(undefined);
  failStripeBillingEvent.mockResolvedValue(undefined);
  getSiteSubscriptionByStripeId.mockResolvedValue(row);
  getSiteSubscriptionByCheckoutSession.mockResolvedValue(row);
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
      event: event("invoice.paid", siteInvoice(), true),
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
      event: event("invoice.paid", siteInvoice({ id: "in_1" })),
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
      event: event("invoice.paid", siteInvoice({ id: "in_1" })),
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
      event: event("invoice.payment_failed", siteInvoice({ id: "in_old" })),
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
      event: event("invoice.paid", siteInvoice({ id: "in_1" })),
      serverBillingMode: "test",
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("tenant_mismatch");
    expect(grantSiteSubscriptionPeriodCredits).not.toHaveBeenCalled();
  });

  it("markerar complete checkout som aktivt anspråk utan periodförmån", async () => {
    getSiteSubscriptionByStripeId.mockResolvedValue(null);
    getSiteSubscriptionByCheckoutSession.mockResolvedValue({
      ...row,
      lifecycle_state: "checkout_pending",
      stripe_subscription_id: null,
      current_period_end: null,
    });

    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("checkout.session.completed", {
        id: "cs_1",
        mode: "subscription",
        subscription: "sub_1",
        metadata: {
          kind: "site_subscription",
          projectId: "prj_a",
          userId: "user_1",
          billingMode: "test",
        },
      }),
      serverBillingMode: "test",
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ attached: true, claimed: true, granted: false });
    expect(updateSiteSubscription).toHaveBeenCalledWith(
      "sub_row",
      "test",
      expect.objectContaining({
        lifecycle_state: "active",
        stripe_checkout_session_id: "cs_1",
        stripe_subscription_id: "sub_1",
      }),
    );
    expect(grantSiteSubscriptionPeriodCredits).not.toHaveBeenCalled();
  });

  it("förlänger inte grace_until vid ny payment_failed i samma period", async () => {
    const existingGrace = new Date("2026-09-22T12:00:00.000Z");
    getSiteSubscriptionByStripeId.mockResolvedValue({
      ...row,
      grace_until: existingGrace,
    });
    retrieveInvoiceFresh.mockResolvedValue({
      id: "in_fail",
      parent: { subscription_details: { subscription: "sub_1" } },
    });
    retrieveSubscriptionFresh.mockResolvedValue({
      id: "sub_1",
      status: "past_due",
      metadata: { kind: "site_subscription", projectId: "prj_a", userId: "user_1" },
      latest_invoice: { status: "open" },
      items: { data: [{ current_period_start: 1, current_period_end: 2 }] },
    });

    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("invoice.payment_failed", siteInvoice({ id: "in_fail" })),
      serverBillingMode: "test",
    });

    expect(result.status).toBe(200);
    expect(result.body.graceReused).toBe(true);
    expect(updateSiteSubscription).toHaveBeenCalledWith(
      "sub_row",
      "test",
      expect.objectContaining({ grace_until: existingGrace }),
    );
  });

  it("delar periodnyckel mellan repair och invoice.paid", async () => {
    retrieveInvoiceFresh.mockResolvedValue({
      id: "in_1",
      billing_reason: "subscription_create",
      period_start: 1726401600,
      period_end: 1729080000,
      lines: {
        data: [
          {
            period: { start: 1726401600, end: 1729080000 },
            parent: { type: "subscription_item_details" },
          },
        ],
      },
    });
    retrieveSubscriptionFresh.mockResolvedValue({
      id: "sub_1",
      status: "active",
      cancel_at_period_end: false,
      latest_invoice: { id: "in_1" },
      items: { data: [{ current_period_start: 1726401600, current_period_end: 1729080000 }] },
    });
    grantSiteSubscriptionPeriodCredits
      .mockResolvedValueOnce({
        granted: true,
        status: "simulated",
        reason: "test_simulated",
      })
      .mockResolvedValue({
        granted: false,
        status: "simulated",
        reason: "already_granted",
      });

    const first = await fulfillPaidSubscriptionRow({
      stripe: {} as Stripe,
      row: row as never,
      stripeSubscriptionId: "sub_1",
    });
    const second = await fulfillPaidSubscriptionRow({
      stripe: {} as Stripe,
      row: row as never,
      stripeSubscriptionId: "sub_1",
    });

    expect(first.granted).toBe(true);
    expect(second.granted).toBe(false);
    expect(grantSiteSubscriptionPeriodCredits).toHaveBeenCalledTimes(2);
    expect(grantSiteSubscriptionPeriodCredits.mock.calls[0]?.[0].periodId).toBe("p1726401600");
    expect(grantSiteSubscriptionPeriodCredits.mock.calls[1]?.[0].periodId).toBe("p1726401600");
  });

  it("släpper inte ett betalt expired-anspråk och villkorar unpaid expire", async () => {
    getSiteSubscriptionByCheckoutSession.mockResolvedValue({
      ...row,
      lifecycle_state: "checkout_pending",
      stripe_subscription_id: null,
    });

    const paid = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("checkout.session.expired", {
        id: "cs_1",
        status: "expired",
        subscription: "sub_1",
        metadata: { kind: "site_subscription", projectId: "prj_a", userId: "user_1" },
      }),
      serverBillingMode: "test",
    });
    expect(paid.body.ignored).toBe("paid_claim");
    expect(updateSiteSubscription).not.toHaveBeenCalled();

    updateSiteSubscription.mockClear();
    updateSiteSubscription.mockResolvedValue({ ...row, lifecycle_state: "ended" });
    const unpaid = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("checkout.session.expired", {
        id: "cs_1",
        status: "expired",
        subscription: null,
        metadata: { kind: "site_subscription", projectId: "prj_a", userId: "user_1" },
      }),
      serverBillingMode: "test",
    });
    expect(unpaid.body.expired).toBe(true);
    expect(updateSiteSubscription).toHaveBeenCalledWith(
      "sub_row",
      "test",
      expect.objectContaining({ lifecycle_state: "ended" }),
      { expectedLifecycle: "checkout_pending" },
    );
  });

  it("anspråkar inte en främmande subscription-invoice", async () => {
    getSiteSubscriptionByStripeId.mockResolvedValue(null);
    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("invoice.paid", {
        billing_reason: "subscription_cycle",
        parent: { subscription_details: { subscription: "sub_other", metadata: { kind: "other" } } },
      }),
      serverBillingMode: "test",
    });
    expect(result.status).toBe(200);
    expect(result.body.ignored).toBe("not_site_subscription");
    expect(claimStripeBillingEvent).not.toHaveBeenCalled();
  });

  it("återöppnar inte ett uppsagt abonnemang från ett gammalt invoice.paid", async () => {
    getSiteSubscriptionByStripeId.mockResolvedValue({
      ...row,
      lifecycle_state: "ended",
      hosting_state_desired: "paused",
      hosting_state_actual: "paused",
    });
    retrieveInvoiceFresh.mockResolvedValue({
      id: "in_old",
      billing_reason: "subscription_create",
      period_start: 1726401600,
      period_end: 1729080000,
      parent: { subscription_details: { subscription: "sub_1" } },
    });
    retrieveSubscriptionFresh.mockResolvedValue({
      id: "sub_1",
      status: "canceled",
      metadata: { kind: "site_subscription", projectId: "prj_a", userId: "user_1" },
      cancel_at_period_end: false,
      items: { data: [{ current_period_start: 1726401600, current_period_end: 1729080000 }] },
    });

    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("invoice.paid", siteInvoice({ id: "in_old" })),
      serverBillingMode: "test",
    });

    expect(result.status).toBe(200);
    expect(result.body.grant).toMatchObject({ granted: false, reason: "subscription_terminal" });
    expect(updateSiteSubscription).not.toHaveBeenCalled();
    expect(enqueueHostingJob).not.toHaveBeenCalled();
  });
});
