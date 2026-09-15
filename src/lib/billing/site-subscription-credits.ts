import { createTransaction } from "@/lib/db/services/transactions";
import type { BillingMode } from "@/lib/db/schema";
import {
  getPeriodGrant,
  insertPeriodGrant,
  updatePeriodGrant,
  type SubscriptionCreditGrantRow,
} from "@/lib/db/services/site-subscriptions";
import { SITE_SUBSCRIPTION_COMMERCIAL_DEFAULTS } from "./site-subscription-config";
import { isUniqueViolation } from "./site-subscription-errors";
import { shouldGrantPeriodCredits } from "./site-subscription-policy";

/** Samma formel som D1:s genererade `ledger_idempotency_key`. */
export function siteSubscriptionPeriodLedgerKey(
  billingMode: BillingMode,
  subscriptionId: string,
  periodId: string,
): string {
  return `site_sub_period:${billingMode}:${subscriptionId}:${periodId}`;
}

async function completeLivePeriodGrant(
  grant: SubscriptionCreditGrantRow,
  userId: string,
  credits: number,
): Promise<{ granted: boolean; status: string; reason: string }> {
  if (grant.status === "granted") {
    return { granted: false, status: "granted", reason: "already_granted" };
  }

  const ledgerKey =
    grant.ledger_idempotency_key ??
    siteSubscriptionPeriodLedgerKey(grant.billing_mode, grant.subscription_id, grant.period_id);
  const tx = await createTransaction(
    userId,
    "purchase",
    credits,
    "Sajt-abonnemang: inkluderade credits",
    undefined,
    undefined,
    { idempotencyKey: ledgerKey },
  );

  await updatePeriodGrant(grant.id, {
    status: "granted",
    transaction_id: tx.id,
    granted_at: new Date(),
  });

  return { granted: true, status: "granted", reason: "live_ledger" };
}

export async function grantSiteSubscriptionPeriodCredits(input: {
  subscriptionId: string;
  userId: string;
  billingMode: BillingMode;
  periodId: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  billingReason: string | null;
}): Promise<{ granted: boolean; status: string; reason: string }> {
  const decision = shouldGrantPeriodCredits({
    billingReason: input.billingReason,
    periodId: input.periodId,
    alreadyGranted: false,
  });
  if (!decision.grant) {
    return { granted: false, status: "skipped", reason: decision.reason };
  }

  const existing = await getPeriodGrant(input.subscriptionId, input.billingMode, input.periodId);
  if (existing) {
    if (input.billingMode === "live" && existing.status === "pending") {
      return completeLivePeriodGrant(
        existing,
        input.userId,
        SITE_SUBSCRIPTION_COMMERCIAL_DEFAULTS.includedCredits,
      );
    }
    return { granted: false, status: existing.status, reason: "already_granted" };
  }

  const credits = SITE_SUBSCRIPTION_COMMERCIAL_DEFAULTS.includedCredits;

  if (input.billingMode === "test") {
    try {
      await insertPeriodGrant({
        subscriptionId: input.subscriptionId,
        userId: input.userId,
        billingMode: "test",
        periodId: input.periodId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        credits,
        status: "simulated",
      });
    } catch (error) {
      if (!isUniqueViolation(error, "subscription_credit_grants_period_unique")) {
        throw error;
      }
      return { granted: false, status: "simulated", reason: "already_granted" };
    }
    return { granted: true, status: "simulated", reason: "test_simulated" };
  }

  let grant;
  try {
    grant = await insertPeriodGrant({
      subscriptionId: input.subscriptionId,
      userId: input.userId,
      billingMode: "live",
      periodId: input.periodId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      credits,
      status: "pending",
    });
  } catch (error) {
    if (!isUniqueViolation(error, "subscription_credit_grants_period_unique")) {
      throw error;
    }
    const winner = await getPeriodGrant(input.subscriptionId, "live", input.periodId);
    if (!winner) throw error;
    if (winner.status === "pending") {
      return completeLivePeriodGrant(winner, input.userId, credits);
    }
    return { granted: false, status: winner.status, reason: "already_granted" };
  }

  return completeLivePeriodGrant(grant, input.userId, credits);
}
