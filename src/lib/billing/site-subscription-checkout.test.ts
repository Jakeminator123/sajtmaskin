import { beforeEach, describe, expect, it, vi } from "vitest";

const getOpenSiteSubscription = vi.hoisted(() => vi.fn());
const insertCheckoutClaim = vi.hoisted(() => vi.fn());
const updateSiteSubscription = vi.hoisted(() => vi.fn());
const getOrCreateBillingCustomer = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/site-subscriptions", () => ({
  getOpenSiteSubscription,
  insertCheckoutClaim,
  updateSiteSubscription,
}));

vi.mock("./site-subscription-customer", () => ({
  getOrCreateBillingCustomer,
}));

vi.mock("@/lib/config", () => ({
  URLS: { baseUrl: "https://sajtmaskin.se" },
}));

const { startSiteSubscriptionCheckout } = await import("./site-subscription-checkout");

const pendingClaim = {
  id: "sub_1",
  user_id: "user_1",
  project_id: "prj_a",
  billing_mode: "test" as const,
  lifecycle_state: "checkout_pending",
  stripe_checkout_session_id: null,
  stripe_subscription_id: null,
  stripe_status: null,
};

function stripeCreate(create: ReturnType<typeof vi.fn>) {
  return {
    checkout: { sessions: { create, retrieve: vi.fn() } },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getOrCreateBillingCustomer.mockResolvedValue({
    id: "cus_row",
    stripeCustomerId: "cus_stripe",
  });
  updateSiteSubscription.mockImplementation(async (_id, _mode, patch) => ({
    ...pendingClaim,
    ...patch,
  }));
});

describe("startSiteSubscriptionCheckout", () => {
  it("skapar en Stripe-session för ett färskt claim utan session-id", async () => {
    getOpenSiteSubscription.mockResolvedValue(null);
    insertCheckoutClaim.mockResolvedValue(pendingClaim);
    const create = vi.fn().mockResolvedValue({
      id: "cs_new",
      url: "https://checkout.stripe.com/cs_new",
    });

    const result = await startSiteSubscriptionCheckout({
      stripe: stripeCreate(create) as never,
      userId: "user_1",
      email: "a@b.se",
      projectId: "prj_a",
      billingMode: "test",
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ mode: "subscription" }));
    expect(result).toEqual({
      ok: true,
      sessionId: "cs_new",
      url: "https://checkout.stripe.com/cs_new",
      reused: false,
    });
    expect(updateSiteSubscription).toHaveBeenCalledWith(
      "sub_1",
      "test",
      { stripe_checkout_session_id: "cs_new" },
      { expectedEmptyCheckoutSession: true },
    );
  });

  it("väntar på den andra fliken i stället för att skapa direkt", async () => {
    getOpenSiteSubscription
      .mockResolvedValueOnce(pendingClaim)
      .mockResolvedValue({
        ...pendingClaim,
        stripe_checkout_session_id: "cs_other",
      });
    const create = vi.fn();
    const retrieve = vi.fn().mockResolvedValue({
      id: "cs_other",
      status: "open",
      url: "https://checkout.stripe.com/cs_other",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });

    const result = await startSiteSubscriptionCheckout({
      stripe: { checkout: { sessions: { create, retrieve } } } as never,
      userId: "user_1",
      email: "a@b.se",
      projectId: "prj_a",
      billingMode: "test",
    });

    expect(create).not.toHaveBeenCalled();
    expect(insertCheckoutClaim).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      sessionId: "cs_other",
      url: "https://checkout.stripe.com/cs_other",
      reused: true,
    });
  });
});
