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
