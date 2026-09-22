import { SECRETS } from "@/lib/config";
import type { BillingMode } from "@/lib/db/schema";
import { getOpenSiteSubscription } from "@/lib/db/services/site-subscriptions";
import { isSiteSubscriptionPublishEnforced } from "./site-subscription-flags";
import { resolveServerBillingMode } from "./site-subscription-offer";
import {
  evaluateSitePublishEntitlement,
  type PublishEntitlement,
} from "./site-subscription-policy";

export async function evaluateProjectPublishEntitlement(input: {
  projectId: string;
  userId: string;
  now?: Date;
  billingMode?: BillingMode | null;
}): Promise<PublishEntitlement> {
  const billingMode =
    input.billingMode ?? resolveServerBillingMode(SECRETS.stripeSecretKey);
  if (!billingMode) {
    return evaluateSitePublishEntitlement({
      projectId: input.projectId,
      billingMode: null,
      now: input.now ?? new Date(),
      enforce: isSiteSubscriptionPublishEnforced(),
    });
  }

  const row = await getOpenSiteSubscription(input.projectId, billingMode);
  if (row && row.user_id !== input.userId) {
    return {
      entitled: false,
      waiveDeployFee: false,
      reason: "wrong_project",
      graceActive: false,
    };
  }

  return evaluateSitePublishEntitlement({
    projectId: input.projectId,
    rowProjectId: row?.project_id,
    billingMode,
    rowBillingMode: row?.billing_mode,
    lifecycleState: (row?.lifecycle_state ?? undefined) as
      | "checkout_pending"
      | "active"
      | "ended"
      | undefined,
    hostingDesired: row?.hosting_state_desired as "active" | "grace" | "paused" | undefined,
    hostingActual: row?.hosting_state_actual as
      | "active"
      | "pausing"
      | "paused"
      | "resuming"
      | undefined,
    graceUntil: row?.grace_until ?? null,
    currentPeriodEnd: row?.current_period_end ?? null,
    now: input.now ?? new Date(),
    enforce: isSiteSubscriptionPublishEnforced(),
  });
}
