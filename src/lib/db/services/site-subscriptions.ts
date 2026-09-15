import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import {
  billingCustomers,
  billingJobs,
  siteSubscriptions,
  stripeBillingEvents,
  subscriptionCreditGrants,
  type BillingMode,
} from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";

export type SiteSubscriptionRow = typeof siteSubscriptions.$inferSelect;
export type BillingCustomerRow = typeof billingCustomers.$inferSelect;
export type SubscriptionCreditGrantRow = typeof subscriptionCreditGrants.$inferSelect;
export type BillingJobRow = typeof billingJobs.$inferSelect;
export type StripeBillingEventRow = typeof stripeBillingEvents.$inferSelect;

export async function getBillingCustomer(
  userId: string,
  billingMode: BillingMode,
): Promise<BillingCustomerRow | null> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(billingCustomers)
    .where(
      and(eq(billingCustomers.user_id, userId), eq(billingCustomers.billing_mode, billingMode)),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getBillingCustomerByStripeId(
  stripeCustomerId: string,
  billingMode: BillingMode,
): Promise<BillingCustomerRow | null> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(billingCustomers)
    .where(
      and(
        eq(billingCustomers.stripe_customer_id, stripeCustomerId),
        eq(billingCustomers.billing_mode, billingMode),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function insertBillingCustomer(input: {
  userId: string;
  billingMode: BillingMode;
  stripeCustomerId: string;
}): Promise<BillingCustomerRow> {
  assertDbConfigured();
  const now = new Date();
  const rows = await db
    .insert(billingCustomers)
    .values({
      id: nanoid(),
      user_id: input.userId,
      billing_mode: input.billingMode,
      stripe_customer_id: input.stripeCustomerId,
      created_at: now,
      updated_at: now,
    })
    .returning();
  return rows[0];
}

export async function getOpenSiteSubscription(
  projectId: string,
  billingMode: BillingMode,
): Promise<SiteSubscriptionRow | null> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(siteSubscriptions)
    .where(
      and(
        eq(siteSubscriptions.project_id, projectId),
        eq(siteSubscriptions.billing_mode, billingMode),
      ),
    )
    .orderBy(desc(siteSubscriptions.created_at));
  return rows.find((row) => row.lifecycle_state !== "ended") ?? null;
}

export async function getSiteSubscriptionById(
  id: string,
  billingMode: BillingMode,
): Promise<SiteSubscriptionRow | null> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(siteSubscriptions)
    .where(and(eq(siteSubscriptions.id, id), eq(siteSubscriptions.billing_mode, billingMode)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSiteSubscriptionByStripeId(
  stripeSubscriptionId: string,
  billingMode: BillingMode,
): Promise<SiteSubscriptionRow | null> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(siteSubscriptions)
    .where(
      and(
        eq(siteSubscriptions.stripe_subscription_id, stripeSubscriptionId),
        eq(siteSubscriptions.billing_mode, billingMode),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getSiteSubscriptionByCheckoutSession(
  checkoutSessionId: string,
  billingMode: BillingMode,
): Promise<SiteSubscriptionRow | null> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(siteSubscriptions)
    .where(
      and(
        eq(siteSubscriptions.stripe_checkout_session_id, checkoutSessionId),
        eq(siteSubscriptions.billing_mode, billingMode),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listSiteSubscriptionsForUser(
  userId: string,
  billingMode: BillingMode,
): Promise<SiteSubscriptionRow[]> {
  assertDbConfigured();
  return db
    .select()
    .from(siteSubscriptions)
    .where(
      and(eq(siteSubscriptions.user_id, userId), eq(siteSubscriptions.billing_mode, billingMode)),
    )
    .orderBy(desc(siteSubscriptions.updated_at));
}

export async function insertCheckoutClaim(input: {
  userId: string;
  projectId: string;
  billingMode: BillingMode;
  billingCustomerId: string | null;
  priceRef: string;
  amountOre: number;
}): Promise<SiteSubscriptionRow> {
  assertDbConfigured();
  const now = new Date();
  const rows = await db
    .insert(siteSubscriptions)
    .values({
      id: nanoid(),
      user_id: input.userId,
      project_id: input.projectId,
      billing_mode: input.billingMode,
      billing_customer_id: input.billingCustomerId,
      price_ref: input.priceRef,
      currency: "sek",
      amount_ore: input.amountOre,
      lifecycle_state: "checkout_pending",
      hosting_state_desired: "active",
      hosting_state_actual: "active",
      created_at: now,
      updated_at: now,
    })
    .returning();
  return rows[0];
}

export async function updateSiteSubscription(
  id: string,
  billingMode: BillingMode,
  patch: Partial<
    Pick<
      SiteSubscriptionRow,
      | "billing_customer_id"
      | "stripe_subscription_id"
      | "stripe_checkout_session_id"
      | "price_ref"
      | "currency"
      | "amount_ore"
      | "stripe_status"
      | "lifecycle_state"
      | "ended_reason"
      | "ended_at"
      | "hosting_state_desired"
      | "hosting_state_actual"
      | "pause_requested_at"
      | "paused_at"
      | "resumed_at"
      | "current_period_start"
      | "current_period_end"
      | "cancel_at_period_end"
      | "cancel_at"
      | "canceled_at"
      | "grace_until"
      | "retain_until"
      | "last_published_ref"
      | "last_published_at"
    >
  >,
): Promise<SiteSubscriptionRow | null> {
  assertDbConfigured();
  const rows = await db
    .update(siteSubscriptions)
    .set({ ...patch, updated_at: new Date() })
    .where(and(eq(siteSubscriptions.id, id), eq(siteSubscriptions.billing_mode, billingMode)))
    .returning();
  return rows[0] ?? null;
}

export async function listSubscriptionsNeedingReconcile(
  billingMode: BillingMode,
): Promise<SiteSubscriptionRow[]> {
  assertDbConfigured();
  return db
    .select()
    .from(siteSubscriptions)
    .where(eq(siteSubscriptions.billing_mode, billingMode));
}

export async function getPeriodGrant(
  subscriptionId: string,
  billingMode: BillingMode,
  periodId: string,
): Promise<SubscriptionCreditGrantRow | null> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(subscriptionCreditGrants)
    .where(
      and(
        eq(subscriptionCreditGrants.subscription_id, subscriptionId),
        eq(subscriptionCreditGrants.billing_mode, billingMode),
        eq(subscriptionCreditGrants.period_id, periodId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function insertPeriodGrant(input: {
  subscriptionId: string;
  userId: string;
  billingMode: BillingMode;
  periodId: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  credits: number;
  status: "pending" | "granted" | "skipped" | "simulated";
  transactionId?: string | null;
}): Promise<SubscriptionCreditGrantRow> {
  assertDbConfigured();
  const now = new Date();
  const rows = await db
    .insert(subscriptionCreditGrants)
    .values({
      id: nanoid(),
      subscription_id: input.subscriptionId,
      user_id: input.userId,
      billing_mode: input.billingMode,
      period_id: input.periodId,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      credits: input.credits,
      status: input.status,
      transaction_id: input.transactionId ?? null,
      granted_at: input.status === "granted" || input.status === "simulated" ? now : null,
      created_at: now,
      updated_at: now,
    })
    .returning();
  return rows[0];
}

export async function updatePeriodGrant(
  id: string,
  patch: Partial<Pick<SubscriptionCreditGrantRow, "status" | "transaction_id" | "granted_at">>,
): Promise<SubscriptionCreditGrantRow | null> {
  assertDbConfigured();
  const rows = await db
    .update(subscriptionCreditGrants)
    .set({ ...patch, updated_at: new Date() })
    .where(eq(subscriptionCreditGrants.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function getOpenBillingJob(
  subscriptionId: string,
  kind: "pause" | "resume",
): Promise<BillingJobRow | null> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(billingJobs)
    .where(and(eq(billingJobs.subscription_id, subscriptionId), eq(billingJobs.kind, kind)));
  return rows.find((row) => row.status === "pending" || row.status === "running") ?? null;
}

export async function insertBillingJob(input: {
  subscriptionId: string;
  billingMode: BillingMode;
  kind: "pause" | "resume";
}): Promise<BillingJobRow> {
  assertDbConfigured();
  const now = new Date();
  const rows = await db
    .insert(billingJobs)
    .values({
      id: nanoid(),
      subscription_id: input.subscriptionId,
      billing_mode: input.billingMode,
      kind: input.kind,
      status: "pending",
      attempts: 0,
      run_after: now,
      created_at: now,
      updated_at: now,
    })
    .returning();
  return rows[0];
}

export async function updateBillingJob(
  id: string,
  patch: Partial<
    Pick<
      BillingJobRow,
      | "status"
      | "attempts"
      | "run_after"
      | "lease_owner"
      | "lease_expires_at"
      | "provider_ref"
      | "last_error"
      | "completed_at"
    >
  >,
): Promise<BillingJobRow | null> {
  assertDbConfigured();
  const rows = await db
    .update(billingJobs)
    .set({ ...patch, updated_at: new Date() })
    .where(eq(billingJobs.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function listRunnableBillingJobs(
  billingMode: BillingMode,
  now: Date,
): Promise<BillingJobRow[]> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(billingJobs)
    .where(eq(billingJobs.billing_mode, billingMode));
  return rows.filter(
    (row) =>
      (row.status === "pending" || row.status === "running") &&
      row.run_after.getTime() <= now.getTime(),
  );
}

export async function getStripeBillingEvent(
  eventId: string,
): Promise<StripeBillingEventRow | null> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(stripeBillingEvents)
    .where(eq(stripeBillingEvents.event_id, eventId))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertStripeBillingEvent(input: {
  eventId: string;
  billingMode: BillingMode;
  eventType: string;
  leaseExpiresAt: Date;
}): Promise<StripeBillingEventRow> {
  assertDbConfigured();
  const now = new Date();
  const rows = await db
    .insert(stripeBillingEvents)
    .values({
      id: nanoid(),
      event_id: input.eventId,
      billing_mode: input.billingMode,
      event_type: input.eventType,
      status: "processing",
      lease_expires_at: input.leaseExpiresAt,
      created_at: now,
      updated_at: now,
    })
    .returning();
  return rows[0];
}

export async function updateStripeBillingEvent(
  eventId: string,
  patch: Partial<
    Pick<
      StripeBillingEventRow,
      "status" | "lease_expires_at" | "last_error" | "completed_at"
    >
  >,
): Promise<StripeBillingEventRow | null> {
  assertDbConfigured();
  const rows = await db
    .update(stripeBillingEvents)
    .set({ ...patch, updated_at: new Date() })
    .where(eq(stripeBillingEvents.event_id, eventId))
    .returning();
  return rows[0] ?? null;
}
