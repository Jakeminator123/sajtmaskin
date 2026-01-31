/**
 * API Route: Stripe Webhook Handler
 * POST /api/stripe/webhook
 *
 * Handles payment confirmation from Stripe.
 * Adds diamonds to user account after successful payment.
 */

import { NextRequest, NextResponse } from "next/server";
import { createTransaction, getTransactionByStripeSession, getUserById } from "@/lib/db/services";
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

  console.log("[Stripe/webhook] Received event:", event.type);

  // Handle the event
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      // Check if already processed (idempotency)
      const existingTransaction = await getTransactionByStripeSession(session.id);
      if (existingTransaction) {
        console.log("[Stripe/webhook] Session already processed:", session.id);
        return NextResponse.json({ received: true });
      }

      // Get metadata
      const userId = session.metadata?.userId;
      const packageId = session.metadata?.packageId;
      const diamonds = parseInt(session.metadata?.diamonds || "0", 10);

      if (!userId || !diamonds) {
        console.error("[Stripe/webhook] Missing metadata:", session.metadata);
        return NextResponse.json({ error: "Missing metadata" }, { status: 400 });
      }

      // Verify user exists
      const user = await getUserById(userId);
      if (!user) {
        console.error("[Stripe/webhook] User not found:", userId);
        return NextResponse.json({ error: "User not found" }, { status: 400 });
      }

      // Add diamonds to user
      try {
        const transaction = await createTransaction(
          userId,
          "purchase",
          diamonds,
          `Köp: ${packageId}`,
          session.payment_intent as string,
          session.id,
        );

        console.log(
          "[Stripe/webhook] Added",
          diamonds,
          "diamonds to user",
          userId,
          "- new balance:",
          transaction.balance_after,
        );
      } catch (error) {
        console.error("[Stripe/webhook] Failed to add diamonds:", error);
        return NextResponse.json({ error: "Failed to add diamonds" }, { status: 500 });
      }

      break;
    }

    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log(
        "[Stripe/webhook] Payment failed:",
        paymentIntent.id,
        paymentIntent.last_payment_error?.message,
      );
      break;
    }

    default:
      console.log("[Stripe/webhook] Unhandled event type:", event.type);
  }

  return NextResponse.json({ received: true });
}
