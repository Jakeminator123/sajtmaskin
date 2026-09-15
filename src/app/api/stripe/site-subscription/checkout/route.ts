/**
 * POST /api/stripe/site-subscription/checkout
 *
 * Skapar en Stripe Checkout Session i mode subscription för ett ägt projekt.
 * Pris/läge/villkor hämtas på servern. Env-grinden är AV som default och
 * live förblir stängt även när env är på.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getCurrentUser } from "@/lib/auth/auth";
import { startSiteSubscriptionCheckout } from "@/lib/billing/site-subscription-checkout";
import {
  SITE_SUBSCRIPTION_ACTIVATION_NOT_READY,
  SITE_SUBSCRIPTION_CHECKOUT_NOT_ACTIVATED,
  buildSiteSubscriptionOffer,
  isSiteSubscriptionCheckoutActivated,
  resolveServerBillingMode,
  type SiteSubscriptionOffer,
} from "@/lib/billing/site-subscription-offer";
import { SECRETS } from "@/lib/config";
import { getProjectByIdForOwner } from "@/lib/db/services/projects";
import { withRateLimit } from "@/lib/rate-limit";

type CheckoutBody = {
  projectId?: unknown;
  amount?: unknown;
  amount_ore?: unknown;
  mode?: unknown;
  billing_mode?: unknown;
  activate?: unknown;
  activation?: unknown;
};

function isCheckoutBody(value: unknown): value is CheckoutBody {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOwnedProjectId(body: CheckoutBody): string | null {
  if (typeof body.projectId !== "string") return null;
  const projectId = body.projectId.trim();
  return projectId || null;
}

function notActivatedResponse(offer: SiteSubscriptionOffer | null) {
  return NextResponse.json(
    {
      success: false,
      error: "Sajt-abonnemangets checkout är inte aktiverad.",
      code: SITE_SUBSCRIPTION_CHECKOUT_NOT_ACTIVATED,
      activation: SITE_SUBSCRIPTION_ACTIVATION_NOT_READY,
      ...(offer ? { offer } : {}),
    },
    { status: 503 },
  );
}

export async function POST(req: NextRequest) {
  return withRateLimit(req, "stripe:checkout", async () => {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Du måste vara inloggad" },
        { status: 401 },
      );
    }

    let parsed: unknown;
    try {
      parsed = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: "Ogiltig begäran." }, { status: 400 });
    }

    if (!isCheckoutBody(parsed)) {
      return NextResponse.json({ success: false, error: "Ogiltig begäran." }, { status: 400 });
    }

    const body = parsed;
    const projectId = readOwnedProjectId(body);
    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "projectId saknas" },
        { status: 400 },
      );
    }

    const project = await getProjectByIdForOwner(projectId, { userId: user.id });
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Projektet hittades inte" },
        { status: 404 },
      );
    }

    const billingMode = resolveServerBillingMode(SECRETS.stripeSecretKey);
    const offer = billingMode ? buildSiteSubscriptionOffer(billingMode) : null;

    if (!billingMode || !isSiteSubscriptionCheckoutActivated(body, billingMode)) {
      return notActivatedResponse(offer);
    }

    if (!SECRETS.stripeSecretKey) {
      return NextResponse.json(
        { success: false, error: "Betalningssystemet är inte konfigurerat" },
        { status: 500 },
      );
    }

    const stripe = new Stripe(SECRETS.stripeSecretKey);
    try {
      const result = await startSiteSubscriptionCheckout({
        stripe,
        userId: user.id,
        email: user.email,
        projectId,
        billingMode,
      });
      if (!result.ok) {
        return NextResponse.json(
          { success: false, error: result.error, code: result.code, offer },
          { status: result.status },
        );
      }
      return NextResponse.json({
        success: true,
        sessionId: result.sessionId,
        url: result.url,
        reused: result.reused,
        offer,
        ...(result.confirming
          ? { code: "confirming", message: result.message }
          : {}),
      });
    } catch (error) {
      console.error("[Stripe/site-subscription/checkout]", error);
      if (error instanceof Stripe.errors.StripeError) {
        return NextResponse.json(
          { success: false, error: "Betalningsfel: " + error.message },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { success: false, error: "Kunde inte starta abonnemanget." },
        { status: 500 },
      );
    }
  });
}
