import type Stripe from "stripe";
import type { BillingMode } from "@/lib/db/schema";
import { getProjectById } from "@/lib/db/services/projects";
import {
  claimRunnableBillingJob,
  getBillingCustomer,
  getOpenBillingJob,
  getSiteSubscriptionById,
  insertBillingJob,
  listRunnableBillingJobs,
  listSubscriptionsNeedingReconcile,
  updateBillingJob,
  updateSiteSubscription,
  type BillingJobRow,
  type SiteSubscriptionRow,
} from "@/lib/db/services/site-subscriptions";
import { SITE_SUBSCRIPTION_COMMERCIAL_DEFAULTS } from "./site-subscription-config";
import { isUniqueViolation } from "./site-subscription-errors";
import { getSiteHostingProvider, type HostingTarget } from "./site-subscription-hosting";
import {
  applyHostingProviderResult,
  decidePendingCheckoutRepair,
  decideReconcileAction,
  type CheckoutSessionLookupKind,
  type HostingActualState,
  type HostingDesiredState,
  type SiteSubscriptionLifecycleState,
} from "./site-subscription-policy";
import {
  findSiteSubscriptionIdForProject,
  isStripeResourceMissing,
  readStripeId,
} from "./site-subscription-stripe";

export async function enqueueHostingJob(input: {
  subscriptionId: string;
  billingMode: BillingMode;
  kind: "pause" | "resume";
}): Promise<void> {
  const existing = await getOpenBillingJob(input.subscriptionId, input.kind);
  if (existing) return;
  try {
    await insertBillingJob(input);
  } catch (error) {
    if (!isUniqueViolation(error, "billing_jobs_open_unique")) {
      throw error;
    }
  }
}

async function hostingTargetFor(row: SiteSubscriptionRow): Promise<HostingTarget> {
  const project = await getProjectById(row.project_id);
  return {
    projectId: row.project_id,
    vercelProjectId: project?.vercel_project_id ?? null,
    publishedRef: row.last_published_ref,
    billingMode: row.billing_mode,
  };
}

function jobMatchesDesired(
  kind: "pause" | "resume",
  desired: string,
): boolean {
  if (kind === "pause") return desired === "paused";
  return desired === "active";
}

export async function processHostingJob(
  job: BillingJobRow,
  now = new Date(),
): Promise<{ reportSuccess: boolean; actual: string }> {
  const claimed = await claimRunnableBillingJob(job.id, now, "reconcile");
  if (!claimed) {
    return { reportSuccess: false, actual: "claimed_elsewhere" };
  }

  const kind = claimed.kind === "resume" ? "resume" : "pause";
  const latestBeforeProvider = await getSiteSubscriptionById(
    claimed.subscription_id,
    claimed.billing_mode,
  );
  if (!latestBeforeProvider) {
    await updateBillingJob(claimed.id, {
      status: "failed",
      last_error: "subscription_missing",
      completed_at: now,
    });
    return { reportSuccess: false, actual: "missing" };
  }

  if (!jobMatchesDesired(kind, latestBeforeProvider.hosting_state_desired)) {
    await updateBillingJob(claimed.id, {
      status: "done",
      last_error:
        kind === "pause" ? "stale_pause_after_reactivate" : "stale_resume_after_desired_change",
      completed_at: now,
    });
    return { reportSuccess: true, actual: latestBeforeProvider.hosting_state_actual };
  }

  if (latestBeforeProvider.billing_mode === "test") {
    await updateBillingJob(claimed.id, {
      status: "done",
      last_error: "test_mode_no_provider",
      completed_at: now,
    });
    return { reportSuccess: true, actual: latestBeforeProvider.hosting_state_actual };
  }

  const provider = getSiteHostingProvider();
  const target = await hostingTargetFor(latestBeforeProvider);
  const providerResult =
    kind === "pause" ? await provider.pause(target) : await provider.restore(target);

  const fresh = await getSiteSubscriptionById(job.subscription_id, job.billing_mode);
  if (!fresh) {
    await updateBillingJob(job.id, { status: "failed", last_error: "subscription_missing", completed_at: now });
    return { reportSuccess: false, actual: "missing" };
  }

  const applied = applyHostingProviderResult({
    kind,
    desired: fresh.hosting_state_desired as HostingDesiredState,
    now,
    retentionDays: SITE_SUBSCRIPTION_COMMERCIAL_DEFAULTS.retentionDays,
    lastPublishedRef: fresh.last_published_ref,
    provider: providerResult,
  });

  const written = await updateSiteSubscription(
    fresh.id,
    fresh.billing_mode,
    {
      hosting_state_actual: applied.actual,
      paused_at: applied.pausedAt ?? fresh.paused_at,
      resumed_at: applied.resumedAt ?? fresh.resumed_at,
      retain_until: applied.retainUntil ?? fresh.retain_until,
      pause_requested_at:
        kind === "pause" && applied.actual === "pausing" ? now : fresh.pause_requested_at,
    },
    { expectedDesired: fresh.hosting_state_desired },
  );

  if (!written) {
    await updateBillingJob(job.id, {
      status: "done",
      last_error: "stale_desired_skipped",
      completed_at: now,
    });
    return { reportSuccess: false, actual: fresh.hosting_state_actual };
  }

  await updateBillingJob(job.id, {
    status: applied.jobStatus,
    provider_ref: providerResult.providerRef ?? job.provider_ref,
    last_error: providerResult.error ?? null,
    completed_at: applied.jobStatus === "done" ? now : null,
    run_after:
      applied.jobStatus === "pending" || applied.jobStatus === "failed"
        ? new Date(now.getTime() + 15 * 60_000)
        : job.run_after,
  });

  return { reportSuccess: applied.reportSuccess, actual: applied.actual };
}

