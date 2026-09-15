import type Stripe from "stripe";

export type CheckoutCompletedDispatch =
  | "legacy_credits"
  | "domain_purchase"
  | "site_subscription"
  | "ignored_setup"
  | "blocked";

/**
 * Keep every Checkout contract out of the two legacy payment mutation
 * lanes until that contract has its own durable consumer. Empty or
 * malformed `kind` is not the same as no `kind`.
 */
export function getCheckoutCompletedDispatch(
  session: Stripe.Checkout.Session,
): CheckoutCompletedDispatch {
  const metadata: unknown = session.metadata;
  if (
    metadata !== null &&
    metadata !== undefined &&
    (typeof metadata !== "object" || Array.isArray(metadata))
  ) {
    return "blocked";
  }

  const kind =
    metadata === null || metadata === undefined
      ? undefined
      : (metadata as Record<string, unknown>).kind;

  if (kind !== undefined && typeof kind !== "string") {
    return "blocked";
  }

  const mode: unknown = session.mode;
  if (mode === "subscription" && kind === "site_subscription") {
    return "site_subscription";
  }
  if (mode === "subscription" || kind === "site_subscription") {
    return "blocked";
  }

  if (mode === "payment") {
    if (kind === undefined) return "legacy_credits";
    if (kind === "domain_purchase") return "domain_purchase";
    return "blocked";
  }

  if (mode === "setup") {
    return kind === "domain_purchase" ? "blocked" : "ignored_setup";
  }

  return "blocked";
}

export function isSiteSubscriptionStripeEventType(type: string): boolean {
  return (
    type === "checkout.session.completed" ||
    type === "checkout.session.expired" ||
    type === "customer.subscription.created" ||
    type === "customer.subscription.updated" ||
    type === "customer.subscription.deleted" ||
    type === "invoice.paid" ||
    type === "invoice.payment_failed"
  );
}

export function shouldDispatchSiteSubscription(event: Stripe.Event): boolean {
  if (event.type === "checkout.session.completed") {
    return getCheckoutCompletedDispatch(event.data.object as Stripe.Checkout.Session) ===
      "site_subscription";
  }
  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    return session.metadata?.kind === "site_subscription";
  }
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    return sub.metadata?.kind === "site_subscription";
  }
  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const meta = invoice.parent?.subscription_details?.metadata;
    return (
      meta?.kind === "site_subscription" ||
      Boolean(invoice.parent?.subscription_details) ||
      Boolean(invoice.billing_reason?.startsWith("subscription"))
    );
  }
  return false;
}
