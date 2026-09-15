import { describe, expect, it } from "vitest";
import { SITE_SUBSCRIPTION_COMMERCIAL_DEFAULTS } from "./site-subscription-config";
import {
  applyHostingProviderResult,
  billingModeFromLivemode,
  buildPeriodId,
  classifyCheckoutClaim,
  decideCheckoutReuse,
  decidePendingCheckoutRepair,
  decideReconcileAction,
  evaluateSitePublishEntitlement,
  eventMatchesServerBillingMode,
  isPlatformVercelProject,
  shouldApplyPaidSubscription,
  shouldApplyPaymentFailed,
  shouldFulfillEndedRow,
  shouldGrantPeriodCredits,
  shouldPauseHostingAfterSubscriptionDeleted,
  shouldRetainPaidLifecycleAfterDelete,
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

  it("skapar session när den här requesten just skapade det tomma anspråket", () => {
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
        allowCreateWithoutSession: true,
        now,
      }),
    ).toEqual({ action: "create_new" });
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
    ).toEqual({ action: "already_active", existingId: "sub_1", confirming: false });
  });

  it("håller complete-session som paid utan invoice.paid så reuse inte skapar ny", () => {
    expect(
      classifyCheckoutClaim({
        now,
        lookup: {
          lookup: "reached",
          session: {
            id: "cs_complete",
            status: "complete",
            url: null,
            expiresAt: new Date("2026-09-15T11:00:00.000Z"),
            subscriptionId: null,
          },
        },
      }),
    ).toMatchObject({ paid: true, known: true });
    expect(
      decideCheckoutReuse({
        openRow: {
          id: "sub_1",
          projectId: "prj_a",
          userId: "user_1",
          billingMode: "test",
          lifecycleState: "checkout_pending",
          stripeCheckoutSessionId: "cs_complete",
          stripeStatus: null,
        },
        session: {
          id: "cs_complete",
          status: "complete",
          url: null,
          expiresAt: new Date("2026-09-15T11:00:00.000Z"),
        },
        now,
      }),
    ).toEqual({ action: "already_active", existingId: "sub_1", confirming: true });
  });

  it("behandlar complete + checkout_pending som anspråkad, inte utgången", () => {
    expect(
      decideCheckoutReuse({
        openRow: {
          id: "sub_1",
          projectId: "prj_a",
          userId: "user_1",
          billingMode: "test",
          lifecycleState: "checkout_pending",
          stripeCheckoutSessionId: "cs_paid",
          stripeStatus: null,
        },
        session: {
          id: "cs_paid",
          status: "complete",
          url: null,
          expiresAt: new Date("2026-09-15T11:00:00.000Z"),
        },
        now,
      }),
    ).toEqual({ action: "already_active", existingId: "sub_1", confirming: true });
  });

  it("behandlar expired + subscriptionId som betalt, inte utgången", () => {
    expect(
      decideCheckoutReuse({
        openRow: {
          id: "sub_1",
          projectId: "prj_a",
          userId: "user_1",
          billingMode: "test",
          lifecycleState: "checkout_pending",
          stripeCheckoutSessionId: "cs_paid",
          stripeStatus: null,
        },
        session: {
          id: "cs_paid",
          status: "expired",
          url: null,
          expiresAt: new Date("2026-09-15T11:00:00.000Z"),
          subscriptionId: "sub_stripe",
        },
        now,
      }),
    ).toEqual({ action: "already_active", existingId: "sub_1", confirming: true });
  });

  it("väntar när Stripe är onåbar i stället för att släppa anspråket", () => {
    expect(
      decideCheckoutReuse({
        openRow: {
          id: "sub_1",
          projectId: "prj_a",
          userId: "user_1",
          billingMode: "test",
          lifecycleState: "checkout_pending",
          stripeCheckoutSessionId: "cs_1",
          stripeStatus: null,
        },
        session: null,
        lookup: "unreachable",
        now,
      }),
    ).toEqual({ action: "wait_for_session", existingId: "sub_1" });
  });
});

