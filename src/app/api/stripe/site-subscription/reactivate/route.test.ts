import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getProjectByIdForOwner = vi.hoisted(() => vi.fn());
const getOpenSiteSubscription = vi.hoisted(() => vi.fn());
const updateSiteSubscription = vi.hoisted(() => vi.fn());
const updateCancelAtPeriodEnd = vi.hoisted(() => vi.fn());
const retrieveSubscriptionFresh = vi.hoisted(() => vi.fn());
const isLatestInvoicePaid = vi.hoisted(() => vi.fn());
const enqueueHostingJob = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_request: Request, _bucket: string, handler: () => Promise<Response>) =>
    handler(),
}));
vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/db/services/projects", () => ({ getProjectByIdForOwner }));
vi.mock("@/lib/db/services/site-subscriptions", () => ({
  getOpenSiteSubscription,
  updateSiteSubscription,
}));
vi.mock("@/lib/billing/site-subscription-portal", () => ({ updateCancelAtPeriodEnd }));
vi.mock("@/lib/billing/site-subscription-reconcile", () => ({ enqueueHostingJob }));
vi.mock("@/lib/billing/site-subscription-stripe", () => ({
  retrieveSubscriptionFresh,
  isLatestInvoicePaid,
}));
vi.mock("@/lib/billing/site-subscription-offer", () => ({
  resolveServerBillingMode: () => "test",
}));
vi.mock("@/lib/config", () => ({
  SECRETS: { stripeSecretKey: "sk_test_x" },
}));
vi.mock("stripe", () => ({
  default: class FakeStripe {},
}));

const { POST } = await import("./route");

function post(projectId = "prj_a"): NextRequest {
  return new NextRequest("http://localhost/api/stripe/site-subscription/reactivate", {
    method: "POST",
    body: JSON.stringify({ projectId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "user_1" });
  getProjectByIdForOwner.mockResolvedValue({ id: "prj_a" });
  getOpenSiteSubscription.mockResolvedValue({
    id: "sub_1",
    user_id: "user_1",
    stripe_subscription_id: "sub_stripe",
    cancel_at_period_end: true,
    stripe_status: "past_due",
    grace_until: null,
    hosting_state_actual: "paused",
    hosting_state_desired: "paused",
  });
  isLatestInvoicePaid.mockReturnValue(false);
  retrieveSubscriptionFresh.mockResolvedValue({ status: "past_due" });
});

describe("POST /api/stripe/site-subscription/reactivate", () => {
  it("avvisar utan betalning innan Stripe uncancel", async () => {
    const response = await POST(post());
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.code).toBe("needs_payment");
    expect(updateCancelAtPeriodEnd).not.toHaveBeenCalled();
    expect(enqueueHostingJob).not.toHaveBeenCalled();
  });

  it("avbeställer uppsägning först efter att perioden är betald", async () => {
    retrieveSubscriptionFresh.mockResolvedValue({ status: "active" });
    isLatestInvoicePaid.mockReturnValue(true);

    const response = await POST(post());
    expect(response.status).toBe(200);
    expect(updateCancelAtPeriodEnd).toHaveBeenCalledWith(
      expect.objectContaining({ stripeSubscriptionId: "sub_stripe", cancel: false }),
    );
  });
});
