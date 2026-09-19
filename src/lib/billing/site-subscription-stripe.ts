import Stripe from "stripe";
import { SITE_SUBSCRIPTION_KIND } from "./site-subscription-offer";
import { buildPeriodId } from "./site-subscription-policy";

export function isStripeResourceMissing(error: unknown): boolean {
  return (
    error instanceof Stripe.errors.StripeInvalidRequestError &&
    error.code === "resource_missing"
  );
}

export async function findSiteSubscriptionIdForProject(input: {
  stripe: Stripe;
  customerId: string;
  projectId: string;
  userId?: string | null;
}): Promise<string | null> {
  const listed = await input.stripe.subscriptions.list({
    customer: input.customerId,
    status: "all",
    limit: 20,
  });
  const match = listed.data.find((sub) => {
    const meta = readSiteSubscriptionMetadata(sub.metadata);
    return (
      meta.kind === SITE_SUBSCRIPTION_KIND &&
      meta.projectId === input.projectId &&
      (!input.userId || !meta.userId || meta.userId === input.userId)
    );
  });
  return match?.id ?? null;
}

export function readStripeId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export function readInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const fromParent = invoice.parent?.subscription_details?.subscription;
  return readStripeId(fromParent);
}

export function readInvoiceBillingReason(invoice: Stripe.Invoice): string | null {
  return invoice.billing_reason ?? null;
}

export function readInvoicePeriod(invoice: Stripe.Invoice): {
  periodId: string;
  periodStart: Date;
  periodEnd: Date | null;
} | null {
  const lines = invoice.lines?.data ?? [];
  const subscriptionLine = lines.find((line) => {
    const parentType = (line as { parent?: { type?: string } }).parent?.type;
    return parentType === "subscription_item_details" || Boolean(line.period?.start);
  });
  const start = subscriptionLine?.period?.start ?? invoice.period_start;
  const end = subscriptionLine?.period?.end ?? invoice.period_end ?? null;
  if (!start) return null;
  try {
    return {
      periodId: buildPeriodId(start),
      periodStart: new Date(start * 1000),
      periodEnd: end ? new Date(end * 1000) : null,
    };
  } catch {
    return null;
  }
}

export function readSubscriptionPeriod(subscription: Stripe.Subscription): {
  periodId: string;
  periodStart: Date;
  periodEnd: Date | null;
} | null {
  const item = subscription.items?.data?.[0];
  const start = item?.current_period_start;
  const end = item?.current_period_end ?? null;
  if (!start) return null;
  try {
    return {
      periodId: buildPeriodId(start),
      periodStart: new Date(start * 1000),
      periodEnd: end ? new Date(end * 1000) : null,
    };
  } catch {
    return null;
  }
}

export function readSiteSubscriptionMetadata(
  metadata: Stripe.Metadata | null | undefined,
): {
  kind: string | null;
  projectId: string | null;
  userId: string | null;
  billingMode: string | null;
  priceRef: string | null;
} {
  return {
    kind: metadata?.kind ?? null,
    projectId: metadata?.projectId ?? null,
    userId: metadata?.userId ?? null,
    billingMode: metadata?.billing_mode ?? null,
    priceRef: metadata?.price_ref ?? null,
  };
}

export function isSiteSubscriptionMetadata(
  metadata: Stripe.Metadata | null | undefined,
): boolean {
  return metadata?.kind === SITE_SUBSCRIPTION_KIND;
}

export async function retrieveSubscriptionFresh(
  stripe: Stripe,
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data", "latest_invoice"],
  });
}

export async function retrieveInvoiceFresh(
  stripe: Stripe,
  invoiceId: string,
): Promise<Stripe.Invoice> {
  return stripe.invoices.retrieve(invoiceId, {
    expand: ["lines.data", "parent.subscription_details.subscription"],
  });
}

export async function retrieveCheckoutSessionFresh(
  stripe: Stripe,
  sessionId: string,
): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.retrieve(sessionId);
}

export function isLatestInvoicePaid(subscription: Stripe.Subscription): boolean {
  const latest = subscription.latest_invoice;
  if (!latest || typeof latest === "string") return false;
  return latest.status === "paid";
}
