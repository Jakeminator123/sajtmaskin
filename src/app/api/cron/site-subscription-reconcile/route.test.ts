import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const isCronRefreshAuthorized = vi.hoisted(() => vi.fn());
const isSiteSubscriptionCheckoutReady = vi.hoisted(() => vi.fn());
const reconcileSiteSubscriptions = vi.hoisted(() => vi.fn());
const resolveServerBillingMode = vi.hoisted(() => vi.fn());

vi.mock("@/app/api/shadcn/registry/refresh/cron-auth", () => ({
  isCronRefreshAuthorized,
}));
vi.mock("@/lib/billing/site-subscription-flags", () => ({
  isSiteSubscriptionCheckoutReady,
}));
vi.mock("@/lib/billing/site-subscription-reconcile", () => ({
  reconcileSiteSubscriptions,
}));
vi.mock("@/lib/billing/site-subscription-offer", () => ({
  resolveServerBillingMode,
}));
vi.mock("@/lib/config", () => ({
  SECRETS: { stripeSecretKey: "sk_test_x" },
}));

const { GET } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  isCronRefreshAuthorized.mockReturnValue(true);
  resolveServerBillingMode.mockReturnValue("test");
  isSiteSubscriptionCheckoutReady.mockReturnValue(false);
});

describe("GET /api/cron/site-subscription-reconcile", () => {
  it("skriver inte när feature-flaggorna är av", async () => {
    const response = await GET(new NextRequest("http://localhost/api/cron/site-subscription-reconcile"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("feature_off");
    expect(reconcileSiteSubscriptions).not.toHaveBeenCalled();
  });

  it("kör inte avstämning mot live även om env är på", async () => {
    resolveServerBillingMode.mockReturnValue("live");
    isSiteSubscriptionCheckoutReady.mockReturnValue(false);
    const response = await GET(new NextRequest("http://localhost/api/cron/site-subscription-reconcile"));
    const body = await response.json();
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("live_closed");
    expect(reconcileSiteSubscriptions).not.toHaveBeenCalled();
  });
});
