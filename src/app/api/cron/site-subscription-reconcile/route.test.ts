import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const isCronRefreshAuthorized = vi.hoisted(() => vi.fn());
const isSiteSubscriptionCheckoutEnvEnabled = vi.hoisted(() => vi.fn());
const isSiteSubscriptionHostingWritesEnabled = vi.hoisted(() => vi.fn());
const reconcileSiteSubscriptions = vi.hoisted(() => vi.fn());

vi.mock("@/app/api/shadcn/registry/refresh/cron-auth", () => ({
  isCronRefreshAuthorized,
}));
vi.mock("@/lib/billing/site-subscription-flags", () => ({
  isSiteSubscriptionCheckoutEnvEnabled,
  isSiteSubscriptionHostingWritesEnabled,
}));
vi.mock("@/lib/billing/site-subscription-reconcile", () => ({
  reconcileSiteSubscriptions,
}));
vi.mock("@/lib/billing/site-subscription-offer", () => ({
  resolveServerBillingMode: () => "test",
}));
vi.mock("@/lib/config", () => ({
  SECRETS: { stripeSecretKey: "sk_test_x" },
}));

const { GET } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  isCronRefreshAuthorized.mockReturnValue(true);
  isSiteSubscriptionCheckoutEnvEnabled.mockReturnValue(false);
  isSiteSubscriptionHostingWritesEnabled.mockReturnValue(false);
});

describe("GET /api/cron/site-subscription-reconcile", () => {
  it("skriver inte när feature-flaggorna är av", async () => {
    const response = await GET(new NextRequest("http://localhost/api/cron/site-subscription-reconcile"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.skipped).toBe(true);
    expect(reconcileSiteSubscriptions).not.toHaveBeenCalled();
  });
});
