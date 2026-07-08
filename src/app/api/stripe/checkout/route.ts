/**
 * API Route: Stripe Checkout
 * POST /api/stripe/checkout — create a checkout session
 * GET  /api/stripe/checkout?session_id=cs_… — has the webhook credited this
 *      session yet? (purchase confirmation, #36/Codex P2)
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { getPackageById } from "@/lib/stripe";
import { URLS, SECRETS } from "@/lib/config";
import { withRateLimit } from "@/lib/rateLimit";
import { getTransactionByStripeSession } from "@/lib/db/services/transactions";
import Stripe from "stripe";

// Initialize Stripe
const stripe = SECRETS.stripeSecretKey ? new Stripe(SECRETS.stripeSecretKey) : null;

/**
 * Purchase confirmation for the buy-credits redirect (#36, Codex P2 on PR
 * #391): the client cannot reliably confirm a purchase by watching its own
 * balance — if the webhook lands before the baseline is captured, the balance
 * never "increases past baseline" and the UI stays stuck in confirming. This
 * endpoint answers the authoritative question instead: has the webhook
 * recorded a transaction for this checkout session (unique
 * `transactions.stripe_session_id`)? Scoped to the logged-in user so one user
 * cannot probe another user's session ids.
 */
export async function GET(req: NextRequest) {
  return withRateLimit(req, "stripe:checkout", async () => {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: "Inte inloggad" }, { status: 401 });
    }
    const sessionId = req.nextUrl.searchParams.get("session_id");
    if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
      return NextResponse.json(
        { success: false, error: "Ogiltigt session-id" },
        { status: 400 },
      );
    }
    try {
      const transaction = await getTransactionByStripeSession(sessionId);
      const credited = Boolean(transaction && transaction.user_id === user.id);
      return NextResponse.json({ success: true, credited });
    } catch (error) {
      console.error("[Stripe/checkout] Confirmation lookup failed:", error);
      return NextResponse.json(
        { success: false, error: "Kunde inte verifiera köpet" },
        { status: 500 },
      );
    }
  });
}

export async function POST(req: NextRequest) {
  // Rate-limit checkout sessions to prevent abuse: a logged-in (or
  // compromised) client could otherwise spam Stripe with session creates,
  // generating phishing-friendly URLs and unnecessary Stripe load.
  // Discovered in Wave 5 security audit (2026-04-24).
  return withRateLimit(req, "stripe:checkout", async () => {
    try {
      if (!stripe) {
        console.error("[Stripe/checkout] Stripe not configured");
        return NextResponse.json(
          { success: false, error: "Betalningssystemet är inte konfigurerat" },
          { status: 500 },
        );
      }

      const user = await getCurrentUser(req);
      if (!user) {
        return NextResponse.json(
          {
            success: false,
            error: "Du måste vara inloggad för att köpa credits",
          },
          { status: 401 },
        );
      }

      const body = await req.json();
      const { packageId } = body as { packageId?: string };

      if (!packageId) {
        return NextResponse.json({ success: false, error: "Paket-ID saknas" }, { status: 400 });
      }

      const packageData = getPackageById(packageId);
      if (!packageData) {
        return NextResponse.json({ success: false, error: "Ogiltigt paket" }, { status: 400 });
      }

      const baseUrl = URLS.baseUrl;

      const lineItem = packageData.priceId
        ? { price: packageData.priceId, quantity: 1 }
        : {
            price_data: {
              currency: "sek",
              product_data: {
                name: packageData.name,
                description: `${packageData.diamonds} credits för SajtMaskin`,
                images: [],
              },
              unit_amount: packageData.price * 100, // öre
            },
            quantity: 1,
          };

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: user.email || undefined,
        line_items: [lineItem],
        metadata: {
          userId: user.id,
          packageId: packageData.id,
          diamonds: packageData.diamonds.toString(),
        },
        success_url: `${baseUrl}/buy-credits?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/buy-credits?canceled=true`,
      });

      console.info("[Stripe/checkout] Created session:", session.id);

      return NextResponse.json({
        success: true,
        sessionId: session.id,
        url: session.url,
      });
    } catch (error) {
      console.error("[Stripe/checkout] Error:", error);

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
  });
}
