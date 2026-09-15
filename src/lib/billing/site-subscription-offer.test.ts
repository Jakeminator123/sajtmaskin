import { describe, expect, it } from "vitest";
import {
  SITE_SUBSCRIPTION_ACTIVATION_NOT_READY,
  SITE_SUBSCRIPTION_CHECKOUT_ACTIVATED,
  SITE_SUBSCRIPTION_KIND,
  SITE_SUBSCRIPTION_PRICE_REF,
  buildSiteSubscriptionCheckoutMetadata,
  buildSiteSubscriptionOffer,
  buildSiteSubscriptionOpenClaimKey,
  evaluateSiteSubscriptionOpenClaim,
  isOpenSiteSubscriptionLifecycle,
  isSiteSubscriptionCheckoutActivated,
  resolveServerBillingMode,
} from "./site-subscription-offer";

describe("resolveServerBillingMode", () => {
  it("läser live från betrodd sk_live_-nyckel", () => {
    expect(resolveServerBillingMode("sk_live_abc")).toBe("live");
  });

  it("läser test från betrodd sk_test_-nyckel", () => {
    expect(resolveServerBillingMode("sk_test_abc")).toBe("test");
  });

  it("returnerar null när nyckeln saknas eller är okänd", () => {
    expect(resolveServerBillingMode("")).toBeNull();
    expect(resolveServerBillingMode("rk_live_restricted")).toBeNull();
    expect(resolveServerBillingMode(undefined)).toBeNull();
  });
});

describe("isSiteSubscriptionCheckoutActivated", () => {
  it("förblir stängd oavsett request-flaggor", () => {
    expect(SITE_SUBSCRIPTION_CHECKOUT_ACTIVATED).toBe(false);
    expect(isSiteSubscriptionCheckoutActivated()).toBe(false);
    expect(
      isSiteSubscriptionCheckoutActivated({
        activate: true,
        activation: true,
        enabled: true,
        billing_mode: "live",
        amount: 1,
      }),
    ).toBe(false);
  });
});

describe("buildSiteSubscriptionOffer", () => {
  it("äger läge och märker kommersiella villkor som proposal/not_ratified", () => {
    const offer = buildSiteSubscriptionOffer("test");

    expect(offer).toEqual({
      kind: SITE_SUBSCRIPTION_KIND,
      billing_mode: "test",
      price_ref: SITE_SUBSCRIPTION_PRICE_REF,
      commercial_terms: {
        status: "not_ratified",
        ratification: "proposal",
      },
      activation: {
        ready: false,
        code: SITE_SUBSCRIPTION_ACTIVATION_NOT_READY,
      },
    });
    expect(offer.price_ref.startsWith("proposal:")).toBe(true);
    expect(JSON.stringify(offer)).not.toMatch(/\b(7|90)\b/);
  });
});

describe("buildSiteSubscriptionCheckoutMetadata", () => {
  it("bygger framtida session-metadata utan att vara en Stripe-payload", () => {
    expect(
      buildSiteSubscriptionCheckoutMetadata({
        projectId: "proj_1",
        userId: "user_1",
        billingMode: "test",
      }),
    ).toEqual({
      kind: "site_subscription",
      projectId: "proj_1",
      userId: "user_1",
      billing_mode: "test",
      price_ref: SITE_SUBSCRIPTION_PRICE_REF,
    });
  });
});

describe("evaluateSiteSubscriptionOpenClaim", () => {
  it("bygger samma open_claim_key som D1-schemat", () => {
    expect(buildSiteSubscriptionOpenClaimKey("live", "prj_a")).toBe("live:prj_a");
    expect(isOpenSiteSubscriptionLifecycle("checkout_pending")).toBe(true);
    expect(isOpenSiteSubscriptionLifecycle("active")).toBe(true);
    expect(isOpenSiteSubscriptionLifecycle("ended")).toBe(false);
  });

  it("tillåter ett nytt anspråk när sloten är fri", () => {
    expect(
      evaluateSiteSubscriptionOpenClaim({
        projectId: "prj_a",
        billingMode: "test",
        openRows: [
          { projectId: "prj_a", billingMode: "test", lifecycleState: "ended" },
          { projectId: "prj_a", billingMode: "live", lifecycleState: "active" },
        ],
      }),
    ).toEqual({
      ok: true,
      code: "claim_available",
      openClaimKey: "test:prj_a",
    });
  });

  it("nekar ett andra öppet anspråk på samma projekt+läge", () => {
    expect(
      evaluateSiteSubscriptionOpenClaim({
        projectId: "prj_a",
        billingMode: "test",
        openRows: [
          { projectId: "prj_a", billingMode: "test", lifecycleState: "checkout_pending" },
        ],
      }),
    ).toEqual({
      ok: false,
      code: "open_claim_exists",
      openClaimKey: "test:prj_a",
    });
  });

  it("avvisar tomt projectId", () => {
    expect(
      evaluateSiteSubscriptionOpenClaim({ projectId: "  ", billingMode: "test" }),
    ).toEqual({
      ok: false,
      code: "invalid_claim_input",
      openClaimKey: null,
    });
  });
});
