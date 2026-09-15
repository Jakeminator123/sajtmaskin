import { describe, expect, it } from "vitest";
import {
  applyHostingProviderResult,
  billingModeFromLivemode,
  buildPeriodId,
  decideCheckoutReuse,
  decideReconcileAction,
  evaluateSitePublishEntitlement,
  eventMatchesServerBillingMode,
  isPlatformVercelProject,
  shouldApplyPaymentFailed,
  shouldGrantPeriodCredits,
} from "./site-subscription-policy";

const now = new Date("2026-09-15T12:00:00.000Z");

describe("test/live-isolering", () => {
  it("avvisar testevent mot live-server och tvärtom", () => {
    expect(eventMatchesServerBillingMode(false, "live")).toBe(false);
    expect(eventMatchesServerBillingMode(true, "test")).toBe(false);
    expect(eventMatchesServerBillingMode(false, "test")).toBe(true);
    expect(eventMatchesServerBillingMode(true, "live")).toBe(true);
    expect(eventMatchesServerBillingMode(false, null)).toBe(false);
    expect(billingModeFromLivemode(false)).toBe("test");
    expect(billingModeFromLivemode(true)).toBe("live");
  });
});

describe("två samtidiga checkouts", () => {
  it("återanvänder en öppen session i stället för att skapa en till", () => {
    expect(
      decideCheckoutReuse({
        openRow: {
          id: "sub_1",
          projectId: "prj_a",
          userId: "user_1",
          billingMode: "test",
          lifecycleState: "checkout_pending",
          stripeCheckoutSessionId: "cs_open",
          stripeStatus: null,
        },
        session: {
          id: "cs_open",
          status: "open",
          url: "https://checkout.stripe.com/cs_open",
          expiresAt: new Date("2026-09-15T13:00:00.000Z"),
        },
        now,
      }),
    ).toEqual({
      action: "reuse_session",
      sessionId: "cs_open",
      url: "https://checkout.stripe.com/cs_open",
    });
  });

  it("väntar när anspråket finns men sessionen inte skrivits än", () => {
    expect(
      decideCheckoutReuse({
        openRow: {
          id: "sub_1",
          projectId: "prj_a",
          userId: "user_1",
          billingMode: "test",
          lifecycleState: "checkout_pending",
          stripeCheckoutSessionId: null,
          stripeStatus: null,
        },
        session: null,
        now,
      }),
    ).toEqual({ action: "wait_for_session", existingId: "sub_1" });
  });

  it("ersätter utgången session och nekar redan aktiv", () => {
    expect(
      decideCheckoutReuse({
        openRow: {
          id: "sub_1",
          projectId: "prj_a",
          userId: "user_1",
          billingMode: "test",
          lifecycleState: "checkout_pending",
          stripeCheckoutSessionId: "cs_old",
          stripeStatus: null,
        },
        session: {
          id: "cs_old",
          status: "expired",
          url: null,
          expiresAt: new Date("2026-09-15T11:00:00.000Z"),
        },
        now,
      }),
    ).toEqual({ action: "replace_expired", existingId: "sub_1" });

    expect(
      decideCheckoutReuse({
        openRow: {
          id: "sub_1",
          projectId: "prj_a",
          userId: "user_1",
          billingMode: "test",
          lifecycleState: "active",
          stripeCheckoutSessionId: "cs_paid",
          stripeStatus: "active",
        },
        session: null,
        now,
      }),
    ).toEqual({ action: "already_active", existingId: "sub_1" });
  });
});

describe("periodförmån och dubbletter", () => {
  it("ger credits en gång per period och hoppar proration", () => {
    expect(buildPeriodId(1_726_401_600)).toBe("p1726401600");
    expect(
      shouldGrantPeriodCredits({
        billingReason: "subscription_cycle",
        periodId: "p1726401600",
        alreadyGranted: false,
      }),
    ).toEqual({ grant: true, reason: "new_paid_period" });
    expect(
      shouldGrantPeriodCredits({
        billingReason: "subscription_cycle",
        periodId: "p1726401600",
        alreadyGranted: true,
      }),
    ).toEqual({ grant: false, reason: "already_granted" });
    expect(
      shouldGrantPeriodCredits({
        billingReason: "subscription_update",
        periodId: "p1726401600",
        alreadyGranted: false,
      }),
    ).toEqual({ grant: false, reason: "not_cycle_invoice" });
  });
});

describe("omkastade events och payment_failed efter paid", () => {
  it("ignorerar stale payment_failed när senaste fakturan är betald", () => {
    expect(
      shouldApplyPaymentFailed({ stripeStatus: "past_due", latestInvoicePaid: true }),
    ).toBe(false);
    expect(
      shouldApplyPaymentFailed({ stripeStatus: "active", latestInvoicePaid: false }),
    ).toBe(false);
    expect(
      shouldApplyPaymentFailed({ stripeStatus: "past_due", latestInvoicePaid: false }),
    ).toBe(true);
  });
});

