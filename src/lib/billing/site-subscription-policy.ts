/**
 * Rena livscykelbeslut för sajt-abonnemang. Ingen I/O.
 * Klocka och Stripe-objekt skickas in så testerna kan styra tid och ordning.
 */

import type { BillingMode } from "@/lib/db/schema";
import { addCalendarDays } from "./site-subscription-config";

export type SiteSubscriptionLifecycleState = "checkout_pending" | "active" | "ended";
export type HostingDesiredState = "active" | "grace" | "paused";
export type HostingActualState = "active" | "pausing" | "paused" | "resuming";

export type CheckoutSessionSnapshot = {
  id: string;
  status: "open" | "complete" | "expired" | string;
  url: string | null;
  expiresAt: Date | null;
  subscriptionId?: string | null;
};

/**
 * Stripe svarade (`reached`/`absent`) eller var onåbar (`unreachable`).
 * De två får aldrig kollapsas — onåbar är inte «sessionen finns inte».
 */
export type CheckoutSessionLookup =
  | { lookup: "reached"; session: CheckoutSessionSnapshot }
  | { lookup: "absent" }
  | { lookup: "unreachable" };

export type CheckoutClaimClassification = {
  paid: boolean;
  known: boolean;
  unpaidExpired: boolean;
  subscriptionId: string | null;
};

export type CheckoutSessionLookupKind = CheckoutSessionLookup["lookup"];

export type CheckoutReuseDecision =
  | { action: "create_new" }
  | { action: "reuse_session"; sessionId: string; url: string | null }
  | { action: "replace_expired"; existingId: string }
  | { action: "already_active"; existingId: string; confirming: boolean }
  | { action: "wait_for_session"; existingId: string };

export type OpenSubscriptionSnapshot = {
  id: string;
  projectId: string;
  userId: string;
  billingMode: BillingMode;
  lifecycleState: SiteSubscriptionLifecycleState;
  stripeCheckoutSessionId: string | null;
  stripeStatus: string | null;
  stripeSubscriptionId?: string | null;
};

export function eventMatchesServerBillingMode(
  eventLivemode: boolean,
  serverMode: BillingMode | null,
): boolean {
  if (!serverMode) return false;
  return eventLivemode ? serverMode === "live" : serverMode === "test";
}

export function billingModeFromLivemode(livemode: boolean): BillingMode {
  return livemode ? "live" : "test";
}

export function buildPeriodId(periodStartUnix: number): string {
  if (!Number.isInteger(periodStartUnix) || periodStartUnix <= 0) {
    throw new Error("period_start saknas");
  }
  return `p${periodStartUnix}`;
}

export function isPeriodGrantBillingReason(reason: string | null | undefined): boolean {
  return reason === "subscription_create" || reason === "subscription_cycle";
}

export function shouldGrantPeriodCredits(input: {
  billingReason: string | null | undefined;
  periodId: string | null;
  alreadyGranted: boolean;
}): { grant: boolean; reason: string } {
  if (input.alreadyGranted) {
    return { grant: false, reason: "already_granted" };
  }
  if (!input.periodId) {
    return { grant: false, reason: "missing_period" };
  }
  if (!isPeriodGrantBillingReason(input.billingReason ?? null)) {
    return { grant: false, reason: "not_cycle_invoice" };
  }
  return { grant: true, reason: "new_paid_period" };
}

export function shouldApplyPaymentFailed(current: {
  stripeStatus: string | null;
  latestInvoicePaid: boolean;
}): boolean {
  if (current.latestInvoicePaid) return false;
  if (current.stripeStatus === "active" || current.stripeStatus === "trialing") {
    return false;
  }
  return true;
}

export function checkoutSessionLookupFrom(
  session: CheckoutSessionSnapshot | null | undefined,
  lookup?: CheckoutSessionLookupKind,
): CheckoutSessionLookup {
  if (lookup === "unreachable") return { lookup: "unreachable" };
  if (lookup === "absent") return { lookup: "absent" };
  if (session) return { lookup: "reached", session };
  return { lookup: "unreachable" };
}

function sessionIsExpired(session: CheckoutSessionSnapshot, now: Date): boolean {
  return (
    session.status === "expired" ||
    (session.status === "open" &&
      session.expiresAt !== null &&
      session.expiresAt.getTime() <= now.getTime())
  );
}

/**
 * Gemensam sanning: är anspråket betalt, och visste vi det från Stripe?
 * Både checkout-reuse och stale-repair måste gå hit — aldrig tolka om.
 */
