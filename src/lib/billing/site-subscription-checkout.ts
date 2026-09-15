import type Stripe from "stripe";
import { URLS } from "@/lib/config";
import type { BillingMode } from "@/lib/db/schema";
import {
  getOpenSiteSubscription,
  insertCheckoutClaim,
  updateSiteSubscription,
  type SiteSubscriptionRow,
} from "@/lib/db/services/site-subscriptions";
import { SITE_SUBSCRIPTION_COMMERCIAL_DEFAULTS } from "./site-subscription-config";
import { getOrCreateBillingCustomer } from "./site-subscription-customer";
import { isUniqueViolation } from "./site-subscription-errors";
import {
  buildSiteSubscriptionCheckoutMetadata,
  SITE_SUBSCRIPTION_KIND,
  SITE_SUBSCRIPTION_PRICE_REF,
} from "./site-subscription-offer";
import { decideCheckoutReuse } from "./site-subscription-policy";

const SESSION_WAIT_MS = [40, 80, 160];

export type SiteSubscriptionCheckoutResult =
  | {
      ok: true;
      sessionId: string;
      url: string | null;
      reused: boolean;
    }
  | {
      ok: false;
      status: number;
      error: string;
      code: string;
    };

function toOpenSnapshot(row: SiteSubscriptionRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    billingMode: row.billing_mode,
    lifecycleState: row.lifecycle_state as "checkout_pending" | "active" | "ended",
    stripeCheckoutSessionId: row.stripe_checkout_session_id,
    stripeStatus: row.stripe_status,
  };
}

async function retrieveCheckoutSession(
  stripe: Stripe,
  sessionId: string,
): Promise<Stripe.Checkout.Session | null> {
  try {
    return await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return null;
  }
}

async function endExpiredClaim(row: SiteSubscriptionRow): Promise<void> {
  await updateSiteSubscription(row.id, row.billing_mode, {
    lifecycle_state: "ended",
    ended_reason: "checkout_expired",
    ended_at: new Date(),
  });
}

async function createStripeSubscriptionSession(input: {
  stripe: Stripe;
  customerId: string;
  userId: string;
  projectId: string;
  billingMode: BillingMode;
  email: string | null | undefined;
}): Promise<Stripe.Checkout.Session> {
  const metadata = buildSiteSubscriptionCheckoutMetadata({
    projectId: input.projectId,
    userId: input.userId,
    billingMode: input.billingMode,
  });
  const baseUrl = URLS.baseUrl;
  const defaults = SITE_SUBSCRIPTION_COMMERCIAL_DEFAULTS;

  return input.stripe.checkout.sessions.create({
    mode: "subscription",
    customer: input.customerId,
    customer_email: input.customerId ? undefined : input.email || undefined,
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "sek",
          unit_amount: defaults.amountOre,
          recurring: { interval: "month" },
          product_data: {
            name: defaults.productName,
            description: defaults.productDescription,
            metadata: {
              price_ref: SITE_SUBSCRIPTION_PRICE_REF,
              kind: SITE_SUBSCRIPTION_KIND,
            },
          },
        },
      },
    ],
    metadata,
    subscription_data: {
      metadata,
    },
    success_url: `${baseUrl}/konto?site_subscription=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/konto?site_subscription=canceled`,
  });
}

async function attachSession(
  row: SiteSubscriptionRow,
  session: Stripe.Checkout.Session,
): Promise<void> {
  await updateSiteSubscription(row.id, row.billing_mode, {
    stripe_checkout_session_id: session.id,
  });
}

export async function startSiteSubscriptionCheckout(input: {
  stripe: Stripe;
  userId: string;
  email: string | null | undefined;
  projectId: string;
  billingMode: BillingMode;
}): Promise<SiteSubscriptionCheckoutResult> {
  const customer = await getOrCreateBillingCustomer({
    stripe: input.stripe,
    userId: input.userId,
    email: input.email,
    billingMode: input.billingMode,
  });

  let claim = await getOpenSiteSubscription(input.projectId, input.billingMode);

  if (!claim) {
    try {
      claim = await insertCheckoutClaim({
        userId: input.userId,
        projectId: input.projectId,
        billingMode: input.billingMode,
        billingCustomerId: customer.id,
        priceRef: SITE_SUBSCRIPTION_PRICE_REF,
        amountOre: SITE_SUBSCRIPTION_COMMERCIAL_DEFAULTS.amountOre,
      });
    } catch (error) {
      if (!isUniqueViolation(error, "site_subscriptions_open_claim_unique")) {
        throw error;
      }
      claim = await getOpenSiteSubscription(input.projectId, input.billingMode);
    }
  }

  if (!claim) {
    return {
      ok: false,
      status: 409,
      error: "Kunde inte skapa abonnemangsanspråk.",
      code: "claim_failed",
    };
  }

  if (claim.user_id !== input.userId) {
    return {
      ok: false,
      status: 404,
      error: "Projektet hittades inte",
      code: "wrong_owner",
    };
  }

  for (let attempt = 0; attempt <= SESSION_WAIT_MS.length; attempt += 1) {
    const session = claim.stripe_checkout_session_id
      ? await retrieveCheckoutSession(input.stripe, claim.stripe_checkout_session_id)
      : null;
    const decision = decideCheckoutReuse({
      openRow: toOpenSnapshot(claim),
      session: session
        ? {
            id: session.id,
            status: session.status ?? "open",
            url: session.url,
            expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
          }
        : null,
      now: new Date(),
    });

    if (decision.action === "already_active") {
      return {
        ok: false,
        status: 409,
        error: "Sajten har redan ett pågående abonnemang.",
        code: "already_subscribed",
      };
    }

    if (decision.action === "reuse_session") {
      return {
        ok: true,
        sessionId: decision.sessionId,
        url: decision.url,
        reused: true,
      };
    }

    if (decision.action === "wait_for_session") {
      const wait = SESSION_WAIT_MS[attempt];
      if (wait === undefined) {
        return {
          ok: false,
          status: 409,
          error: "En checkout pågår redan. Försök igen om en stund.",
          code: "checkout_in_progress",
        };
      }
      await new Promise((resolve) => setTimeout(resolve, wait));
      claim = (await getOpenSiteSubscription(input.projectId, input.billingMode)) ?? claim;
      continue;
    }

    if (decision.action === "replace_expired") {
      await endExpiredClaim(claim);
      try {
        claim = await insertCheckoutClaim({
          userId: input.userId,
          projectId: input.projectId,
          billingMode: input.billingMode,
          billingCustomerId: customer.id,
          priceRef: SITE_SUBSCRIPTION_PRICE_REF,
          amountOre: SITE_SUBSCRIPTION_COMMERCIAL_DEFAULTS.amountOre,
        });
      } catch (error) {
        if (!isUniqueViolation(error, "site_subscriptions_open_claim_unique")) {
          throw error;
        }
        return {
          ok: false,
          status: 409,
          error: "En checkout pågår redan. Försök igen om en stund.",
          code: "checkout_in_progress",
        };
      }
    }

    const created = await createStripeSubscriptionSession({
      stripe: input.stripe,
      customerId: customer.stripeCustomerId,
      userId: input.userId,
      projectId: input.projectId,
      billingMode: input.billingMode,
      email: input.email,
    });
    await attachSession(claim, created);
    return {
      ok: true,
      sessionId: created.id,
      url: created.url,
      reused: false,
    };
  }

  return {
    ok: false,
    status: 409,
    error: "En checkout pågår redan. Försök igen om en stund.",
    code: "checkout_in_progress",
  };
}
