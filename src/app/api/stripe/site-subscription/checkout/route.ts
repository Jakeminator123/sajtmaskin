/**
 * POST /api/stripe/site-subscription/checkout
 *
 * Gated sajt-abonnemangs-checkout. Validerar inloggning och projektägare,
 * bygger ett serverägt erbjudande och svarar fail-closed. Claim-kontraktet
 * och framtida session-metadata ägs av `site-subscription-offer.ts`.
 * Skapar aldrig Stripe Checkout Session och skriver aldrig till databasen.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
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

    let body: CheckoutBody = {};
    try {
      body = (await req.json()) as CheckoutBody;
    } catch {
      return NextResponse.json({ success: false, error: "Ogiltig begäran." }, { status: 400 });
    }

    const projectId = readOwnedProjectId(body);
    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "projectId saknas" },
        { status: 400 },
      );
    }

    // Bara userId: ingen session-claim och därmed ingen implicit DB-write.
    const project = await getProjectByIdForOwner(projectId, { userId: user.id });
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Projektet hittades inte" },
        { status: 404 },
      );
    }

    const billingMode = resolveServerBillingMode(SECRETS.stripeSecretKey);
    const offer = billingMode ? buildSiteSubscriptionOffer(billingMode) : null;

    // Request-flaggor kan inte slå på activation. Ingen Stripe- eller DB-väg.
    void isSiteSubscriptionCheckoutActivated(body);
    return notActivatedResponse(offer);
  });
}