export function classifyCheckoutClaim(input: {
  now: Date;
  lookup: CheckoutSessionLookup;
  rowSubscriptionId?: string | null;
}): CheckoutClaimClassification {
  const rowSubscriptionId = input.rowSubscriptionId ?? null;

  if (input.lookup.lookup === "unreachable") {
    return {
      paid: Boolean(rowSubscriptionId),
      known: false,
      unpaidExpired: false,
      subscriptionId: rowSubscriptionId,
    };
  }

  if (input.lookup.lookup === "absent") {
    return {
      paid: Boolean(rowSubscriptionId),
      known: true,
      unpaidExpired: !rowSubscriptionId,
      subscriptionId: rowSubscriptionId,
    };
  }

  const session = input.lookup.session;
  const subscriptionId = session.subscriptionId ?? rowSubscriptionId;
  const paid = Boolean(subscriptionId) || session.status === "complete";
  const expired = sessionIsExpired(session, input.now);

  return {
    paid,
    known: true,
    unpaidExpired: expired && !paid,
    subscriptionId,
  };
}

export function decideCheckoutReuse(input: {
  openRow: OpenSubscriptionSnapshot | null;
  session: CheckoutSessionSnapshot | null;
  lookup?: CheckoutSessionLookupKind;
  now: Date;
}): CheckoutReuseDecision {
  const row = input.openRow;
  if (!row) return { action: "create_new" };

  if (row.lifecycleState === "active") {
    return { action: "already_active", existingId: row.id, confirming: false };
  }

  if (row.lifecycleState === "ended") {
    return { action: "create_new" };
  }

  if (!row.stripeCheckoutSessionId && input.lookup !== "absent") {
    return { action: "wait_for_session", existingId: row.id };
  }

  const lookup = checkoutSessionLookupFrom(input.session, input.lookup);
  if (lookup.lookup === "unreachable") {
    return { action: "wait_for_session", existingId: row.id };
  }

  const claim = classifyCheckoutClaim({
    now: input.now,
    lookup,
    rowSubscriptionId: row.stripeSubscriptionId,
  });

  if (claim.paid) {
    return {
      action: "already_active",
      existingId: row.id,
      confirming: row.lifecycleState === "checkout_pending",
    };
  }

  if (claim.unpaidExpired) {
    return { action: "replace_expired", existingId: row.id };
  }

  if (lookup.lookup === "reached" && lookup.session.status === "open") {
    return {
      action: "reuse_session",
      sessionId: lookup.session.id,
      url: lookup.session.url,
    };
  }

  return { action: "wait_for_session", existingId: row.id };
}

export type PendingCheckoutSessionSnapshot = {
  status: string;
  expiresAt: Date | null;
  subscriptionId: string | null;
};

export type PendingCheckoutRepairDecision =
  | { action: "activate"; reason: "session_complete" | "paid_without_period" }
  | { action: "end_claim"; reason: "session_expired" | "session_missing" }
  | {
      action: "leave";
      reason:
        | "too_fresh"
        | "session_open"
        | "complete_without_subscription"
        | "session_unreachable"
        | "operator_attention"
        | "not_pending";
    };

/**
 * Reparerar ett stale checkout-anspråk. Ingen I/O — sessionen är redan hämtad.
 * Hosting-tillstånd beslutas av `decideReconcileAction`, inte här.
 */
export function decidePendingCheckoutRepair(input: {
  now: Date;
  createdAt: Date;
  thresholdMinutes: number;
  operatorThresholdMinutes?: number;
  lifecycleState: SiteSubscriptionLifecycleState;
  currentPeriodEnd?: Date | null;
  stripeSubscriptionId?: string | null;
  session: PendingCheckoutSessionSnapshot | null;
  lookup?: CheckoutSessionLookupKind;
}): PendingCheckoutRepairDecision {
  const lookup = checkoutSessionLookupFrom(
    input.session
      ? {
          id: "session",
          url: null,
          status: input.session.status,
          expiresAt: input.session.expiresAt,
          subscriptionId: input.session.subscriptionId,
        }
      : null,
    input.lookup,
  );
  const claim = classifyCheckoutClaim({
    now: input.now,
    lookup,
    rowSubscriptionId: input.stripeSubscriptionId,
  });

  if (input.lifecycleState === "active") {
    if (!input.currentPeriodEnd && claim.subscriptionId) {
      return { action: "activate", reason: "paid_without_period" };
    }
    return { action: "leave", reason: "not_pending" };
  }

  if (input.lifecycleState !== "checkout_pending") {
    return { action: "leave", reason: "not_pending" };
  }

  const ageMs = input.now.getTime() - input.createdAt.getTime();
  if (ageMs < input.thresholdMinutes * 60_000) {
    return { action: "leave", reason: "too_fresh" };
  }

  if (!claim.known) {
    return { action: "leave", reason: "session_unreachable" };
  }

  if (claim.paid && claim.subscriptionId) {
    return { action: "activate", reason: "session_complete" };
  }

  if (claim.paid) {
    const operatorMs = (input.operatorThresholdMinutes ?? input.thresholdMinutes * 18) * 60_000;
    if (ageMs >= operatorMs) {
      return { action: "leave", reason: "operator_attention" };
    }
    return { action: "leave", reason: "complete_without_subscription" };
  }

  if (claim.unpaidExpired) {
    return {
      action: "end_claim",
      reason: lookup.lookup === "absent" ? "session_missing" : "session_expired",
    };
  }

  return { action: "leave", reason: "session_open" };
}

