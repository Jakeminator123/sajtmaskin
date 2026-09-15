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

  it("lämnar inte ut orphan-URL när attach förloras och vinnarens uppslagning failar", async () => {
    getOpenSiteSubscription
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ ...pendingClaim, stripe_checkout_session_id: "cs_winner" });
    insertCheckoutClaim.mockResolvedValue(pendingClaim);
    updateSiteSubscription.mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue({
      id: "cs_orphan",
      url: "https://checkout.stripe.com/cs_orphan",
    });
    const retrieve = vi.fn().mockRejectedValue(new Error("stripe_timeout"));
    const expire = vi.fn().mockResolvedValue({});

    const result = await startSiteSubscriptionCheckout({
      stripe: { checkout: { sessions: { create, retrieve, expire } } } as never,
      userId: "user_1",
      email: "a@b.se",
      projectId: "prj_a",
      billingMode: "test",
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "En checkout pågår redan. Försök igen om en stund.",
      code: "checkout_in_progress",
    });
    expect(JSON.stringify(result)).not.toContain("cs_orphan");
    expect(expire).toHaveBeenCalledWith("cs_orphan");
  });

  it("returnerar bara vinnarens session när attach förloras och uppslagningen lyckas", async () => {
    getOpenSiteSubscription
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ ...pendingClaim, stripe_checkout_session_id: "cs_winner" });
    insertCheckoutClaim.mockResolvedValue(pendingClaim);
    updateSiteSubscription.mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue({
      id: "cs_orphan",
      url: "https://checkout.stripe.com/cs_orphan",
    });
    const retrieve = vi.fn().mockResolvedValue({
      id: "cs_winner",
      status: "open",
      url: "https://checkout.stripe.com/cs_winner",
    });
    const expire = vi.fn().mockResolvedValue({});

    const result = await startSiteSubscriptionCheckout({
      stripe: { checkout: { sessions: { create, retrieve, expire } } } as never,
      userId: "user_1",
      email: "a@b.se",
      projectId: "prj_a",
      billingMode: "test",
    });

    expect(result).toEqual({
      ok: true,
      sessionId: "cs_winner",
      url: "https://checkout.stripe.com/cs_winner",
      reused: true,
    });
    expect(JSON.stringify(result)).not.toContain("cs_orphan");
    expect(expire).toHaveBeenCalledWith("cs_orphan");
  });

  it("lyckas med vinnarens URL även om expire kastar", async () => {
    getOpenSiteSubscription
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ ...pendingClaim, stripe_checkout_session_id: "cs_winner" });
    insertCheckoutClaim.mockResolvedValue(pendingClaim);
    updateSiteSubscription.mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue({
      id: "cs_orphan",
      url: "https://checkout.stripe.com/cs_orphan",
    });
    const retrieve = vi.fn().mockResolvedValue({
      id: "cs_winner",
      status: "open",
      url: "https://checkout.stripe.com/cs_winner",
    });
    const expire = vi.fn().mockRejectedValue(new Error("expire_failed"));

    const result = await startSiteSubscriptionCheckout({
      stripe: { checkout: { sessions: { create, retrieve, expire } } } as never,
      userId: "user_1",
      email: "a@b.se",
      projectId: "prj_a",
      billingMode: "test",
    });

    expect(result).toEqual({
      ok: true,
      sessionId: "cs_winner",
      url: "https://checkout.stripe.com/cs_winner",
      reused: true,
    });
    expect(expire).toHaveBeenCalledWith("cs_orphan");
  });
});