describe("stale checkout-reparation", () => {
  const threshold = SITE_SUBSCRIPTION_COMMERCIAL_DEFAULTS.pendingCheckoutRepairMinutes;
  const createdAt = new Date("2026-09-15T11:00:00.000Z");

  it("aktiverar complete session med subscription efter tröskeln", () => {
    expect(
      decidePendingCheckoutRepair({
        now,
        createdAt,
        thresholdMinutes: threshold,
        lifecycleState: "checkout_pending",
        session: { status: "complete", expiresAt: createdAt, subscriptionId: "sub_stripe" },
      }),
    ).toEqual({ action: "activate", reason: "session_complete" });
  });

  it("släpper expired session så ny checkout kan skapas", () => {
    expect(
      decidePendingCheckoutRepair({
        now,
        createdAt,
        thresholdMinutes: threshold,
        lifecycleState: "checkout_pending",
        session: { status: "expired", expiresAt: createdAt, subscriptionId: null },
      }),
    ).toEqual({ action: "end_claim", reason: "session_expired" });
    expect(
      decideCheckoutReuse({
        openRow: null,
        session: null,
        now,
      }),
    ).toEqual({ action: "create_new" });
  });

  it("lämnar anspråk inom tröskeln orörda", () => {
    expect(
      decidePendingCheckoutRepair({
        now,
        createdAt: new Date("2026-09-15T11:50:00.000Z"),
        thresholdMinutes: threshold,
        lifecycleState: "checkout_pending",
        session: { status: "complete", expiresAt: null, subscriptionId: "sub_stripe" },
      }),
    ).toEqual({ action: "leave", reason: "too_fresh" });
  });

  it("lämnar öppen giltig session och saknad subscription på complete", () => {
    expect(
      decidePendingCheckoutRepair({
        now,
        createdAt,
        thresholdMinutes: threshold,
        lifecycleState: "checkout_pending",
        session: {
          status: "open",
          expiresAt: new Date("2026-09-15T13:00:00.000Z"),
          subscriptionId: null,
        },
      }),
    ).toEqual({ action: "leave", reason: "session_open" });
    expect(
      decidePendingCheckoutRepair({
        now,
        createdAt,
        thresholdMinutes: threshold,
        lifecycleState: "checkout_pending",
        session: { status: "complete", expiresAt: null, subscriptionId: null },
      }),
    ).toEqual({ action: "leave", reason: "complete_without_subscription" });
  });

  it("avslutar saknad session efter tröskeln", () => {
    expect(
      decidePendingCheckoutRepair({
        now,
        createdAt,
        thresholdMinutes: threshold,
        lifecycleState: "checkout_pending",
        session: null,
        lookup: "absent",
      }),
    ).toEqual({ action: "end_claim", reason: "session_missing" });
  });

  it("lämnar onåbar Stripe-retrieve orörd", () => {
    expect(
      decidePendingCheckoutRepair({
        now,
        createdAt,
        thresholdMinutes: threshold,
        lifecycleState: "checkout_pending",
        session: null,
        lookup: "unreachable",
      }),
    ).toEqual({ action: "leave", reason: "session_unreachable" });
  });

  it("aktiverar expired + subscriptionId och signalerar complete utan id efter operatorgräns", () => {
    expect(
      decidePendingCheckoutRepair({
        now,
        createdAt,
        thresholdMinutes: threshold,
        lifecycleState: "checkout_pending",
        session: { status: "expired", expiresAt: createdAt, subscriptionId: "sub_stripe" },
      }),
    ).toEqual({ action: "activate", reason: "session_complete" });
    expect(
      decidePendingCheckoutRepair({
        now,
        createdAt: new Date("2026-09-14T12:00:00.000Z"),
        thresholdMinutes: threshold,
        operatorThresholdMinutes: 360,
        lifecycleState: "checkout_pending",
        session: { status: "complete", expiresAt: null, subscriptionId: null },
      }),
    ).toEqual({ action: "leave", reason: "operator_attention" });
  });
});