export function computeGraceUntil(now: Date, graceDays: number): Date {
  return addCalendarDays(now, graceDays);
}

export function computeRetainUntil(pausedAt: Date, retentionDays: number): Date {
  return addCalendarDays(pausedAt, retentionDays);
}

export function isGraceActive(graceUntil: Date | null, now: Date): boolean {
  return Boolean(graceUntil && graceUntil.getTime() > now.getTime());
}

export type PublishEntitlement = {
  entitled: boolean;
  waiveDeployFee: boolean;
  reason:
    | "grandfathered"
    | "valid_subscription"
    | "grace"
    | "paused"
    | "ended"
    | "checkout_pending"
    | "wrong_project"
    | "wrong_mode"
    | "missing_mode";
  graceActive: boolean;
};

/**
 * Publiceringsrätt för EN sajt. En aktiv sajt låser aldrig upp en annan.
 * Saknad rad pausar inte — övergångspolicyn är grandfathered tills enforce.
 */
export function evaluateSitePublishEntitlement(input: {
  projectId: string;
  rowProjectId?: string | null;
  billingMode: BillingMode | null;
  rowBillingMode?: BillingMode | null;
  lifecycleState?: SiteSubscriptionLifecycleState | null;
  hostingDesired?: HostingDesiredState | null;
  hostingActual?: HostingActualState | null;
  graceUntil?: Date | null;
  currentPeriodEnd?: Date | null;
  now: Date;
  enforce: boolean;
}): PublishEntitlement {
  if (!input.billingMode) {
    return {
      entitled: false,
      waiveDeployFee: false,
      reason: "missing_mode",
      graceActive: false,
    };
  }

  if (!input.lifecycleState) {
    return {
      entitled: !input.enforce,
      waiveDeployFee: false,
      reason: "grandfathered",
      graceActive: false,
    };
  }

  if (input.rowProjectId && input.rowProjectId !== input.projectId) {
    return {
      entitled: false,
      waiveDeployFee: false,
      reason: "wrong_project",
      graceActive: false,
    };
  }

  if (input.rowBillingMode && input.rowBillingMode !== input.billingMode) {
    return {
      entitled: false,
      waiveDeployFee: false,
      reason: "wrong_mode",
      graceActive: false,
    };
  }

  const graceActive = isGraceActive(input.graceUntil ?? null, input.now);

  if (input.lifecycleState === "checkout_pending") {
    return {
      entitled: !input.enforce,
      waiveDeployFee: false,
      reason: "checkout_pending",
      graceActive,
    };
  }

  if (input.lifecycleState === "ended") {
    return {
      entitled: false,
      waiveDeployFee: false,
      reason: "ended",
      graceActive: false,
    };
  }

  if (input.hostingDesired === "paused" && !graceActive) {
    return {
      entitled: false,
      waiveDeployFee: false,
      reason: "paused",
      graceActive: false,
    };
  }

  if (graceActive || input.hostingDesired === "grace") {
    return {
      entitled: true,
      waiveDeployFee: true,
      reason: "grace",
      graceActive: true,
    };
  }

  const periodValid =
    Boolean(input.currentPeriodEnd) &&
    input.currentPeriodEnd!.getTime() > input.now.getTime();

  if (input.lifecycleState === "active" && periodValid) {
    return {
      entitled: true,
      waiveDeployFee: true,
      reason: "valid_subscription",
      graceActive: false,
    };
  }

  return {
    entitled: false,
    waiveDeployFee: false,
    reason: "ended",
    graceActive: false,
  };
}

export type ReconcileDecision = {
  desired: HostingDesiredState;
  enqueuePause: boolean;
  enqueueResume: boolean;
  endLifecycle: boolean;
  reason: string;
};

/**
 * Tidsstyrd avstämning. En webhook dag 0 sätter bara grace_until —
 * den här funktionen avgör dag 7. past_due ensamt pausar inte.
 */
