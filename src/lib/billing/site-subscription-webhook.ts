import type Stripe from "stripe";
import { NextResponse } from "next/server";
import type { BillingMode } from "@/lib/db/schema";
import {
  getOpenSiteSubscription,
  getSiteSubscriptionByCheckoutSession,
  getSiteSubscriptionByStripeId,
  updateSiteSubscription,
  type SiteSubscriptionRow,
} from "@/lib/db/services/site-subscriptions";
import { SITE_SUBSCRIPTION_COMMERCIAL_DEFAULTS } from "./site-subscription-config";
import { grantSiteSubscriptionPeriodCredits } from "./site-subscription-credits";
import {
  claimStripeBillingEvent,
  completeStripeBillingEvent,
  failStripeBillingEvent,
} from "./site-subscription-events";
import { resolveLastPublishedRef } from "./site-subscription-hosting";
import { enqueueHostingJob } from "./site-subscription-reconcile";
import {
  classifyCheckoutClaim,
  computeGraceUntil,
  eventMatchesServerBillingMode,
  shouldApplyPaidSubscription,
  shouldApplyPaymentFailed,
  shouldFulfillEndedRow,
  shouldPauseHostingAfterSubscriptionDeleted,
  shouldRetainPaidLifecycleAfterDelete,
  type SiteSubscriptionLifecycleState,
} from "./site-subscription-policy";
import { SITE_SUBSCRIPTION_KIND } from "./site-subscription-offer";
import {
  isLatestInvoicePaid,
  isSiteSubscriptionMetadata,
  readInvoiceBillingReason,
  readInvoicePeriod,
  readInvoiceSubscriptionId,
  readSiteSubscriptionMetadata,
  readStripeId,
  retrieveCheckoutSessionFresh,
  retrieveInvoiceFresh,
  retrieveSubscriptionFresh,
} from "./site-subscription-stripe";
import { getCheckoutCompletedDispatch, shouldDispatchSiteSubscription } from "./stripe-webhook-dispatch";

export type WebhookHandleResult = {
  status: number;
  body: Record<string, unknown>;
};

function ok(extra: Record<string, unknown> = {}): WebhookHandleResult {
  return { status: 200, body: { received: true, ...extra } };
}

function retry(error: string): WebhookHandleResult {
  return { status: 500, body: { error } };
}

function reject(status: number, error: string): WebhookHandleResult {
  return { status, body: { error } };
}

/** Tenant/mode 4xx must stay open so Stripe retries after metadata or row is fixed. */
const RETRYABLE_CLIENT_ERRORS = new Set([
  "tenant_mismatch",
  "livemode_mismatch",
  "metadata_mode_mismatch",
]);

function shouldKeepStripeEventOpen(result: WebhookHandleResult): boolean {
  if (result.status >= 500) return true;
  const error = typeof result.body.error === "string" ? result.body.error : "";
  return RETRYABLE_CLIENT_ERRORS.has(error);
}

async function resolveSubscriptionRow(input: {
  billingMode: BillingMode;
  stripeSubscriptionId?: string | null;
  checkoutSessionId?: string | null;
  projectId?: string | null;
  userId?: string | null;
}): Promise<SiteSubscriptionRow | null> {
  if (input.stripeSubscriptionId) {
    const byStripe = await getSiteSubscriptionByStripeId(
      input.stripeSubscriptionId,
      input.billingMode,
    );
    if (byStripe) return byStripe;
  }
  if (input.checkoutSessionId) {
    const bySession = await getSiteSubscriptionByCheckoutSession(
      input.checkoutSessionId,
      input.billingMode,
    );
    if (bySession) return bySession;
  }
  if (input.projectId) {
    const open = await getOpenSiteSubscription(input.projectId, input.billingMode);
    if (open && (!input.userId || open.user_id === input.userId)) return open;
  }
  return null;
}

function assertTenant(row: SiteSubscriptionRow, userId: string | null, projectId: string | null) {
  if (userId && row.user_id !== userId) return false;
  if (projectId && row.project_id !== projectId) return false;
  return true;
}

async function snapshotPublishedRef(row: SiteSubscriptionRow): Promise<void> {
  if (row.last_published_ref?.startsWith("dpl:")) return;
  const ref = await resolveLastPublishedRef(row.project_id);
  if (!ref?.startsWith("dpl:")) return;
  await updateSiteSubscription(row.id, row.billing_mode, {
    last_published_ref: ref,
    last_published_at: new Date(),
  });
}

