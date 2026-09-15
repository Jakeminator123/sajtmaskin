import type { BillingMode } from "@/lib/db/schema";
import { getProjectById } from "@/lib/db/services/projects";
import {
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
  decideReconcileAction,
  type HostingActualState,
  type HostingDesiredState,
  type SiteSubscriptionLifecycleState,
} from "./site-subscription-policy";

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

export async function processHostingJob(
  job: BillingJobRow,
  now = new Date(),
): Promise<{ reportSuccess: boolean; actual: string }> {
  const row = await getSiteSubscriptionById(job.subscription_id, job.billing_mode);
  if (!row) {
    await updateBillingJob(job.id, {
      status: "failed",
      last_error: "subscription_missing",
      completed_at: now,
    });
    return { reportSuccess: false, actual: "missing" };
  }

  await updateBillingJob(job.id, {
    status: "running",
    attempts: job.attempts + 1,
    lease_owner: "reconcile",
    lease_expires_at: new Date(now.getTime() + 60_000),
  });

  const provider = getSiteHostingProvider();
  const target = await hostingTargetFor(row);
  const providerResult =
    job.kind === "pause" ? await provider.pause(target) : await provider.restore(target);

  const applied = applyHostingProviderResult({
    kind: job.kind === "resume" ? "resume" : "pause",
    desired: row.hosting_state_desired as HostingDesiredState,
    now,
    retentionDays: SITE_SUBSCRIPTION_COMMERCIAL_DEFAULTS.retentionDays,
    lastPublishedRef: row.last_published_ref,
    provider: providerResult,
  });

  await updateSiteSubscription(row.id, row.billing_mode, {
    hosting_state_actual: applied.actual,
    paused_at: applied.pausedAt ?? row.paused_at,
    resumed_at: applied.resumedAt ?? row.resumed_at,
    retain_until: applied.retainUntil ?? row.retain_until,
    pause_requested_at:
      job.kind === "pause" && applied.actual === "pausing" ? now : row.pause_requested_at,
  });

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

export async function reconcileSiteSubscriptions(input: {
  billingMode: BillingMode;
  now?: Date;
}): Promise<{
  scanned: number;
  pauses: number;
  resumes: number;
  jobs: number;
}> {
  const now = input.now ?? new Date();
  const rows = await listSubscriptionsNeedingReconcile(input.billingMode);
  let pauses = 0;
  let resumes = 0;

  for (const row of rows) {
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
      await updateSiteSubscription(row.id, row.billing_mode, {
        hosting_state_desired: decision.desired,
        lifecycle_state: decision.endLifecycle ? "ended" : row.lifecycle_state,
        ended_reason: decision.endLifecycle ? "period_ended" : row.ended_reason,
        ended_at: decision.endLifecycle ? now : row.ended_at,
      });
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

  return { scanned: rows.length, pauses, resumes, jobs: jobs.length };
}
