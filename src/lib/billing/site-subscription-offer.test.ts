import { describe, expect, it } from "vitest";
import {
  SITE_SUBSCRIPTION_ACTIVATION_NOT_READY,
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
  it("förblir stängd som default oavsett request-flaggor", () => {
    const env = {};
    expect(isSiteSubscriptionCheckoutActivated(undefined, "test", env)).toBe(false);
    expect(
      isSiteSubscriptionCheckoutActivated(
        {
          activate: true,
          activation: true,
          enabled: true,
          billing_mode: "live",
          amount: 1,
        },
        "test",
        env,
      ),
    ).toBe(false);
  });

  it("öppnar bara testläge när env är på", () => {
    const env = { SAJTMASKIN_SITE_SUBSCRIPTION_CHECKOUT: "1" };
    expect(isSiteSubscriptionCheckoutActivated({}, "test", env)).toBe(true);
    expect(isSiteSubscriptionCheckoutActivated({}, "live", env)).toBe(false);
  });
});

describe("buildSiteSubscriptionOffer", () => {
  it("äger läge och märker kommersiella villkor som proposal/not_ratified", () => {
    const offer = buildSiteSubscriptionOffer("test", {});

    expect(offer.kind).toBe(SITE_SUBSCRIPTION_KIND);
    expect(offer.billing_mode).toBe("test");
    expect(offer.price_ref).toBe(SITE_SUBSCRIPTION_PRICE_REF);
    expect(offer.commercial_terms.status).toBe("not_ratified");
    expect(offer.commercial_terms.ratification).toBe("proposal");
    expect(offer.activation).toEqual({
      ready: false,
      code: SITE_SUBSCRIPTION_ACTIVATION_NOT_READY,
    });
    expect(offer.price_ref.startsWith("proposal:")).toBe(true);
    expect(offer.commercial_terms.grace_days).toBe(7);
    expect(offer.commercial_terms.retention_days).toBe(90);
  });

  it("sätter ready i test när env är på, men inte i live", () => {
    const env = { SAJTMASKIN_SITE_SUBSCRIPTION_CHECKOUT: "true" };
    expect(buildSiteSubscriptionOffer("test", env).activation.ready).toBe(true);
    expect(buildSiteSubscriptionOffer("live", env).activation.ready).toBe(false);
    expect(buildSiteSubscriptionOffer("live", env).activation.live_closed).toBe(true);
  });
});

describe("buildSiteSubscriptionCheckoutMetadata", () => {
  it("bygger session-metadata utan klientbelopp", () => {
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