export async function applyPaidSubscription(input: {
  row: SiteSubscriptionRow;
  stripeStatus: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string;
}): Promise<void> {
  await updateSiteSubscription(input.row.id, input.row.billing_mode, {
    stripe_subscription_id: input.stripeSubscriptionId,
    stripe_status: input.stripeStatus,
    lifecycle_state: "active",
    ended_reason: null,
    ended_at: null,
    hosting_state_desired: "active",
    grace_until: null,
    current_period_start: input.periodStart,
    current_period_end: input.periodEnd,
    cancel_at_period_end: input.cancelAtPeriodEnd,
  });
  await snapshotPublishedRef(input.row);
}

function isPaidInvoiceForActivation(
  invoice: Stripe.Invoice | null,
  subscription: Stripe.Subscription,
): boolean {
  return invoice?.status === "paid" || isLatestInvoicePaid(subscription);
}

export async function fulfillPaidSubscriptionRow(input: {
  stripe: Stripe;
  row: SiteSubscriptionRow;
  stripeSubscriptionId: string;
  subscription?: Stripe.Subscription;
  invoice?: Stripe.Invoice | null;
}): Promise<{ granted: boolean; status: string; reason: string; applied: boolean }> {
  const subscription =
    input.subscription ??
    (await retrieveSubscriptionFresh(input.stripe, input.stripeSubscriptionId));
  const invoice =
    input.invoice === undefined
      ? await loadLatestInvoice(input.stripe, subscription)
      : input.invoice;
  const period = invoice ? readInvoicePeriod(invoice) : null;
  const item = subscription.items.data[0];
  const knownPeriodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000)
    : null;
  const invoicePaid = isPaidInvoiceForActivation(invoice, subscription);
  const applyState = shouldApplyPaidSubscription({
    stripeStatus: subscription.status,
    invoicePeriodEnd: period?.periodEnd ?? null,
    knownPeriodEnd,
    invoicePaid,
  });
  if (!applyState.apply) {
    return { granted: false, status: "skipped", reason: applyState.reason, applied: false };
  }
  // Publiceringsrätt: första steget från checkout_pending kräver betald faktura.
  // classifyCheckoutClaim.paid är en annan grind (hindra dubbel checkout).
  if (input.row.lifecycle_state === "checkout_pending" && !invoicePaid) {
    return { granted: false, status: "skipped", reason: "invoice_not_paid", applied: false };
  }
  const endedGate = shouldFulfillEndedRow({
    lifecycleState: input.row.lifecycle_state as SiteSubscriptionLifecycleState,
    endedReason: input.row.ended_reason,
    invoicePaid,
  });
  if (!endedGate.apply) {
    return { granted: false, status: "skipped", reason: endedGate.reason, applied: false };
  }
  await applyPaidSubscription({
    row: input.row,
    stripeStatus: subscription.status,
    periodStart: period?.periodStart ?? (item ? new Date(item.current_period_start * 1000) : null),
    periodEnd: period?.periodEnd ?? (item ? new Date(item.current_period_end * 1000) : null),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    stripeSubscriptionId: input.stripeSubscriptionId,
  });
  if (!period || !invoice) {
    return { granted: false, status: "skipped", reason: "missing_period", applied: true };
  }
  const grant = await grantSiteSubscriptionPeriodCredits({
    subscriptionId: input.row.id,
    userId: input.row.user_id,
    billingMode: input.row.billing_mode,
    periodId: period.periodId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    billingReason: readInvoiceBillingReason(invoice),
  });
  return { ...grant, applied: true };
}

async function loadLatestInvoice(
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<Stripe.Invoice | null> {
  const invoiceId = readStripeId(subscription.latest_invoice);
  if (!invoiceId) return null;
  return retrieveInvoiceFresh(stripe, invoiceId);
}

async function eventBelongsToSiteSubscription(
  event: Stripe.Event,
  billingMode: BillingMode,
): Promise<boolean> {
  if (shouldDispatchSiteSubscription(event)) return true;
  if (event.type !== "invoice.paid" && event.type !== "invoice.payment_failed") {
    return false;
  }
  const invoice = event.data.object as Stripe.Invoice;
  const stripeSubscriptionId = readInvoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) return false;
  const row = await getSiteSubscriptionByStripeId(stripeSubscriptionId, billingMode);
  return Boolean(row);
}

