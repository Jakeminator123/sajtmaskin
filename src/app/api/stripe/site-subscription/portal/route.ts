/**
 * POST /api/stripe/site-subscription/portal
 *
 * Billing Portal för inloggad användare i serverns Stripe-läge.
 * Klienten skickar aldrig ett Stripe customer-ID.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getCurrentUser } from "@/lib/auth/auth";
import { createSiteSubscriptionPortalSession } from "@/lib/billing/site-subscription-portal";
import { resolveServerBillingMode } from "@/lib/billing/site-subscription-offer";
import { SECRETS } from "@/lib/config";
import { withRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  return withRateLimit(req, "stripe:checkout", async () => {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Du måste vara inloggad" },
        { status: 401 },
      );
    }

    const billingMode = resolveServerBillingMode(SECRETS.stripeSecretKey);
    if (!billingMode || !SECRETS.stripeSecretKey) {
      return NextResponse.json(
        { success: false, error: "Betalningssystemet är inte konfigurerat" },
        { status: 503 },
      );
    }

    const stripe = new Stripe(SECRETS.stripeSecretKey);
    const result = await createSiteSubscriptionPortalSession({
      stripe,
      userId: user.id,
      billingMode,
    });
    if ("error" in result) {
      return NextResponse.json(
        { success: false, error: result.error, code: result.code },
        { status: result.status },
      );
    }
    return NextResponse.json({ success: true, url: result.url });
  });
}
