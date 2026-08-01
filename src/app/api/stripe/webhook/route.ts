/**
 * API Route: Stripe Webhook Handler
 * POST /api/stripe/webhook
 *
 * Handles payment confirmation from Stripe.
 * Adds diamonds to user account after successful payment.
 */

import { NextRequest, NextResponse } from "next/server";
import { createTransaction, getTransactionByStripeSession } from "@/lib/db/services/transactions";
import { getUserById } from "@/lib/db/services/users";
import { SECRETS } from "@/lib/config";
import { fulfilDomainOrder } from "@/lib/domains/fulfilment";
import {
  markDomainOrderExpired,
  markDomainOrderPaid,
  getDomainOrderByStripeSession,
} from "@/lib/db/services/domain-orders";
import Stripe from "stripe";

// Initialize Stripe
const stripe = SECRETS.stripeSecretKey ? new Stripe(SECRETS.stripeSecretKey) : null;

const webhookSecret = SECRETS.stripeWebhookSecret;

export async function POST(req: NextRequest) {
  if (!stripe || !webhookSecret) {
    console.error("[Stripe/webhook] Stripe not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Get raw body for signature verification
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("[Stripe/webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  console.info("[Stripe/webhook] Received event:", event.type);

  // Handle the event
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      // Domain purchases share this endpoint but not the credits ledger: they
      // settle against `domain_orders`, so they must branch off BEFORE the
      // transaction lookup below (which would otherwise find nothing, treat the
      // session as new, and try to credit diamonds for a domain).
      if (session.metadata?.kind === "domain_purchase") {
        return handleDomainPurchaseCompleted(session);
      }

      // Check if already processed (idempotency)
      const existingTransaction = await getTransactionByStripeSession(session.id);
      if (existingTransaction) {
        console.info("[Stripe/webhook] Session already processed:", session.id);
        return NextResponse.json({ received: true });
      }

      const userId = session.metadata?.userId;
      const packageId = session.metadata?.packageId;
      const rawDiamonds = session.metadata?.diamonds;
      const diamonds = rawDiamonds ? parseInt(rawDiamonds, 10) : 0;

      // Validate that diamonds is a positive integer (parseInt returns NaN for
      // garbage input, which the previous `!diamonds` only caught coincidentally
      // because NaN is falsy — but didn't catch e.g. "-50" or "1.5").
      if (!userId || !Number.isFinite(diamonds) || diamonds <= 0) {
        // Permanent failure — Stripe must NOT retry. Log session.id only
        // (no metadata blob) to avoid leaking PII into logs.
        console.error(
          "[Stripe/webhook] Rejecting session with invalid metadata:",
          session.id,
          "(event:",
          event.id + ")",
        );
        return NextResponse.json({ received: true, ignored: "invalid_metadata" });
      }

      const user = await getUserById(userId);
      if (!user) {
        // Permanent failure — Stripe must NOT retry. User won't materialize
        // by retrying the webhook. Log session.id only, never raw userId.
        console.error(
          "[Stripe/webhook] Rejecting session with unknown user:",
          session.id,
          "(event:",
          event.id + ")",
        );
        return NextResponse.json({ received: true, ignored: "unknown_user" });
      }

      try {
        await createTransaction(
          userId,
          "purchase",
          diamonds,
          `Köp: ${packageId}`,
          session.payment_intent as string,
          session.id,
        );

        console.info(
          "[Stripe/webhook] Added",
          diamonds,
          "diamonds for session",
          session.id,
        );
      } catch (error) {
        // Race-condition idempotency guard: when two concurrent webhook
        // deliveries race past the SELECT-by-session-id check above, the
        // unique index on transactions.stripe_session_id will reject the
        // second insert. Treat that as success so Stripe doesn't retry.
        const message = error instanceof Error ? error.message : String(error);
        if (
          message.includes("transactions_stripe_session_idx") ||
          message.includes("duplicate key value") ||
          (typeof (error as { code?: string }).code === "string" &&
            (error as { code?: string }).code === "23505")
        ) {
          console.info(
            "[Stripe/webhook] Duplicate session insert ignored:",
            session.id,
          );
          return NextResponse.json({ received: true });
        }
        console.error("[Stripe/webhook] Failed to add diamonds:", error);
        return NextResponse.json({ error: "Failed to add diamonds" }, { status: 500 });
      }

      break;
    }

    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.kind === "domain_purchase") {
        // Release the name. Without this the reservation would only lapse via
        // the TTL sweep, which runs when someone next tries to buy that exact
        // domain — so an abandoned checkout could sit on a name for a while.
        await markDomainOrderExpired(session.id).catch((err) =>
          console.error("[Stripe/webhook] Could not expire domain order:", err),
        );
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.info(
        "[Stripe/webhook] Payment failed:",
        paymentIntent.id,
        paymentIntent.last_payment_error?.message,
      );
      break;
    }

    default:
      console.info("[Stripe/webhook] Unhandled event type:", event.type);
  }

  return NextResponse.json({ received: true });
}

/**
 * Settle a paid domain order.
 *
 * Idempotency is carried by the conditional `pending_payment → paid` update:
 * only the first delivery gets a row back, so only the first delivery reaches
 * the registrar. A redelivery finds the order already past `pending_payment`,
 * gets `null`, and answers 200 so Stripe stops retrying something that is
 * already done.
 *
 * 500 is reserved for states a retry could actually fix — everything else
 * (unknown session, already handled, refunded) is a delivered outcome and must
 * not be re-sent.
 */
async function handleDomainPurchaseCompleted(
  session: Stripe.Checkout.Session,
): Promise<NextResponse> {
  const paymentIntent =
    typeof session.payment_intent === "string" ? session.payment_intent : null;

  let order;
  try {
    order = await markDomainOrderPaid(session.id, paymentIntent);
  } catch (error) {
    console.error("[Stripe/webhook] Could not mark domain order paid:", error);
    return NextResponse.json({ error: "domain_order_update_failed" }, { status: 500 });
  }

  if (!order) {
    const existing = await getDomainOrderByStripeSession(session.id).catch(() => null);
    if (existing) {
      console.info("[Stripe/webhook] Domain order already handled:", existing.id);
      return NextResponse.json({ received: true, alreadyHandled: true });
    }
    // A signed session we have no order for cannot be fixed by retrying.
    console.error("[Stripe/webhook] No domain order for session:", session.id);
    return NextResponse.json({ received: true, ignored: "unknown_domain_order" });
  }

  try {
    const outcome = await fulfilDomainOrder(order);
    console.info(
      "[Stripe/webhook] Domain order",
      order.id,
      "fulfilment outcome:",
      outcome.status,
    );
    return NextResponse.json({ received: true, outcome: outcome.status });
  } catch (error) {
    // The charge already succeeded and the order is `registering`. Answer 200
    // so Stripe does not redeliver into a claimed order that would then be
    // rejected as "already handled" — the row carries the state for triage.
    console.error("[Stripe/webhook] Domain fulfilment threw for order", order.id, error);
    return NextResponse.json({ received: true, outcome: "fulfilment_error" });
  }
}