export async function handleSiteSubscriptionStripeEvent(input: {
  stripe: Stripe;
  event: Stripe.Event;
  serverBillingMode: BillingMode;
}): Promise<WebhookHandleResult> {
  const belongs = await eventBelongsToSiteSubscription(input.event, input.serverBillingMode);
  if (!belongs) {
    return ok({ ignored: "not_site_subscription" });
  }

  if (!eventMatchesServerBillingMode(input.event.livemode, input.serverBillingMode)) {
    console.error("[Stripe/webhook] site_subscription livemode mismatch", input.event.id);
    return retry("livemode_mismatch");
  }

  const claim = await claimStripeBillingEvent({
    eventId: input.event.id,
    billingMode: input.serverBillingMode,
    eventType: input.event.type,
  });
  if (claim.action === "already_completed") {
    return ok({ duplicate: true });
  }
  if (claim.action === "in_flight") {
    return retry("event_in_flight");
  }

  try {
    const result = await dispatchSiteSubscriptionEvent(input);
    if (shouldKeepStripeEventOpen(result)) {
      await failStripeBillingEvent(input.event.id, String(result.body.error ?? "retry"));
      return result.status >= 500 ? result : retry(String(result.body.error ?? "retry"));
    }
    await completeStripeBillingEvent(input.event.id);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failStripeBillingEvent(input.event.id, message);
    console.error("[Stripe/webhook] site_subscription failed:", error);
    return retry("site_subscription_failed");
  }
}

async function dispatchSiteSubscriptionEvent(input: {
  stripe: Stripe;
  event: Stripe.Event;
  serverBillingMode: BillingMode;
}): Promise<WebhookHandleResult> {
  const { event, stripe, serverBillingMode } = input;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (getCheckoutCompletedDispatch(session) !== "site_subscription") {
        return reject(503, "checkout_contract_not_activated");
      }
      return handleCheckoutCompleted(stripe, session, serverBillingMode);
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (!isSiteSubscriptionMetadata(session.metadata)) return ok({ ignored: "not_site_subscription" });
      return handleCheckoutExpired(stripe, session, serverBillingMode);
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      return handleSubscriptionUpdated(stripe, sub, serverBillingMode);
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      return handleSubscriptionDeleted(stripe, sub, serverBillingMode);
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      return handleInvoicePaid(stripe, invoice, serverBillingMode);
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      return handleInvoicePaymentFailed(stripe, invoice, serverBillingMode);
    }
    default:
      return ok({ ignored: "unhandled_type" });
  }
}

async function handleCheckoutCompleted(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  billingMode: BillingMode,
): Promise<WebhookHandleResult> {
  const meta = readSiteSubscriptionMetadata(session.metadata);
  if (meta.kind !== SITE_SUBSCRIPTION_KIND || !meta.projectId || !meta.userId) {
    return reject(400, "invalid_site_subscription_metadata");
  }
  if (meta.billingMode && meta.billingMode !== billingMode) {
    return reject(400, "metadata_mode_mismatch");
  }

  const stripeSubscriptionId = readStripeId(session.subscription);
  const row = await resolveSubscriptionRow({
    billingMode,
    stripeSubscriptionId,
    checkoutSessionId: session.id,
    projectId: meta.projectId,
    userId: meta.userId,
  });
  if (!row || !assertTenant(row, meta.userId, meta.projectId)) {
    return retry("subscription_row_missing");
  }

  const existingSessionId = row.stripe_checkout_session_id;
  const existingSubscriptionId = row.stripe_subscription_id;
  if (existingSessionId && existingSessionId !== session.id) {
    return ok({ ignored: "foreign_checkout_session" });
  }
  if (
    existingSubscriptionId &&
    stripeSubscriptionId &&
    existingSubscriptionId !== stripeSubscriptionId
  ) {
    return ok({ ignored: "foreign_subscription" });
  }

  const patch: {
    stripe_checkout_session_id?: string;
    stripe_subscription_id?: string;
  } = {};
  if (!existingSessionId) {
    patch.stripe_checkout_session_id = session.id;
  }
  if (!existingSubscriptionId && stripeSubscriptionId) {
    patch.stripe_subscription_id = stripeSubscriptionId;
  }

  if (Object.keys(patch).length > 0) {
    const written = existingSessionId
      ? await updateSiteSubscription(row.id, billingMode, patch)
      : await updateSiteSubscription(row.id, billingMode, patch, {
          expectedEmptyCheckoutSession: true,
        });
    if (!written) {
      return ok({ ignored: "checkout_session_already_set" });
    }
  }

  // Checkout-success knyter Stripe-id:n. Raden stannar i checkout_pending
  // tills invoice.paid skriver period + active. Sätt inte lifecycle här —
  // en sen completed får inte skriva ner en redan betald rad.
  return ok({ attached: true, granted: false, claimed: true, pending: true });
}

