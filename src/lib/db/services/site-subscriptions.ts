import { and, desc, eq, isNull, lte, ne, or, sql } from "drizzle-orm";
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
  guard?: {
    expectedDesired?: string;
    expectedLifecycle?: string;
    expectedUpdatedAt?: Date;
    expectedEmptyCheckoutSession?: boolean;
  },
): Promise<SiteSubscriptionRow | null> {
  assertDbConfigured();
  const rows = await db
    .update(siteSubscriptions)
    .set({ ...patch, updated_at: new Date() })
    .where(
      and(
        eq(siteSubscriptions.id, id),
        eq(siteSubscriptions.billing_mode, billingMode),
        guard?.expectedDesired
          ? eq(siteSubscriptions.hosting_state_desired, guard.expectedDesired)
          : undefined,
        guard?.expectedLifecycle
          ? eq(siteSubscriptions.lifecycle_state, guard.expectedLifecycle)
          : undefined,
        guard?.expectedUpdatedAt
          ? eq(siteSubscriptions.updated_at, guard.expectedUpdatedAt)
          : undefined,
        guard?.expectedEmptyCheckoutSession
          ? isNull(siteSubscriptions.stripe_checkout_session_id)
          : undefined,
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function listSubscriptionsNeedingReconcile(
  billingMode: BillingMode,
  options?: { pendingCreatedBefore?: Date },
): Promise<SiteSubscriptionRow[]> {
  assertDbConfigured();
  const pendingCutoff = options?.pendingCreatedBefore;
  return db
    .select()
    .from(siteSubscriptions)
    .where(
      and(
        eq(siteSubscriptions.billing_mode, billingMode),
        pendingCutoff
          ? or(
              eq(siteSubscriptions.lifecycle_state, "active"),
              and(
                eq(siteSubscriptions.lifecycle_state, "checkout_pending"),
                lte(siteSubscriptions.created_at, pendingCutoff),
              ),
              and(
                eq(siteSubscriptions.lifecycle_state, "ended"),
                ne(siteSubscriptions.hosting_state_actual, "paused"),
              ),
            )
          : or(
              eq(siteSubscriptions.lifecycle_state, "active"),
              and(
                eq(siteSubscriptions.lifecycle_state, "ended"),
                ne(siteSubscriptions.hosting_state_actual, "paused"),
              ),
            ),
      ),
    );
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

/**
 * Ett jobb är ledigt om det är pending, eller running med utgången/saknad lease.
 * Avslutade jobb får inte plockas om — även om lease_expires_at ligger i dåtid.
 */
export function isBillingJobClaimable(input: {
  status: string;
  leaseExpiresAt: Date | null;
  now: Date;
}): boolean {
  if (input.status === "pending" || input.status === "failed") return true;
  if (input.status === "running") {
    return !input.leaseExpiresAt || input.leaseExpiresAt.getTime() <= input.now.getTime();
  }
  return false;
}

export function isRunnableBillingJob(input: {
  status: string;
  runAfter: Date;
  leaseExpiresAt: Date | null;
  now: Date;
}): boolean {
  const due = input.runAfter.getTime() <= input.now.getTime();
  const leaseFree =
    !input.leaseExpiresAt || input.leaseExpiresAt.getTime() <= input.now.getTime();
  return isBillingJobClaimable({
    status: input.status,
    leaseExpiresAt: input.leaseExpiresAt,
    now: input.now,
  }) && due && leaseFree;
}

/**
 * Atomiskt anspråk: bara en körning får raden via RETURNING.
 * `run_after <= now` måste sitta i WHERE — listan är inte en grind.
 * En stale workerlista kan annars claima ett failed jobb före backoff.
 * Tom RETURNING = någon annan äger jobbet eller det inte är due; anropa inte providern.
 */
export async function claimRunnableBillingJob(
  id: string,
  now: Date,
  leaseOwner: string,
  leaseMs = 60_000,
): Promise<BillingJobRow | null> {
  assertDbConfigured();
  const rows = await db
    .update(billingJobs)
    .set({
      status: "running",
      attempts: sql`${billingJobs.attempts} + 1`,
      lease_owner: leaseOwner,
      lease_expires_at: new Date(now.getTime() + leaseMs),
      updated_at: now,
    })
    .where(
      and(
        eq(billingJobs.id, id),
        lte(billingJobs.run_after, now),
        or(
          eq(billingJobs.status, "pending"),
          eq(billingJobs.status, "failed"),
          and(
            eq(billingJobs.status, "running"),
            or(isNull(billingJobs.lease_expires_at), lte(billingJobs.lease_expires_at, now)),
          ),
        ),
      ),
    )
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
  return rows.filter((row) =>
    isRunnableBillingJob({
      status: row.status,
      runAfter: row.run_after,
      leaseExpiresAt: row.lease_expires_at,
      now,
    }),
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
