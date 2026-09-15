import { beforeEach, describe, expect, it, vi } from "vitest";

const getSiteSubscriptionById = vi.hoisted(() => vi.fn());
const updateSiteSubscription = vi.hoisted(() => vi.fn());
const updateBillingJob = vi.hoisted(() => vi.fn());
const pause = vi.hoisted(() => vi.fn());
const fulfillPaidSubscriptionRow = vi.hoisted(() => vi.fn());
const getBillingCustomer = vi.hoisted(() => vi.fn());
const listSubscriptionsNeedingReconcile = vi.hoisted(() => vi.fn());
const listRunnableBillingJobs = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/site-subscriptions", () => ({
  getSiteSubscriptionById,
  updateSiteSubscription,
  updateBillingJob,
  getOpenBillingJob: vi.fn(),
  insertBillingJob: vi.fn(),
  listRunnableBillingJobs,
  listSubscriptionsNeedingReconcile,
  getBillingCustomer,
}));

vi.mock("@/lib/db/services/projects", () => ({
  getProjectById: vi.fn(async () => ({ vercel_project_id: "prj_cust" })),
}));

vi.mock("./site-subscription-hosting", () => ({
  getSiteHostingProvider: () => ({ pause, restore: vi.fn() }),
}));

vi.mock("./site-subscription-webhook", () => ({
  fulfillPaidSubscriptionRow,
}));

const { processHostingJob, reconcileSiteSubscriptions, repairPendingCheckoutClaim } = await import(
  "./site-subscription-reconcile"
);

const job = {
  id: "job_1",
  subscription_id: "sub_1",
  billing_mode: "test" as const,
  kind: "pause",
  status: "pending",
  attempts: 0,
  provider_ref: null,
  run_after: new Date("2026-09-15T12:00:00.000Z"),
  lease_owner: null,
  lease_expires_at: null,
  last_error: null,
  completed_at: null,
  created_at: new Date("2026-09-15T11:00:00.000Z"),
  updated_at: new Date("2026-09-15T11:00:00.000Z"),
  open_job_key: "pause:sub_1",
};

function row(desired: "active" | "paused") {
  return {
    id: "sub_1",
    billing_mode: "test",
    project_id: "prj_a",
    hosting_state_desired: desired,
    hosting_state_actual: "active",
    last_published_ref: "dpl:published",
    paused_at: null,
    resumed_at: null,
    retain_until: null,
    pause_requested_at: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  updateBillingJob.mockResolvedValue({});
  updateSiteSubscription.mockResolvedValue(row("paused"));
  getBillingCustomer.mockResolvedValue(null);
  listSubscriptionsNeedingReconcile.mockResolvedValue([]);
  listRunnableBillingJobs.mockResolvedValue([]);
  pause.mockResolvedValue({
    ok: false,
    written: false,
    confirmed: false,
    code: "writes_disabled",
  });
});

describe("processHostingJob", () => {
  it("skippar ett gammalt pausjobb när desired blivit active igen", async () => {
    getSiteSubscriptionById
      .mockResolvedValueOnce(row("paused"))
      .mockResolvedValueOnce(row("active"));

    const result = await processHostingJob(job, new Date("2026-09-15T12:00:00.000Z"));

    expect(pause).not.toHaveBeenCalled();
    expect(updateSiteSubscription).not.toHaveBeenCalled();
    expect(result.reportSuccess).toBe(true);
    expect(updateBillingJob).toHaveBeenCalledWith(
      "job_1",
      expect.objectContaining({ status: "done", last_error: "stale_pause_after_reactivate" }),
    );
  });

  it("villkorar skrivningen på färsk desired efter provideranrop", async () => {
    getSiteSubscriptionById
      .mockResolvedValueOnce(row("paused"))
      .mockResolvedValueOnce(row("paused"))
      .mockResolvedValueOnce(row("paused"));
    pause.mockResolvedValue({
      ok: false,
      written: false,
      confirmed: false,
      code: "provider_error",
    });

    await processHostingJob(job, new Date("2026-09-15T12:00:00.000Z"));

    expect(updateSiteSubscription).toHaveBeenCalledWith(
      "sub_1",
      "test",
      expect.objectContaining({ hosting_state_actual: "pausing" }),
      { expectedDesired: "paused" },
    );
  });
});