async function handleCheckoutExpired(
  stripe: Stripe,
  incoming: Stripe.Checkout.Session,
  billingMode: BillingMode,
): Promise<WebhookHandleResult> {
  const row = await getSiteSubscriptionByCheckoutSession(incoming.id, billingMode);
  if (!row || row.lifecycle_state !== "checkout_pending") {
    return ok({ ignored: "no_pending_claim" });
  }
  let session: Stripe.Checkout.Session;
  try {
    session = await retrieveCheckoutSessionFresh(stripe, incoming.id);
  } catch {
    return retry("checkout_session_retrieve_failed");
  }
  const claim = classifyCheckoutClaim({
    now: new Date(),
    lookup: {
      lookup: "reached",
      session: {
        id: session.id,
        status: session.status ?? "expired",
        url: null,
        expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
        subscriptionId: readStripeId(session.subscription),
      },
    },
    rowSubscriptionId: row.stripe_subscription_id,
  });
  if (claim.paid) {
    return ok({ ignored: "paid_claim" });
  }
  const written = await updateSiteSubscription(
    row.id,
    billingMode,
    {
      lifecycle_state: "ended",
      ended_reason: "checkout_expired",
      ended_at: new Date(),
    },
    { expectedLifecycle: "checkout_pending" },
  );
  return ok({ expired: Boolean(written), stale: !written });
}

async function handleSubscriptionUpdated(
  stripe: Stripe,
  incoming: Stripe.Subscription,
  billingMode: BillingMode,
): Promise<WebhookHandleResult> {
  const current = await retrieveSubscriptionFresh(stripe, incoming.id);
  const meta = readSiteSubscriptionMetadata(current.metadata);
  if (meta.kind && meta.kind !== SITE_SUBSCRIPTION_KIND) {
    return ok({ ignored: "not_site_subscription" });
  }

  const row = await resolveSubscriptionRow({
    billingMode,
    stripeSubscriptionId: current.id,
    projectId: meta.projectId,
    userId: meta.userId,
  });
  if (!row) {
    if (!meta.projectId) return ok({ ignored: "unbound_subscription" });
    return retry("subscription_row_missing");
  }
  if (!assertTenant(row, meta.userId, meta.projectId)) {
    return reject(400, "tenant_mismatch");
  }

  const itemPeriod = current.items.data[0];
  const startGrace =
    shouldApplyPaymentFailed({
      stripeStatus: current.status,
      latestInvoicePaid: isLatestInvoicePaid(current),
    }) &&
    row.hosting_state_desired === "active" &&
    !row.grace_until;

  await updateSiteSubscription(row.id, billingMode, {
    stripe_subscription_id: current.id,
    stripe_status: current.status,
    cancel_at_period_end: Boolean(current.cancel_at_period_end),
    cancel_at: current.cancel_at ? new Date(current.cancel_at * 1000) : null,
    canceled_at: current.canceled_at ? new Date(current.canceled_at * 1000) : null,
    current_period_start: itemPeriod?.current_period_start
      ? new Date(itemPeriod.current_period_start * 1000)
      : row.current_period_start,
    current_period_end: itemPeriod?.current_period_end
      ? new Date(itemPeriod.current_period_end * 1000)
      : row.current_period_end,
    ...(startGrace
      ? {
          hosting_state_desired: "grace" as const,
          grace_until: computeGraceUntil(new Date(), SITE_SUBSCRIPTION_COMMERCIAL_DEFAULTS.graceDays),
        }
      : {}),
  });
  return ok({ synced: true, grace: startGrace });
}