describe("uppsägning vid periodslut och respit dag 7", () => {
  it("håller sajten live under respit och pausar först efter grace_until", () => {
    const duringGrace = decideReconcileAction({
      now,
      lifecycleState: "active",
      hostingDesired: "grace",
      hostingActual: "active",
      graceUntil: new Date("2026-09-22T12:00:00.000Z"),
      currentPeriodEnd: new Date("2026-10-15T12:00:00.000Z"),
      cancelAtPeriodEnd: false,
      stripeStatus: "past_due",
    });
    expect(duringGrace).toMatchObject({
      desired: "grace",
      enqueuePause: false,
      reason: "no_change",
    });

    const afterGrace = decideReconcileAction({
      now: new Date("2026-09-22T12:00:01.000Z"),
      lifecycleState: "active",
      hostingDesired: "grace",
      hostingActual: "active",
      graceUntil: new Date("2026-09-22T12:00:00.000Z"),
      currentPeriodEnd: new Date("2026-10-15T12:00:00.000Z"),
      cancelAtPeriodEnd: false,
      stripeStatus: "past_due",
    });
    expect(afterGrace).toMatchObject({
      desired: "paused",
      enqueuePause: true,
      reason: "grace_expired",
    });
  });

  it("pausar efter cancel-at-period-end när perioden är slut", () => {
    expect(
      decideReconcileAction({
        now,
        lifecycleState: "active",
        hostingDesired: "active",
        hostingActual: "active",
        graceUntil: null,
        currentPeriodEnd: new Date("2026-09-15T11:00:00.000Z"),
        cancelAtPeriodEnd: true,
        stripeStatus: "active",
      }),
    ).toMatchObject({
      desired: "paused",
      enqueuePause: true,
      endLifecycle: true,
      reason: "period_ended_after_cancel",
    });
  });
});

describe("providerfel och återställning", () => {
  it("rapporterar inte paus som lyckad vid providerfel", () => {
    const failed = applyHostingProviderResult({
      kind: "pause",
      desired: "paused",
      now,
      retentionDays: 90,
      lastPublishedRef: "dpl:abc",
      provider: { ok: false, written: false, confirmed: false, code: "provider_error" },
    });
    expect(failed.reportSuccess).toBe(false);
    expect(failed.actual).toBe("pausing");
    expect(failed.jobStatus).toBe("failed");
  });

  it("skriver inte över senare betalt tillstånd med ett gammalt pausjobb", () => {
    const skipped = applyHostingProviderResult({
      kind: "pause",
      desired: "active",
      now,
      retentionDays: 90,
      lastPublishedRef: "dpl:abc",
      provider: { ok: true, written: true, confirmed: true },
    });
    expect(skipped.actual).toBe("active");
    expect(skipped.jobStatus).toBe("done");
  });

  it("återställer bara senast publicerad version, aldrig utkast", () => {
    const missing = applyHostingProviderResult({
      kind: "resume",
      desired: "active",
      now,
      retentionDays: 90,
      lastPublishedRef: null,
      provider: { ok: true, written: true, confirmed: true },
    });
    expect(missing.reportSuccess).toBe(false);
    expect(missing.actual).toBe("paused");

    const restored = applyHostingProviderResult({
      kind: "resume",
      desired: "active",
      now,
      retentionDays: 90,
      lastPublishedRef: "dpl:published",
      provider: { ok: true, written: true, confirmed: true },
    });
    expect(restored.actual).toBe("active");
    expect(restored.reportSuccess).toBe(true);
  });
});

describe("en aktiv sajt låser inte upp en annan", () => {
  it("avvisar fel projectId och grandfatherar saknad rad", () => {
    expect(
      evaluateSitePublishEntitlement({
        projectId: "prj_b",
        rowProjectId: "prj_a",
        billingMode: "test",
        rowBillingMode: "test",
        lifecycleState: "active",
        hostingDesired: "active",
        now,
        enforce: false,
      }),
    ).toMatchObject({ entitled: false, waiveDeployFee: false, reason: "wrong_project" });

    expect(
      evaluateSitePublishEntitlement({
        projectId: "prj_a",
        billingMode: "test",
        now,
        enforce: false,
      }),
    ).toMatchObject({ entitled: true, waiveDeployFee: false, reason: "grandfathered" });

    expect(
      evaluateSitePublishEntitlement({
        projectId: "prj_a",
        rowProjectId: "prj_a",
        billingMode: "test",
        rowBillingMode: "live",
        lifecycleState: "active",
        hostingDesired: "active",
        now,
        enforce: false,
      }),
    ).toMatchObject({ reason: "wrong_mode", entitled: false });
  });

  it("waivar deploy-avgift bara för den sajtens giltiga abonnemang", () => {
    expect(
      evaluateSitePublishEntitlement({
        projectId: "prj_a",
        rowProjectId: "prj_a",
        billingMode: "test",
        rowBillingMode: "test",
        lifecycleState: "active",
        hostingDesired: "active",
        currentPeriodEnd: new Date("2026-10-15T12:00:00.000Z"),
        now,
        enforce: false,
      }),
    ).toMatchObject({ entitled: true, waiveDeployFee: true, reason: "valid_subscription" });
  });
});

describe("plattformens eget projekt", () => {
  it("får aldrig väljas som pausmål", () => {
    expect(isPlatformVercelProject("prj_platform", "prj_platform")).toBe(true);
    expect(isPlatformVercelProject("prj_customer", "prj_platform")).toBe(false);
  });
});
