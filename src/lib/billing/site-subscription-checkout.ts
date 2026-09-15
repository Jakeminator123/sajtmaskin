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
import {
  decideCheckoutReuse,
  type CheckoutSessionLookupKind,
} from "./site-subscription-policy";
import { isStripeResourceMissing, readStripeId } from "./site-subscription-stripe";

const SESSION_WAIT_MS = [40, 80, 160];

export type SiteSubscriptionCheckoutResult =
  | {
      ok: true;
      sessionId: string;
      url: string | null;
      reused: boolean;
      confirming?: boolean;
      message?: string;
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
    stripeSubscriptionId: row.stripe_subscription_id,
  };
}

async function lookupCheckoutSession(
  stripe: Stripe,
  sessionId: string,
): Promise<{
  session: Stripe.Checkout.Session | null;
  lookup: CheckoutSessionLookupKind;
}> {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return { session, lookup: "reached" };
  } catch (error) {
    if (isStripeResourceMissing(error)) {
      return { session: null, lookup: "absent" };
    }
    return { session: null, lookup: "unreachable" };
  }
}

async function endExpiredClaim(row: SiteSubscriptionRow): Promise<SiteSubscriptionRow | null> {
  return updateSiteSubscription(
    row.id,
    row.billing_mode,
    {
      lifecycle_state: "ended",
      ended_reason: "checkout_expired",
      ended_at: new Date(),
    },
    { expectedLifecycle: "checkout_pending" },
  );
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
): Promise<SiteSubscriptionRow | null> {
  return updateSiteSubscription(
    row.id,
    row.billing_mode,
    { stripe_checkout_session_id: session.id },
    { expectedEmptyCheckoutSession: true },
  );
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
  let createdClaimThisRequest = false;

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
      createdClaimThisRequest = true;
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
    const lookedUp = claim.stripe_checkout_session_id
      ? await lookupCheckoutSession(input.stripe, claim.stripe_checkout_session_id)
      : { session: null, lookup: undefined };
    const session = lookedUp.session;
    const decision = decideCheckoutReuse({
      openRow: toOpenSnapshot(claim),
      session: session
        ? {
            id: session.id,
            status: session.status ?? "open",
            url: session.url,
            expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
            subscriptionId: readStripeId(session.subscription),
          }
        : null,
      lookup: lookedUp.lookup,
      now: new Date(),
      allowCreateWithoutSession: createdClaimThisRequest && !claim.stripe_checkout_session_id,
    });

    if (decision.action === "already_active") {
      if (decision.confirming) {
        return {
          ok: true,
          sessionId: claim.stripe_checkout_session_id ?? decision.existingId,
          url: null,
          reused: true,
          confirming: true,
          message: "Betalningen är mottagen. Abonnemanget håller på att bekräftas.",
        };
      }
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
      if (wait !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, wait));
        claim = (await getOpenSiteSubscription(input.projectId, input.billingMode)) ?? claim;
        continue;
      }
      if (claim.stripe_checkout_session_id) {
        return {
          ok: false,
          status: 409,
          error: "En checkout pågår redan. Försök igen om en stund.",
          code: "checkout_in_progress",
        };
      }
      // Tomt anspråk efter väntan: den andra fliken skrev aldrig sessionen.
    }

    if (decision.action === "replace_expired") {
      const ended = await endExpiredClaim(claim);
      if (!ended) {
        const latest = await getOpenSiteSubscription(input.projectId, input.billingMode);
        if (latest?.lifecycle_state === "active") {
          return {
            ok: false,
            status: 409,
            error: "Sajten har redan ett pågående abonnemang.",
            code: "already_subscribed",
          };
        }
        return {
          ok: false,
          status: 409,
          error: "En checkout pågår redan. Försök igen om en stund.",
          code: "checkout_in_progress",
        };
      }
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
    const attached = await attachSession(claim, created);
    if (!attached) {
      const latest = await getOpenSiteSubscription(input.projectId, input.billingMode);
      if (latest?.stripe_checkout_session_id) {
        const winner = await lookupCheckoutSession(input.stripe, latest.stripe_checkout_session_id);
        return {
          ok: true,
          sessionId: latest.stripe_checkout_session_id,
          url: winner.session?.url ?? created.url,
          reused: true,
        };
      }
      return {
        ok: false,
        status: 409,
        error: "En checkout pågår redan. Försök igen om en stund.",
        code: "checkout_in_progress",
      };
    }
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