export function decideReconcileAction(input: {
  now: Date;
  lifecycleState: SiteSubscriptionLifecycleState;
  hostingDesired: HostingDesiredState;
  hostingActual: HostingActualState;
  graceUntil: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeStatus: string | null;
}): ReconcileDecision {
  if (input.lifecycleState === "checkout_pending") {
    return {
      desired: input.hostingDesired,
      enqueuePause: false,
      enqueueResume: false,
      endLifecycle: false,
      reason: "checkout_pending",
    };
  }

  const graceActive = isGraceActive(input.graceUntil, input.now);
  const periodEnded =
    input.currentPeriodEnd !== null && input.currentPeriodEnd.getTime() <= input.now.getTime();

  if (input.lifecycleState === "ended" || (input.cancelAtPeriodEnd && periodEnded)) {
    return {
      desired: "paused",
      enqueuePause: input.hostingActual !== "paused" && input.hostingActual !== "pausing",
      enqueueResume: false,
      endLifecycle: input.lifecycleState !== "ended",
      reason: input.lifecycleState === "ended" ? "already_ended" : "period_ended_after_cancel",
    };
  }

  if (input.hostingDesired === "grace" && !graceActive) {
    return {
      desired: "paused",
      enqueuePause: input.hostingActual !== "paused" && input.hostingActual !== "pausing",
      enqueueResume: false,
      endLifecycle: false,
      reason: "grace_expired",
    };
  }

  if (input.hostingDesired === "active" && input.hostingActual === "paused") {
    return {
      desired: "active",
      enqueuePause: false,
      enqueueResume: true,
      endLifecycle: false,
      reason: "restore_after_paid",
    };
  }

  if (input.hostingDesired === "paused" && input.hostingActual !== "paused") {
    return {
      desired: "paused",
      enqueuePause: input.hostingActual !== "pausing",
      enqueueResume: false,
      endLifecycle: false,
      reason: "desired_paused",
    };
  }

  void input.stripeStatus;
  return {
    desired: input.hostingDesired,
    enqueuePause: false,
    enqueueResume: false,
    endLifecycle: false,
    reason: "no_change",
  };
}

export type HostingJobApplyResult = {
  actual: HostingActualState;
  jobStatus: "pending" | "running" | "done" | "failed";
  pausedAt: Date | null;
  resumedAt: Date | null;
  retainUntil: Date | null;
  reportSuccess: boolean;
};

/**
 * Providerfel får aldrig bokföras som lyckad paus.
 * Ett senare betalt/återaktiverat desired=active vinner över ett gammalt pausjobb.
 */
export function applyHostingProviderResult(input: {
  kind: "pause" | "resume";
  desired: HostingDesiredState;
  now: Date;
  retentionDays: number;
  lastPublishedRef: string | null;
  provider: {
    ok: boolean;
    written: boolean;
    confirmed: boolean;
    code?: string;
  };
}): HostingJobApplyResult {
  if (input.kind === "pause" && input.desired === "active") {
    return {
      actual: "active",
      jobStatus: "done",
      pausedAt: null,
      resumedAt: null,
      retainUntil: null,
      reportSuccess: true,
    };
  }

  if (input.kind === "resume" && input.desired === "paused") {
    return {
      actual: "paused",
      jobStatus: "done",
      pausedAt: null,
      resumedAt: null,
      retainUntil: null,
      reportSuccess: true,
    };
  }

  if (input.kind === "resume" && !input.lastPublishedRef) {
    return {
      actual: "paused",
      jobStatus: "failed",
      pausedAt: null,
      resumedAt: null,
      retainUntil: null,
      reportSuccess: false,
    };
  }

  if (!input.provider.ok || !input.provider.confirmed) {
    return {
      actual: input.kind === "pause" ? "pausing" : "resuming",
      jobStatus: input.provider.code === "writes_disabled" ? "pending" : "failed",
      pausedAt: null,
      resumedAt: null,
      retainUntil: null,
      reportSuccess: false,
    };
  }

  if (input.kind === "pause") {
    return {
      actual: "paused",
      jobStatus: "done",
      pausedAt: input.now,
      resumedAt: null,
      retainUntil: computeRetainUntil(input.now, input.retentionDays),
      reportSuccess: true,
    };
  }

  return {
    actual: "active",
    jobStatus: "done",
    pausedAt: null,
    resumedAt: input.now,
    retainUntil: null,
    reportSuccess: true,
  };
}

export function isPlatformVercelProject(
  targetProjectId: string | null | undefined,
  platformProjectId: string | null | undefined,
): boolean {
  const target = targetProjectId?.trim();
  const platform = platformProjectId?.trim();
  if (!platform) return true;
  if (!target) return false;
  return target === platform;
}