function pendingRow(createdAt: Date) {
  return {
    id: "sub_1",
    billing_mode: "test" as const,
    project_id: "prj_a",
    user_id: "user_1",
    lifecycle_state: "checkout_pending",
    stripe_checkout_session_id: "cs_1",
    stripe_subscription_id: null,
    current_period_end: null,
    created_at: createdAt,
  };
}

describe("repairPendingCheckoutClaim", () => {
  const now = new Date("2026-09-15T12:00:00.000Z");

  it("aktiverar stale complete-session via samma fulfill-väg", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      status: "complete",
      expires_at: Math.floor(now.getTime() / 1000) - 3600,
      subscription: "sub_stripe",
    });
    fulfillPaidSubscriptionRow
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

    const first = await repairPendingCheckoutClaim({
      stripe: { checkout: { sessions: { retrieve } } } as never,
      row: pendingRow(new Date("2026-09-15T11:00:00.000Z")) as never,
      now,
    });
    const second = await repairPendingCheckoutClaim({
      stripe: { checkout: { sessions: { retrieve } } } as never,
      row: pendingRow(new Date("2026-09-15T11:00:00.000Z")) as never,
      now,
    });

    expect(first).toMatchObject({ action: "activate", granted: true });
    expect(second).toMatchObject({ action: "activate", granted: false });
    expect(fulfillPaidSubscriptionRow).toHaveBeenCalledTimes(2);
    expect(fulfillPaidSubscriptionRow).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeSubscriptionId: "sub_stripe",
        row: expect.objectContaining({ id: "sub_1" }),
      }),
    );
  });

  it("släpper expired anspråk bakom lifecycle-guard", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      status: "expired",
      expires_at: Math.floor(now.getTime() / 1000) - 60,
      subscription: null,
    });
    getBillingCustomer.mockResolvedValue({ stripe_customer_id: "cus_1" });
    const list = vi.fn().mockResolvedValue({ data: [] });
    updateSiteSubscription.mockResolvedValue({ id: "sub_1", lifecycle_state: "ended" });

    const result = await repairPendingCheckoutClaim({
      stripe: {
        checkout: { sessions: { retrieve } },
        subscriptions: { list },
      } as never,
      row: pendingRow(new Date("2026-09-15T11:00:00.000Z")) as never,
      now,
    });

    expect(result).toEqual({ action: "end_claim", reason: "session_expired" });
    expect(fulfillPaidSubscriptionRow).not.toHaveBeenCalled();
    expect(updateSiteSubscription).toHaveBeenCalledWith(
      "sub_1",
      "test",
      expect.objectContaining({ lifecycle_state: "ended", ended_reason: "checkout_expired" }),
      { expectedLifecycle: "checkout_pending" },
    );
  });

  it("tolkar Stripe-retrieve-fel som okänt, inte saknad session", async () => {
    const retrieve = vi.fn().mockRejectedValue(new Error("stripe_timeout"));

    const result = await repairPendingCheckoutClaim({
      stripe: { checkout: { sessions: { retrieve } } } as never,
      row: pendingRow(new Date("2026-09-15T11:00:00.000Z")) as never,
      now,
    });

    expect(result).toEqual({ action: "leave", reason: "session_unreachable" });
    expect(fulfillPaidSubscriptionRow).not.toHaveBeenCalled();
    expect(updateSiteSubscription).not.toHaveBeenCalled();
  });

  it("rör inte ett färskt pending-anspråk", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      status: "complete",
      subscription: "sub_stripe",
    });

    const result = await repairPendingCheckoutClaim({
      stripe: { checkout: { sessions: { retrieve } } } as never,
      row: pendingRow(new Date("2026-09-15T11:50:00.000Z")) as never,
      now,
    });

    expect(result).toEqual({ action: "leave", reason: "too_fresh" });
    expect(fulfillPaidSubscriptionRow).not.toHaveBeenCalled();
    expect(updateSiteSubscription).not.toHaveBeenCalled();
  });

  it("hittar subscription via kund+metadata när sessionen saknar id", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      status: "complete",
      subscription: null,
    });
    getBillingCustomer.mockResolvedValue({ stripe_customer_id: "cus_1" });
    const list = vi.fn().mockResolvedValue({
      data: [
        {
          id: "sub_found",
          metadata: { kind: "site_subscription", projectId: "prj_a", userId: "user_1" },
        },
      ],
    });
    fulfillPaidSubscriptionRow.mockResolvedValue({
      granted: true,
      status: "simulated",
      reason: "test_simulated",
    });

    const result = await repairPendingCheckoutClaim({
      stripe: {
        checkout: { sessions: { retrieve } },
        subscriptions: { list },
      } as never,
      row: pendingRow(new Date("2026-09-15T11:00:00.000Z")) as never,
      now,
    });

    expect(result).toMatchObject({ action: "activate", reason: "session_complete" });
    expect(fulfillPaidSubscriptionRow).toHaveBeenCalledWith(
      expect.objectContaining({ stripeSubscriptionId: "sub_found" }),
    );
  });

  it("släpper inte anspråk när kundlistan mot Stripe failar", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      status: "expired",
      subscription: null,
    });
    getBillingCustomer.mockResolvedValue({ stripe_customer_id: "cus_1" });
    const list = vi.fn().mockRejectedValue(new Error("stripe_5xx"));

    const result = await repairPendingCheckoutClaim({
      stripe: {
        checkout: { sessions: { retrieve } },
        subscriptions: { list },
      } as never,
      row: pendingRow(new Date("2026-09-15T11:00:00.000Z")) as never,
      now,
    });

    expect(result).toEqual({ action: "leave", reason: "session_unreachable" });
    expect(updateSiteSubscription).not.toHaveBeenCalled();
  });

  it("märker complete utan subscription-id efter operatorgräns", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      status: "complete",
      subscription: null,
    });
    updateSiteSubscription.mockResolvedValue({ id: "sub_1" });

    const result = await repairPendingCheckoutClaim({
      stripe: { checkout: { sessions: { retrieve } } } as never,
      row: pendingRow(new Date("2026-09-14T12:00:00.000Z")) as never,
      now,
    });

    expect(result).toEqual({ action: "leave", reason: "operator_attention" });
    expect(updateSiteSubscription).toHaveBeenCalledWith(
      "sub_1",
      "test",
      { stripe_status: "operator_attention" },
      { expectedLifecycle: "checkout_pending" },
    );
  });
});

