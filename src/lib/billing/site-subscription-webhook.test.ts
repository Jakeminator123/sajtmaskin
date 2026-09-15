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
const retrieveCheckoutSessionFresh = vi.hoisted(() => vi.fn());
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
    retrieveCheckoutSessionFresh,
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
    expect(result.status).toBe(500);
    expect(result.body.error).toBe("livemode_mismatch");
    expect(claimStripeBillingEvent).not.toHaveBeenCalled();
    expect(completeStripeBillingEvent).not.toHaveBeenCalled();
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

    expect(result.status).toBe(500);
    expect(result.body.error).toBe("tenant_mismatch");
    expect(grantSiteSubscriptionPeriodCredits).not.toHaveBeenCalled();
    expect(completeStripeBillingEvent).not.toHaveBeenCalled();
    expect(failStripeBillingEvent).toHaveBeenCalledWith("evt_1", "tenant_mismatch");
  });

  it("retrysar metadata_mode_mismatch i stället för att kvittera eventet", async () => {
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
          billing_mode: "live",
        },
      }),
      serverBillingMode: "test",
    });

    expect(result.status).toBe(500);
    expect(result.body.error).toBe("metadata_mode_mismatch");
    expect(updateSiteSubscription).not.toHaveBeenCalled();
    expect(completeStripeBillingEvent).not.toHaveBeenCalled();
    expect(failStripeBillingEvent).toHaveBeenCalledWith("evt_1", "metadata_mode_mismatch");
  });

  it("kvitterar permanent ogiltig checkout-metadata så Stripe inte retrysar för evigt", async () => {
    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("checkout.session.completed", {
        id: "cs_1",
        mode: "subscription",
        subscription: "sub_1",
        metadata: { kind: "site_subscription" },
      }),
      serverBillingMode: "test",
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("invalid_site_subscription_metadata");
    expect(completeStripeBillingEvent).toHaveBeenCalledWith("evt_1");
    expect(failStripeBillingEvent).not.toHaveBeenCalled();
  });

  it("håller checkout_pending tills invoice.paid skriver period", async () => {
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
    expect(result.body).toMatchObject({
      attached: true,
      claimed: true,
      granted: false,
      pending: true,
    });
    expect(updateSiteSubscription).toHaveBeenCalledWith(
      "sub_row",
      "test",
      { stripe_subscription_id: "sub_1" },
    );
    expect(updateSiteSubscription.mock.calls[0]?.[2]).not.toHaveProperty("lifecycle_state");
    expect(updateSiteSubscription.mock.calls[0]?.[2]).not.toHaveProperty(
      "stripe_checkout_session_id",
    );
    expect(grantSiteSubscriptionPeriodCredits).not.toHaveBeenCalled();
  });

  it("skriver inte ner en redan betald rad när checkout.completed kommer sent", async () => {
    getSiteSubscriptionByStripeId.mockResolvedValue({
      ...row,
      lifecycle_state: "active",
      current_period_end: new Date("2026-10-15T12:00:00.000Z"),
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
    expect(result.body.granted).toBe(false);
    expect(updateSiteSubscription).not.toHaveBeenCalled();
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
    retrieveCheckoutSessionFresh.mockResolvedValue({
      id: "cs_1",
      status: "expired",
      subscription: "sub_1",
      expires_at: 1_726_401_600,
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
    retrieveCheckoutSessionFresh.mockResolvedValue({
      id: "cs_1",
      status: "expired",
      subscription: null,
      expires_at: 1_726_401_600,
    });
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

  it("promoverar inte checkout_pending till active när deleted har framtida period", async () => {
    getSiteSubscriptionByStripeId.mockResolvedValue({
      ...row,
      lifecycle_state: "checkout_pending",
      current_period_end: new Date("2026-10-15T12:00:00.000Z"),
    });
    retrieveSubscriptionFresh.mockResolvedValue({
      id: "sub_1",
      status: "canceled",
      metadata: { kind: "site_subscription", projectId: "prj_a", userId: "user_1" },
    });

    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("customer.subscription.deleted", {
        id: "sub_1",
        status: "canceled",
        metadata: { kind: "site_subscription", projectId: "prj_a", userId: "user_1" },
      }),
      serverBillingMode: "test",
    });

    expect(result.status).toBe(200);
    expect(result.body.stillPaid).toBe(false);
    expect(updateSiteSubscription).toHaveBeenCalledWith(
      "sub_row",
      "test",
      expect.objectContaining({
        lifecycle_state: "ended",
        ended_reason: "checkout_expired",
      }),
    );
    expect(updateSiteSubscription.mock.calls[0]?.[2]).not.toEqual(
      expect.objectContaining({ lifecycle_state: "active" }),
    );
    expect(updateSiteSubscription.mock.calls[0]?.[2]).not.toHaveProperty("hosting_state_desired");
    expect(updateSiteSubscription.mock.calls[0]?.[2]).not.toEqual(
      expect.objectContaining({ ended_reason: "subscription_deleted" }),
    );
    expect(enqueueHostingJob).not.toHaveBeenCalled();
  });

  it("skriver inte över ended+checkout_expired när Stripe sedan skickar deleted", async () => {
    getSiteSubscriptionByStripeId.mockResolvedValue({
      ...row,
      lifecycle_state: "ended",
      ended_reason: "checkout_expired",
      ended_at: new Date("2026-09-15T11:00:00.000Z"),
      current_period_end: null,
    });
    retrieveSubscriptionFresh.mockResolvedValue({
      id: "sub_1",
      status: "canceled",
      metadata: { kind: "site_subscription", projectId: "prj_a", userId: "user_1" },
    });

    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("customer.subscription.deleted", {
        id: "sub_1",
        status: "canceled",
        metadata: { kind: "site_subscription", projectId: "prj_a", userId: "user_1" },
      }),
      serverBillingMode: "test",
    });

    expect(result.status).toBe(200);
    expect(updateSiteSubscription).toHaveBeenCalledWith(
      "sub_row",
      "test",
      expect.objectContaining({
        lifecycle_state: "ended",
        ended_reason: "checkout_expired",
      }),
    );
    expect(updateSiteSubscription.mock.calls[0]?.[2]).not.toEqual(
      expect.objectContaining({ ended_reason: "subscription_deleted" }),
    );
    expect(updateSiteSubscription.mock.calls[0]?.[2]).not.toHaveProperty("hosting_state_desired");
    expect(enqueueHostingJob).not.toHaveBeenCalled();
  });

  it("behåller redan betald active när deleted har tid kvar", async () => {
    getSiteSubscriptionByStripeId.mockResolvedValue({
      ...row,
      lifecycle_state: "active",
      current_period_end: new Date("2026-10-15T12:00:00.000Z"),
      hosting_state_desired: "active",
    });
    retrieveSubscriptionFresh.mockResolvedValue({
      id: "sub_1",
      status: "canceled",
      metadata: { kind: "site_subscription", projectId: "prj_a", userId: "user_1" },
    });

    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("customer.subscription.deleted", {
        id: "sub_1",
        status: "canceled",
        metadata: { kind: "site_subscription", projectId: "prj_a", userId: "user_1" },
      }),
      serverBillingMode: "test",
    });

    expect(result.body.stillPaid).toBe(true);
    expect(updateSiteSubscription).toHaveBeenCalledWith(
      "sub_row",
      "test",
      expect.objectContaining({ lifecycle_state: "active" }),
    );
    expect(enqueueHostingJob).not.toHaveBeenCalled();
  });

  it("binder inte fulfill till rad med annat stripe-id", async () => {
    const result = await fulfillPaidSubscriptionRow({
      stripe: {} as Stripe,
      row: { ...row, stripe_subscription_id: "sub_winner" } as never,
      stripeSubscriptionId: "sub_orphan",
    });

    expect(result).toMatchObject({
      granted: false,
      applied: false,
      reason: "foreign_subscription",
    });
    expect(updateSiteSubscription).not.toHaveBeenCalled();
    expect(retrieveSubscriptionFresh).not.toHaveBeenCalled();
    expect(grantSiteSubscriptionPeriodCredits).not.toHaveBeenCalled();
  });

  it("promoverar inte checkout_pending via incomplete eller unpaid-sub", async () => {
    const pending = { ...row, lifecycle_state: "checkout_pending" as const };
    retrieveInvoiceFresh.mockResolvedValue({
      id: "in_open",
      status: "open",
      billing_reason: "subscription_create",
      period_start: 1726401600,
      period_end: 1729080000,
    });

    for (const stripeStatus of ["incomplete", "unpaid"] as const) {
      updateSiteSubscription.mockClear();
      retrieveSubscriptionFresh.mockResolvedValue({
        id: "sub_1",
        status: stripeStatus,
        cancel_at_period_end: false,
        latest_invoice: { id: "in_open", status: "open" },
        items: { data: [{ current_period_start: 1726401600, current_period_end: 1729080000 }] },
      });

      const result = await fulfillPaidSubscriptionRow({
        stripe: {} as Stripe,
        row: pending as never,
        stripeSubscriptionId: "sub_1",
      });

      expect(result, stripeStatus).toMatchObject({
        granted: false,
        applied: false,
        reason: "subscription_unpaid",
      });
      expect(updateSiteSubscription, stripeStatus).not.toHaveBeenCalled();
    }
  });

  it("aktiverar checkout_pending först när fakturan är paid", async () => {
    retrieveInvoiceFresh.mockResolvedValue({
      id: "in_paid",
      status: "paid",
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
      latest_invoice: { id: "in_paid", status: "paid" },
      items: { data: [{ current_period_start: 1726401600, current_period_end: 1729080000 }] },
    });

    const result = await fulfillPaidSubscriptionRow({
      stripe: {} as Stripe,
      row: { ...row, lifecycle_state: "checkout_pending" } as never,
      stripeSubscriptionId: "sub_1",
    });

    expect(result.applied).toBe(true);
    expect(result.granted).toBe(true);
    expect(updateSiteSubscription).toHaveBeenCalledWith(
      "sub_row",
      "test",
      expect.objectContaining({ lifecycle_state: "active" }),
    );
  });

  it("lämnar checkout_pending orörd när Stripe-status är active men fakturan inte är paid", async () => {
    retrieveInvoiceFresh.mockResolvedValue({
      id: "in_open",
      status: "open",
      billing_reason: "subscription_create",
      period_start: 1726401600,
      period_end: 1729080000,
    });
    retrieveSubscriptionFresh.mockResolvedValue({
      id: "sub_1",
      status: "active",
      cancel_at_period_end: false,
      latest_invoice: { id: "in_open", status: "open" },
      items: { data: [{ current_period_start: 1726401600, current_period_end: 1729080000 }] },
    });

    const result = await fulfillPaidSubscriptionRow({
      stripe: {} as Stripe,
      row: { ...row, lifecycle_state: "checkout_pending" } as never,
      stripeSubscriptionId: "sub_1",
    });

    expect(result).toMatchObject({
      granted: false,
      applied: false,
      reason: "invoice_not_paid",
    });
    expect(updateSiteSubscription).not.toHaveBeenCalled();
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

  it("återöppnar inte ended+subscription_deleted även när Stripe-sub fortfarande är active", async () => {
    retrieveInvoiceFresh.mockResolvedValue({
      id: "in_paid",
      status: "paid",
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
      latest_invoice: { id: "in_paid", status: "paid" },
      items: { data: [{ current_period_start: 1726401600, current_period_end: 1729080000 }] },
    });

    const result = await fulfillPaidSubscriptionRow({
      stripe: {} as Stripe,
      row: {
        ...row,
        lifecycle_state: "ended",
        ended_reason: "subscription_deleted",
      } as never,
      stripeSubscriptionId: "sub_1",
    });

    expect(result).toMatchObject({
      granted: false,
      applied: false,
      reason: "ended_terminal",
    });
    expect(updateSiteSubscription).not.toHaveBeenCalled();
  });

  it("reparerar ended+checkout_expired när fakturan är paid", async () => {
    retrieveInvoiceFresh.mockResolvedValue({
      id: "in_paid",
      status: "paid",
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
      latest_invoice: { id: "in_paid", status: "paid" },
      items: { data: [{ current_period_start: 1726401600, current_period_end: 1729080000 }] },
    });

    const result = await fulfillPaidSubscriptionRow({
      stripe: {} as Stripe,
      row: {
        ...row,
        lifecycle_state: "ended",
        ended_reason: "checkout_expired",
      } as never,
      stripeSubscriptionId: "sub_1",
    });

    expect(result.applied).toBe(true);
    expect(result.granted).toBe(true);
    expect(updateSiteSubscription).toHaveBeenCalledWith(
      "sub_row",
      "test",
      expect.objectContaining({ lifecycle_state: "active", ended_reason: null }),
    );
  });

  it("reparerar inte ended+checkout_expired utan paid invoice", async () => {
    retrieveInvoiceFresh.mockResolvedValue({
      id: "in_open",
      status: "open",
      billing_reason: "subscription_create",
      period_start: 1726401600,
      period_end: 1729080000,
    });
    retrieveSubscriptionFresh.mockResolvedValue({
      id: "sub_1",
      status: "active",
      cancel_at_period_end: false,
      latest_invoice: { id: "in_open", status: "open" },
      items: { data: [{ current_period_start: 1726401600, current_period_end: 1729080000 }] },
    });

    const result = await fulfillPaidSubscriptionRow({
      stripe: {} as Stripe,
      row: {
        ...row,
        lifecycle_state: "ended",
        ended_reason: "checkout_expired",
      } as never,
      stripeSubscriptionId: "sub_1",
    });

    expect(result).toMatchObject({
      granted: false,
      applied: false,
      reason: "ended_terminal",
    });
    expect(updateSiteSubscription).not.toHaveBeenCalled();
  });

  it("pausar active som deleted utan kvarvarande period", async () => {
    getSiteSubscriptionByStripeId.mockResolvedValue({
      ...row,
      lifecycle_state: "active",
      current_period_end: new Date("2026-09-14T12:00:00.000Z"),
      hosting_state_desired: "active",
    });
    retrieveSubscriptionFresh.mockResolvedValue({
      id: "sub_1",
      status: "canceled",
      metadata: { kind: "site_subscription", projectId: "prj_a", userId: "user_1" },
    });

    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("customer.subscription.deleted", {
        id: "sub_1",
        status: "canceled",
        metadata: { kind: "site_subscription", projectId: "prj_a", userId: "user_1" },
      }),
      serverBillingMode: "test",
    });

    expect(result.body.stillPaid).toBe(false);
    expect(updateSiteSubscription).toHaveBeenCalledWith(
      "sub_row",
      "test",
      expect.objectContaining({
        lifecycle_state: "ended",
        ended_reason: "subscription_deleted",
        hosting_state_desired: "paused",
      }),
    );
    expect(enqueueHostingJob).toHaveBeenCalledWith({
      subscriptionId: "sub_row",
      billingMode: "test",
      kind: "pause",
    });
  });

  it("skriver inte över vinnarens checkout- eller subscription-id från orphan complete", async () => {
    getSiteSubscriptionByStripeId.mockResolvedValue(null);
    getSiteSubscriptionByCheckoutSession.mockResolvedValue(null);
    getOpenSiteSubscription.mockResolvedValue({
      ...row,
      lifecycle_state: "checkout_pending",
      stripe_checkout_session_id: "cs_winner",
      stripe_subscription_id: "sub_winner",
    });

    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("checkout.session.completed", {
        id: "cs_orphan",
        mode: "subscription",
        subscription: "sub_orphan",
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
    expect(result.body.ignored).toBe("foreign_checkout_session");
    expect(result.body.attached).not.toBe(true);
    expect(updateSiteSubscription).not.toHaveBeenCalled();
  });

  it("ignorerar orphan invoice.paid när vinnaren redan har annat stripe-id", async () => {
    getSiteSubscriptionByStripeId.mockResolvedValue(null);
    getOpenSiteSubscription.mockResolvedValue({
      ...row,
      lifecycle_state: "active",
      stripe_subscription_id: "sub_winner",
    });
    retrieveInvoiceFresh.mockResolvedValue({
      id: "in_orphan",
      status: "paid",
      billing_reason: "subscription_create",
      period_start: 1726401600,
      period_end: 1729080000,
      parent: { subscription_details: { subscription: "sub_orphan" } },
    });
    retrieveSubscriptionFresh.mockResolvedValue({
      id: "sub_orphan",
      status: "active",
      metadata: { kind: "site_subscription", projectId: "prj_a", userId: "user_1" },
      cancel_at_period_end: false,
      items: { data: [{ current_period_start: 1726401600, current_period_end: 1729080000 }] },
    });

    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event(
        "invoice.paid",
        siteInvoice({
          id: "in_orphan",
          parent: {
            subscription_details: {
              metadata: { kind: "site_subscription" },
              subscription: "sub_orphan",
            },
          },
        }),
      ),
      serverBillingMode: "test",
    });

    expect(result.status).toBe(200);
    expect(result.body.ignored).toBe("foreign_subscription");
    expect(result.body.paid).not.toBe(true);
    expect(updateSiteSubscription).not.toHaveBeenCalled();
    expect(grantSiteSubscriptionPeriodCredits).not.toHaveBeenCalled();
  });

  it("ignorerar orphan subscription.deleted och rör inte öppen vinnarrad", async () => {
    getSiteSubscriptionByStripeId.mockResolvedValue(null);
    getOpenSiteSubscription.mockResolvedValue({
      ...row,
      lifecycle_state: "active",
      stripe_subscription_id: "sub_winner",
    });
    retrieveSubscriptionFresh.mockResolvedValue({
      id: "sub_orphan",
      status: "canceled",
      metadata: { kind: "site_subscription", projectId: "prj_a", userId: "user_1" },
    });

    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("customer.subscription.deleted", {
        id: "sub_orphan",
        status: "canceled",
        metadata: { kind: "site_subscription", projectId: "prj_a", userId: "user_1" },
      }),
      serverBillingMode: "test",
    });

    expect(result.status).toBe(200);
    expect(result.body.ignored).toBe("unknown_subscription");
    expect(result.body.deleted).not.toBe(true);
    expect(getOpenSiteSubscription).not.toHaveBeenCalled();
    expect(updateSiteSubscription).not.toHaveBeenCalled();
    expect(enqueueHostingJob).not.toHaveBeenCalled();
  });

  it("ignorerar orphan subscription.updated när vinnaren har annat stripe-id", async () => {
    getSiteSubscriptionByStripeId.mockResolvedValue(null);
    getOpenSiteSubscription.mockResolvedValue({
      ...row,
      lifecycle_state: "active",
      stripe_subscription_id: "sub_winner",
    });
    retrieveSubscriptionFresh.mockResolvedValue({
      id: "sub_orphan",
      status: "active",
      metadata: { kind: "site_subscription", projectId: "prj_a", userId: "user_1" },
      cancel_at_period_end: false,
      latest_invoice: { status: "paid" },
      items: { data: [{ current_period_start: 1, current_period_end: 2 }] },
    });

    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("customer.subscription.updated", {
        id: "sub_orphan",
        status: "active",
        metadata: { kind: "site_subscription", projectId: "prj_a", userId: "user_1" },
      }),
      serverBillingMode: "test",
    });

    expect(result.status).toBe(200);
    expect(result.body.ignored).toBe("foreign_subscription");
    expect(result.body.synced).not.toBe(true);
    expect(updateSiteSubscription).not.toHaveBeenCalled();
  });

  it("binder invoice.paid till öppen rad med tomma stripe-fält i första webhook-racet", async () => {
    getSiteSubscriptionByStripeId.mockResolvedValue(null);
    getOpenSiteSubscription.mockResolvedValue({
      ...row,
      lifecycle_state: "checkout_pending",
      stripe_subscription_id: null,
      stripe_checkout_session_id: "cs_1",
      current_period_end: null,
    });
    retrieveInvoiceFresh.mockResolvedValue({
      id: "in_paid",
      status: "paid",
      billing_reason: "subscription_create",
      period_start: 1726401600,
      period_end: 1729080000,
      parent: { subscription_details: { subscription: "sub_race" } },
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
      id: "sub_race",
      status: "active",
      metadata: { kind: "site_subscription", projectId: "prj_a", userId: "user_1" },
      cancel_at_period_end: false,
      latest_invoice: { id: "in_paid", status: "paid" },
      items: { data: [{ current_period_start: 1726401600, current_period_end: 1729080000 }] },
    });

    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event(
        "invoice.paid",
        siteInvoice({
          id: "in_paid",
          parent: {
            subscription_details: {
              metadata: { kind: "site_subscription" },
              subscription: "sub_race",
            },
          },
        }),
      ),
      serverBillingMode: "test",
    });

    expect(result.status).toBe(200);
    expect(result.body.paid).toBe(true);
    expect(result.body.grant).toMatchObject({ applied: true, granted: true });
    expect(getOpenSiteSubscription).toHaveBeenCalledWith("prj_a", "test");
    expect(updateSiteSubscription).toHaveBeenCalledWith(
      "sub_row",
      "test",
      expect.objectContaining({
        stripe_subscription_id: "sub_race",
        lifecycle_state: "active",
      }),
    );
  });

  it("fyller tomt stripe_subscription_id från subscription.updated", async () => {
    getSiteSubscriptionByStripeId.mockResolvedValue(null);
    getOpenSiteSubscription.mockResolvedValue({
      ...row,
      lifecycle_state: "checkout_pending",
      stripe_subscription_id: null,
    });
    retrieveSubscriptionFresh.mockResolvedValue({
      id: "sub_new",
      status: "active",
      metadata: { kind: "site_subscription", projectId: "prj_a", userId: "user_1" },
      cancel_at_period_end: false,
      latest_invoice: { status: "paid" },
      items: { data: [{ current_period_start: 1, current_period_end: 2 }] },
    });

    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("customer.subscription.updated", {
        id: "sub_new",
        status: "active",
        metadata: { kind: "site_subscription", projectId: "prj_a", userId: "user_1" },
      }),
      serverBillingMode: "test",
    });

    expect(result.status).toBe(200);
    expect(result.body.synced).toBe(true);
    expect(getOpenSiteSubscription).toHaveBeenCalledWith("prj_a", "test");
    expect(updateSiteSubscription).toHaveBeenCalledWith(
      "sub_row",
      "test",
      expect.objectContaining({ stripe_subscription_id: "sub_new" }),
    );
  });

  it("ignorerar orphan complete som bara skiljer subscription-id", async () => {
    getSiteSubscriptionByStripeId.mockResolvedValue(null);
    getSiteSubscriptionByCheckoutSession.mockResolvedValue({
      ...row,
      lifecycle_state: "checkout_pending",
      stripe_checkout_session_id: "cs_1",
      stripe_subscription_id: "sub_winner",
    });

    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("checkout.session.completed", {
        id: "cs_1",
        mode: "subscription",
        subscription: "sub_orphan",
        metadata: {
          kind: "site_subscription",
          projectId: "prj_a",
          userId: "user_1",
          billingMode: "test",
        },
      }),
      serverBillingMode: "test",
    });

    expect(result.body.ignored).toBe("foreign_subscription");
    expect(updateSiteSubscription).not.toHaveBeenCalled();
  });

  it("fyller tomt session-id bakom CAS och lämnar redan satt id", async () => {
    getSiteSubscriptionByStripeId.mockResolvedValue(null);
    getSiteSubscriptionByCheckoutSession.mockResolvedValue(null);
    getOpenSiteSubscription.mockResolvedValue({
      ...row,
      lifecycle_state: "checkout_pending",
      stripe_checkout_session_id: null,
      stripe_subscription_id: null,
    });

    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("checkout.session.completed", {
        id: "cs_new",
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

    expect(result.body.attached).toBe(true);
    expect(updateSiteSubscription).toHaveBeenCalledWith(
      "sub_row",
      "test",
      {
        stripe_checkout_session_id: "cs_new",
        stripe_subscription_id: "sub_1",
      },
      { expectedEmptyCheckoutSession: true },
    );
  });

  it("ignorerar checkout.completed när CAS förlorar mot vinnarens session", async () => {
    getSiteSubscriptionByStripeId.mockResolvedValue(null);
    getSiteSubscriptionByCheckoutSession.mockResolvedValue(null);
    getOpenSiteSubscription.mockResolvedValue({
      ...row,
      lifecycle_state: "checkout_pending",
      stripe_checkout_session_id: null,
      stripe_subscription_id: null,
    });
    updateSiteSubscription.mockResolvedValue(null);

    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("checkout.session.completed", {
        id: "cs_orphan",
        mode: "subscription",
        subscription: "sub_orphan",
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
    expect(result.body.ignored).toBe("checkout_session_already_set");
    expect(result.body.attached).not.toBe(true);
  });

  it("ignorerar expired-payload utan subscription när fresh retrieve är paid", async () => {
    getSiteSubscriptionByCheckoutSession.mockResolvedValue({
      ...row,
      lifecycle_state: "checkout_pending",
      stripe_subscription_id: null,
    });
    retrieveCheckoutSessionFresh.mockResolvedValue({
      id: "cs_1",
      status: "complete",
      subscription: "sub_paid",
      expires_at: 1_726_401_600,
    });

    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("checkout.session.expired", {
        id: "cs_1",
        status: "expired",
        subscription: null,
        metadata: { kind: "site_subscription", projectId: "prj_a", userId: "user_1" },
      }),
      serverBillingMode: "test",
    });

    expect(result.status).toBe(200);
    expect(result.body.ignored).toBe("paid_claim");
    expect(updateSiteSubscription).not.toHaveBeenCalled();
  });

  it("retrysar checkout.expired när fresh retrieve failar i stället för att end_claim", async () => {
    getSiteSubscriptionByCheckoutSession.mockResolvedValue({
      ...row,
      lifecycle_state: "checkout_pending",
      stripe_subscription_id: null,
    });
    retrieveCheckoutSessionFresh.mockRejectedValue(new Error("stripe_timeout"));

    const result = await handleSiteSubscriptionStripeEvent({
      stripe: {} as Stripe,
      event: event("checkout.session.expired", {
        id: "cs_1",
        status: "expired",
        subscription: null,
        metadata: { kind: "site_subscription", projectId: "prj_a", userId: "user_1" },
      }),
      serverBillingMode: "test",
    });

    expect(result.status).toBe(500);
    expect(result.body.error).toBe("checkout_session_retrieve_failed");
    expect(updateSiteSubscription).not.toHaveBeenCalled();
    expect(completeStripeBillingEvent).not.toHaveBeenCalled();
    expect(failStripeBillingEvent).toHaveBeenCalledWith(
      "evt_1",
      "checkout_session_retrieve_failed",
    );
  });
});