async function handleSubscriptionDeleted(
  stripe: Stripe,
  incoming: Stripe.Subscription,
  billingMode: BillingMode,
): Promise<WebhookHandleResult> {
  const current = await retrieveSubscriptionFresh(stripe, incoming.id).catch(() => incoming);
  const meta = readSiteSubscriptionMetadata(current.metadata);
  const row = await resolveSubscriptionRow({
    billingMode,
    stripeSubscriptionId: current.id,
    projectId: meta.projectId,
    userId: meta.userId,
  });
  if (!row) return ok({ ignored: "unknown_subscription" });
  if (!assertTenant(row, meta.userId, meta.projectId)) {
    return reject(400, "tenant_mismatch");
  }

  const now = new Date();
  const stillPaid = shouldRetainPaidLifecycleAfterDelete({
    lifecycleState: row.lifecycle_state as SiteSubscriptionLifecycleState,
    currentPeriodEnd: row.current_period_end,
    now,
  });
  const pauseHosting = shouldPauseHostingAfterSubscriptionDeleted({
    lifecycleState: row.lifecycle_state as SiteSubscriptionLifecycleState,
    stillPaid,
  });

  await updateSiteSubscription(row.id, billingMode, {
    stripe_status: current.status,
    lifecycle_state: stillPaid ? "active" : "ended",
    ended_reason: stillPaid ? row.ended_reason : "subscription_deleted",
    ended_at: stillPaid ? row.ended_at : now,
    cancel_at_period_end: true,
    ...(pauseHosting ? { hosting_state_desired: "paused" as const } : {}),
  });

  if (pauseHosting) {
    await enqueueHostingJob({
      subscriptionId: row.id,
      billingMode,
      kind: "pause",
    });
  }
  return ok({ deleted: true, stillPaid });
}

async function handleInvoicePaid(
  stripe: Stripe,
  incoming: Stripe.Invoice,
  billingMode: BillingMode,
): Promise<WebhookHandleResult> {
  const invoice = await retrieveInvoiceFresh(stripe, incoming.id);
  const stripeSubscriptionId = readInvoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) {
    return ok({ ignored: "not_subscription_invoice" });
  }

  const subscription = await retrieveSubscriptionFresh(stripe, stripeSubscriptionId);
  const meta = readSiteSubscriptionMetadata(
    subscription.metadata ?? invoice.parent?.subscription_details?.metadata,
  );
  if (meta.kind && meta.kind !== SITE_SUBSCRIPTION_KIND) {
    return ok({ ignored: "not_site_subscription" });
  }

  const row = await resolveSubscriptionRow({
    billingMode,
    stripeSubscriptionId,
    projectId: meta.projectId,
    userId: meta.userId,
  });
  if (!row) {
    if (meta.kind === SITE_SUBSCRIPTION_KIND) return retry("subscription_row_missing");
    return ok({ ignored: "unknown_subscription" });
  }
  if (!assertTenant(row, meta.userId, meta.projectId)) {
    return reject(400, "tenant_mismatch");
  }

  const grant = await fulfillPaidSubscriptionRow({
    stripe,
    row,
    stripeSubscriptionId,
    subscription,
    invoice,
  });

  if (
    grant.applied &&
    (row.hosting_state_actual === "paused" || row.hosting_state_actual === "pausing")
  ) {
    await enqueueHostingJob({
      subscriptionId: row.id,
      billingMode,
      kind: "resume",
    });
  }

  return ok({ paid: true, grant });
}

async function handleInvoicePaymentFailed(
  stripe: Stripe,
  incoming: Stripe.Invoice,
  billingMode: BillingMode,
): Promise<WebhookHandleResult> {
  const invoice = await retrieveInvoiceFresh(stripe, incoming.id);
  const stripeSubscriptionId = readInvoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) {
    return ok({ ignored: "not_subscription_invoice" });
  }

  const subscription = await retrieveSubscriptionFresh(stripe, stripeSubscriptionId);
  const meta = readSiteSubscriptionMetadata(subscription.metadata);
  const row = await resolveSubscriptionRow({
    billingMode,
    stripeSubscriptionId,
    projectId: meta.projectId,
    userId: meta.userId,
  });
  if (!row) {
    if (meta.kind === SITE_SUBSCRIPTION_KIND) return retry("subscription_row_missing");
    return ok({ ignored: "unknown_subscription" });
  }
  if (!assertTenant(row, meta.userId, meta.projectId)) {
    return reject(400, "tenant_mismatch");
  }

  if (
    !shouldApplyPaymentFailed({
      stripeStatus: subscription.status,
      latestInvoicePaid: isLatestInvoicePaid(subscription),
    })
  ) {
    return ok({ ignored: "stale_payment_failed" });
  }

  const now = new Date();
  await updateSiteSubscription(row.id, billingMode, {
    stripe_status: subscription.status,
    hosting_state_desired: "grace",
    grace_until:
      row.grace_until ??
      computeGraceUntil(now, SITE_SUBSCRIPTION_COMMERCIAL_DEFAULTS.graceDays),
  });
  return ok({ grace: true, paused: false, graceReused: Boolean(row.grace_until) });
}

export function webhookResultToResponse(result: WebhookHandleResult): NextResponse {
  return NextResponse.json(result.body, { status: result.status });
}