describe("reconcileSiteSubscriptions", () => {
  it("villkorar desired/lifecycle-skrivningen mot senast lästa rad", async () => {
    const updatedAt = new Date("2026-09-15T11:00:00.000Z");
    listSubscriptionsNeedingReconcile.mockResolvedValue([
      {
        id: "sub_1",
        billing_mode: "test",
        lifecycle_state: "active",
        hosting_state_desired: "active",
        hosting_state_actual: "active",
        grace_until: null,
        current_period_end: new Date("2026-09-15T11:00:00.000Z"),
        cancel_at_period_end: true,
        stripe_status: "canceled",
        updated_at: updatedAt,
        ended_reason: null,
        ended_at: null,
      },
    ]);
    updateSiteSubscription.mockResolvedValue(null);

    const result = await reconcileSiteSubscriptions({
      billingMode: "test",
      now: new Date("2026-09-15T12:00:00.000Z"),
    });

    expect(updateSiteSubscription).toHaveBeenCalledWith(
      "sub_1",
      "test",
      expect.objectContaining({
        hosting_state_desired: "paused",
        lifecycle_state: "ended",
      }),
      {
        expectedDesired: "active",
        expectedLifecycle: "active",
        expectedUpdatedAt: updatedAt,
      },
    );
    expect(result.pauses).toBe(0);
  });
});