async function retrieveCheckoutSessionSnapshot(
  stripe: Stripe,
  sessionId: string | null,
): Promise<{
  session: {
    status: string;
    expiresAt: Date | null;
    subscriptionId: string | null;
  } | null;
  lookup: CheckoutSessionLookupKind;
}> {
  if (!sessionId) return { session: null, lookup: "absent" };
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return {
      session: {
        status: session.status ?? "open",
        expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
        subscriptionId: readStripeId(session.subscription),
      },
      lookup: "reached",
    };
  } catch (error) {
    if (isStripeResourceMissing(error)) {
      return { session: null, lookup: "absent" };
    }
    return { session: null, lookup: "unreachable" };
  }
}

async function findProjectSubscriptionId(
  stripe: Stripe,
  row: SiteSubscriptionRow,
): Promise<{ id: string | null; known: boolean }> {
  const customer = await getBillingCustomer(row.user_id, row.billing_mode);
  if (!customer) return { id: null, known: true };
  try {
    const id = await findSiteSubscriptionIdForProject({
      stripe,
      customerId: customer.stripe_customer_id,
      projectId: row.project_id,
      userId: row.user_id,
    });
    return { id, known: true };
  } catch {
    return { id: null, known: false };
  }
}

export async function repairPendingCheckoutClaim(input: {
  stripe: Stripe;
  row: SiteSubscriptionRow;
  now?: Date;
}): Promise<{ action: string; reason: string; granted?: boolean }> {
  const now = input.now ?? new Date();
  const lookedUp = await retrieveCheckoutSessionSnapshot(
    input.stripe,
    input.row.stripe_checkout_session_id,
  );
  let session = lookedUp.session;
  let foundSubscriptionId =
    session?.subscriptionId ?? input.row.stripe_subscription_id ?? null;
  let searchKnown = true;

  if (!foundSubscriptionId && lookedUp.lookup !== "unreachable") {
    const searched = await findProjectSubscriptionId(input.stripe, input.row);
    searchKnown = searched.known;
    foundSubscriptionId = searched.id;
    if (foundSubscriptionId && session) {
      session = { ...session, subscriptionId: foundSubscriptionId };
    }
  }

  const decision = decidePendingCheckoutRepair({
    now,
    createdAt: input.row.created_at,
    thresholdMinutes: SITE_SUBSCRIPTION_COMMERCIAL_DEFAULTS.pendingCheckoutRepairMinutes,
    operatorThresholdMinutes:
      SITE_SUBSCRIPTION_COMMERCIAL_DEFAULTS.pendingCheckoutOperatorMinutes,
    lifecycleState: input.row.lifecycle_state as SiteSubscriptionLifecycleState,
    currentPeriodEnd: input.row.current_period_end,
    stripeSubscriptionId: foundSubscriptionId,
    session,
    lookup: lookedUp.lookup,
  });

  if (decision.action === "leave") {
    if (decision.reason === "operator_attention") {
      console.error("[site-subscription] operator_attention", {
        subscriptionId: input.row.id,
        projectId: input.row.project_id,
        checkoutSessionId: input.row.stripe_checkout_session_id,
        reason: "paid_session_without_subscription_id",
      });
      await updateSiteSubscription(
        input.row.id,
        input.row.billing_mode,
        { stripe_status: "operator_attention" },
        { expectedLifecycle: "checkout_pending" },
      );
    }
    return decision;
  }

  if (decision.action === "end_claim" && !searchKnown) {
    return { action: "leave", reason: "session_unreachable" };
  }

  if (decision.action === "end_claim") {
    const written = await updateSiteSubscription(
      input.row.id,
      input.row.billing_mode,
      {
        lifecycle_state: "ended",
        ended_reason: "checkout_expired",
        ended_at: now,
      },
      { expectedLifecycle: "checkout_pending" },
    );
    return {
      action: written ? "end_claim" : "leave",
      reason: written ? decision.reason : "stale_lifecycle_skipped",
    };
  }

  const stripeSubscriptionId = foundSubscriptionId ?? session?.subscriptionId;
  if (!stripeSubscriptionId) {
    return { action: "leave", reason: "complete_without_subscription" };
  }

  const { fulfillPaidSubscriptionRow } = await import("./site-subscription-webhook");
  const grant = await fulfillPaidSubscriptionRow({
    stripe: input.stripe,
    row: input.row,
    stripeSubscriptionId,
  });
  return {
    action: "activate",
    reason: decision.reason,
    granted: grant.granted,
  };
}

