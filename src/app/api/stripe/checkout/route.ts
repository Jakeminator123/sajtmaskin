/**
 * API Route: Create Stripe Checkout Session
 * POST /api/stripe/checkout
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { getPackageById } from "@/lib/stripe";
import { URLS, SECRETS } from "@/lib/config";
import Stripe from "stripe";

// Initialize Stripe
const stripe = SECRETS.stripeSecretKey ? new Stripe(SECRETS.stripeSecretKey) : null;

export async function POST(req: NextRequest) {
  try {
    // Check if Stripe is configured
    if (!stripe) {
      console.error("[Stripe/checkout] Stripe not configured");
      return NextResponse.json(
        { success: false, error: "Betalningssystemet är inte konfigurerat" },
        { status: 500 },
      );
    }

    // Require authentication
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Du måste vara inloggad för att köpa diamanter",
        },
        { status: 401 },
      );
    }

    // Get package ID from request
    const body = await req.json();
    const { packageId } = body as { packageId?: string };

    if (!packageId) {
      return NextResponse.json({ success: false, error: "Paket-ID saknas" }, { status: 400 });
    }

    // Get package details
    const packageData = getPackageById(packageId);
    if (!packageData) {
      return NextResponse.json({ success: false, error: "Ogiltigt paket" }, { status: 400 });
    }

    // Get base URL for redirects
    const baseUrl = URLS.baseUrl;

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: user.email || undefined,
      line_items: [
        {
          price_data: {
            currency: "sek",
            product_data: {
              name: packageData.name,
              description: `${packageData.diamonds} diamanter för SajtMaskin`,
              images: [], // Add product image URL if you have one
            },
            unit_amount: packageData.price * 100, // Stripe uses cents/öre
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: user.id,
        packageId: packageData.id,
        diamonds: packageData.diamonds.toString(),
      },
      success_url: `${baseUrl}/buy-credits?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/buy-credits?canceled=true`,
    });

    console.log("[Stripe/checkout] Created session:", session.id);

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error("[Stripe/checkout] Error:", error);

    // Check for Stripe errors
    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        { success: false, error: "Betalningsfel: " + error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Kunde inte starta betalning. Kontrollera att du är inloggad och försök igen.",
      },
      { status: 500 },
    );
  }
}