describe("gemensam checkout-klassificering", () => {
  const pendingRow = {
    id: "sub_1",
    projectId: "prj_a",
    userId: "user_1",
    billingMode: "test" as const,
    lifecycleState: "checkout_pending" as const,
    stripeCheckoutSessionId: "cs_1",
    stripeStatus: null,
  };
  const createdAt = new Date("2026-09-15T11:00:00.000Z");
  const threshold = SITE_SUBSCRIPTION_COMMERCIAL_DEFAULTS.pendingCheckoutRepairMinutes;

  it("låter reuse och repair inte divergera för samma Stripe-tillstånd", () => {
    const cases: Array<{
      session: {
        id: string;
        status: string;
        url: string | null;
        expiresAt: Date | null;
        subscriptionId: string | null;
      } | null;
      lookup?: "reached" | "absent" | "unreachable";
    }> = [
      {
        session: {
          id: "cs_1",
          status: "expired",
          url: null,
          expiresAt: createdAt,
          subscriptionId: "sub_stripe",
        },
      },
      { session: null, lookup: "unreachable" },
      {
        session: {
          id: "cs_1",
          status: "complete",
          url: null,
          expiresAt: createdAt,
          subscriptionId: "sub_stripe",
        },
      },
      {
        session: {
          id: "cs_1",
          status: "expired",
          url: null,
          expiresAt: createdAt,
          subscriptionId: null,
        },
      },
      { session: null, lookup: "absent" },
      {
        session: {
          id: "cs_1",
          status: "complete",
          url: null,
          expiresAt: null,
          subscriptionId: null,
        },
      },
    ];

    for (const fixture of cases) {
      const classifiedLookup = fixture.session
        ? { lookup: "reached" as const, session: fixture.session }
        : fixture.lookup === "absent"
          ? { lookup: "absent" as const }
          : { lookup: "unreachable" as const };
      const lookup = classifyCheckoutClaim({
        now,
        lookup: classifiedLookup,
        rowSubscriptionId: null,
      });
      const reuse = decideCheckoutReuse({
        openRow: pendingRow,
        session: fixture.session,
        lookup: fixture.lookup,
        now,
      });
      const repair = decidePendingCheckoutRepair({
        now,
        createdAt,
        thresholdMinutes: threshold,
        lifecycleState: "checkout_pending",
        session: fixture.session
          ? {
              status: fixture.session.status,
              expiresAt: fixture.session.expiresAt,
              subscriptionId: fixture.session.subscriptionId,
            }
          : null,
        lookup: fixture.lookup,
      });

      if (lookup.paid) {
        expect(reuse.action, `paid reuse ${JSON.stringify(fixture)}`).toBe("already_active");
        expect(repair.action, `paid repair ${JSON.stringify(fixture)}`).not.toBe("end_claim");
      }
      if (!lookup.known) {
        expect(reuse.action, `unknown reuse ${JSON.stringify(fixture)}`).toBe("wait_for_session");
        expect(repair.action, `unknown repair ${JSON.stringify(fixture)}`).toBe("leave");
        expect(repair.reason).toBe("session_unreachable");
      }
      if (lookup.unpaidExpired) {
        expect(reuse.action, `unpaid reuse ${JSON.stringify(fixture)}`).toBe("replace_expired");
        expect(repair.action, `unpaid repair ${JSON.stringify(fixture)}`).toBe("end_claim");
      }
    }
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

  it("låter inte ett gammalt invoice.paid återöppna ett uppsagt abonnemang", () => {
    expect(
      shouldApplyPaidSubscription({
        stripeStatus: "canceled",
        invoicePeriodEnd: new Date("2026-09-15T12:00:00.000Z"),
        knownPeriodEnd: new Date("2026-09-15T12:00:00.000Z"),
      }),
    ).toEqual({ apply: false, reason: "subscription_terminal" });
    expect(
      shouldApplyPaidSubscription({
        stripeStatus: "active",
        invoicePeriodEnd: new Date("2026-08-15T12:00:00.000Z"),
        knownPeriodEnd: new Date("2026-09-15T12:00:00.000Z"),
      }),
    ).toEqual({ apply: false, reason: "stale_invoice_period" });
    expect(
      shouldApplyPaidSubscription({
        stripeStatus: "active",
        invoicePeriodEnd: new Date("2026-10-15T12:00:00.000Z"),
        knownPeriodEnd: new Date("2026-10-15T12:00:00.000Z"),
      }),
    ).toEqual({ apply: true, reason: "current_payment" });
    expect(shouldApplyPaidSubscription({ stripeStatus: "incomplete" })).toEqual({
      apply: false,
      reason: "subscription_unpaid",
    });
    expect(shouldApplyPaidSubscription({ stripeStatus: "unpaid" })).toEqual({
      apply: false,
      reason: "subscription_unpaid",
    });
    expect(
      shouldApplyPaidSubscription({
        stripeStatus: "incomplete",
        invoicePaid: true,
      }),
    ).toEqual({ apply: true, reason: "current_payment" });
    expect(
      shouldApplyPaidSubscription({
        stripeStatus: "past_due",
        invoicePeriodEnd: new Date("2026-10-15T12:00:00.000Z"),
        knownPeriodEnd: new Date("2026-10-15T12:00:00.000Z"),
      }),
    ).toEqual({ apply: true, reason: "current_payment" });
  });
});

describe("subscription.deleted mot lifecycle", () => {
  const futureEnd = new Date("2026-10-15T12:00:00.000Z");
  const pastEnd = new Date("2026-09-15T11:00:00.000Z");

  it("promoverar inte checkout_pending till active även med framtida period", () => {
    expect(
      shouldRetainPaidLifecycleAfterDelete({
        lifecycleState: "checkout_pending",
        currentPeriodEnd: futureEnd,
        now,
      }),
    ).toBe(false);
  });

  it("behåller redan betald active medan perioden finns kvar", () => {
    expect(
      shouldRetainPaidLifecycleAfterDelete({
        lifecycleState: "active",
        currentPeriodEnd: futureEnd,
        now,
      }),
    ).toBe(true);
  });

  it("avslutar active när perioden är slut", () => {
    expect(
      shouldRetainPaidLifecycleAfterDelete({
        lifecycleState: "active",
        currentPeriodEnd: pastEnd,
        now,
      }),
    ).toBe(false);
  });

  it("köar pause bara för tidigare active, inte pending", () => {
    expect(
      shouldPauseHostingAfterSubscriptionDeleted({
        lifecycleState: "checkout_pending",
        stillPaid: false,
      }),
    ).toBe(false);
    expect(
      shouldPauseHostingAfterSubscriptionDeleted({
        lifecycleState: "active",
        stillPaid: true,
      }),
    ).toBe(false);
    expect(
      shouldPauseHostingAfterSubscriptionDeleted({
        lifecycleState: "active",
        stillPaid: false,
      }),
    ).toBe(true);
  });
});

describe("ended + fulfill", () => {
  it("återöppnar inte subscription_deleted eller user_canceled", () => {
    expect(
      shouldFulfillEndedRow({
        lifecycleState: "ended",
        endedReason: "subscription_deleted",
        invoicePaid: true,
      }),
    ).toEqual({ apply: false, reason: "ended_terminal" });
    expect(
      shouldFulfillEndedRow({
        lifecycleState: "ended",
        endedReason: "user_canceled",
        invoicePaid: true,
      }),
    ).toEqual({ apply: false, reason: "ended_terminal" });
  });

  it("låter checkout_expired + paid invoice reparera, inte unpaid", () => {
    expect(
      shouldFulfillEndedRow({
        lifecycleState: "ended",
        endedReason: "checkout_expired",
        invoicePaid: true,
      }),
    ).toEqual({ apply: true, reason: "repair_expired_paid" });
    expect(
      shouldFulfillEndedRow({
        lifecycleState: "ended",
        endedReason: "checkout_expired",
        invoicePaid: false,
      }),
    ).toEqual({ apply: false, reason: "ended_terminal" });
  });

  it("lämnar checkout_pending och active till de vanliga grindarna", () => {
    expect(
      shouldFulfillEndedRow({
        lifecycleState: "checkout_pending",
        endedReason: null,
        invoicePaid: true,
      }),
    ).toEqual({ apply: true, reason: "not_ended" });
    expect(
      shouldFulfillEndedRow({
        lifecycleState: "active",
        endedReason: null,
        invoicePaid: true,
      }),
    ).toEqual({ apply: true, reason: "not_ended" });
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

    expect(
      evaluateSitePublishEntitlement({
        projectId: "prj_a",
        rowProjectId: "prj_a",
        billingMode: "test",
        rowBillingMode: "test",
        lifecycleState: "active",
        hostingDesired: "active",
        now,
        enforce: true,
      }),
    ).toMatchObject({ entitled: false, waiveDeployFee: false });
  });

  it("ger inte publiceringsrätt åt checkout_pending", () => {
    expect(
      evaluateSitePublishEntitlement({
        projectId: "prj_a",
        rowProjectId: "prj_a",
        billingMode: "test",
        rowBillingMode: "test",
        lifecycleState: "checkout_pending",
        hostingDesired: "active",
        now,
        enforce: true,
      }),
    ).toMatchObject({
      entitled: false,
      waiveDeployFee: false,
      reason: "checkout_pending",
    });
  });
});

describe("plattformens eget projekt", () => {
  it("får aldrig väljas som pausmål", () => {
    expect(isPlatformVercelProject("prj_platform", "prj_platform")).toBe(true);
    expect(isPlatformVercelProject("prj_customer", "prj_platform")).toBe(false);
    expect(isPlatformVercelProject("prj_customer", null)).toBe(true);
    expect(isPlatformVercelProject("prj_customer", "")).toBe(true);
  });
});