export async function reconcileSiteSubscriptions(input: {
  billingMode: BillingMode;
  now?: Date;
  stripe?: Stripe | null;
}): Promise<{
  scanned: number;
  pauses: number;
  resumes: number;
  jobs: number;
  repaired: number;
  released: number;
}> {
  const now = input.now ?? new Date();
  const pendingCreatedBefore = new Date(
    now.getTime() -
      SITE_SUBSCRIPTION_COMMERCIAL_DEFAULTS.pendingCheckoutRepairMinutes * 60_000,
  );
  const rows = await listSubscriptionsNeedingReconcile(input.billingMode, {
    pendingCreatedBefore,
  });
  let pauses = 0;
  let resumes = 0;
  let repaired = 0;
  let released = 0;

  for (const row of rows) {
    if (input.stripe && row.lifecycle_state === "checkout_pending") {
      const repair = await repairPendingCheckoutClaim({
        stripe: input.stripe,
        row,
        now,
      });
      if (repair.action === "activate") repaired += 1;
      if (repair.action === "end_claim") released += 1;
      continue;
    }
    if (
      input.stripe &&
      row.lifecycle_state === "active" &&
      !row.current_period_end &&
      row.stripe_subscription_id
    ) {
      const repair = await repairPendingCheckoutClaim({
        stripe: input.stripe,
        row,
        now,
      });
      if (repair.action === "activate") repaired += 1;
    }
    const decision = decideReconcileAction({
      now,
      lifecycleState: row.lifecycle_state as SiteSubscriptionLifecycleState,
      hostingDesired: row.hosting_state_desired as HostingDesiredState,
      hostingActual: row.hosting_state_actual as HostingActualState,
      graceUntil: row.grace_until,
      currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      stripeStatus: row.stripe_status,
    });

    if (decision.desired !== row.hosting_state_desired || decision.endLifecycle) {
      const written = await updateSiteSubscription(
        row.id,
        row.billing_mode,
        {
          hosting_state_desired: decision.desired,
          lifecycle_state: decision.endLifecycle ? "ended" : row.lifecycle_state,
          ended_reason: decision.endLifecycle ? "period_ended" : row.ended_reason,
          ended_at: decision.endLifecycle ? now : row.ended_at,
        },
        {
          expectedDesired: row.hosting_state_desired,
          expectedLifecycle: row.lifecycle_state,
          expectedUpdatedAt: row.updated_at,
        },
      );
      if (!written) continue;
    }

    if (decision.enqueuePause) {
      await enqueueHostingJob({
        subscriptionId: row.id,
        billingMode: row.billing_mode,
        kind: "pause",
      });
      pauses += 1;
    }
    if (decision.enqueueResume) {
      await enqueueHostingJob({
        subscriptionId: row.id,
        billingMode: row.billing_mode,
        kind: "resume",
      });
      resumes += 1;
    }
  }

  const jobs = await listRunnableBillingJobs(input.billingMode, now);
  for (const job of jobs) {
    await processHostingJob(job, now);
  }

  return { scanned: rows.length, pauses, resumes, jobs: jobs.length, repaired, released };
}
