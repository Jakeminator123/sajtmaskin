/**
 * POST /api/stripe/site-subscription/reactivate
 *
 * Återaktiverar ett sajt-abonnemang för ett ägt projekt:
 * avbryter cancel-at-period-end, eller köar restore av senast publicerad version.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getCurrentUser } from "@/lib/auth/auth";
import { updateCancelAtPeriodEnd } from "@/lib/billing/site-subscription-portal";
import { enqueueHostingJob } from "@/lib/billing/site-subscription-reconcile";
import { resolveServerBillingMode } from "@/lib/billing/site-subscription-offer";
import { isGraceActive } from "@/lib/billing/site-subscription-policy";
import { isLatestInvoicePaid, retrieveSubscriptionFresh } from "@/lib/billing/site-subscription-stripe";
import { SECRETS } from "@/lib/config";
import { getProjectByIdForOwner } from "@/lib/db/services/projects";
import {
  getOpenSiteSubscription,
  updateSiteSubscription,
} from "@/lib/db/services/site-subscriptions";
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

    let body: { projectId?: unknown };
    try {
      body = (await req.json()) as { projectId?: unknown };
    } catch {
      return NextResponse.json({ success: false, error: "Ogiltig begäran." }, { status: 400 });
    }

    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
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
    if (!billingMode || !SECRETS.stripeSecretKey) {
      return NextResponse.json(
        { success: false, error: "Betalningssystemet är inte konfigurerat" },
        { status: 503 },
      );
    }

    const row = await getOpenSiteSubscription(projectId, billingMode);
    if (!row || row.user_id !== user.id) {
      return NextResponse.json(
        { success: false, error: "Inget abonnemang att återaktivera.", code: "needs_checkout" },
        { status: 404 },
      );
    }

    const stripe = new Stripe(SECRETS.stripeSecretKey);
    let cancelAtPeriodEnd = row.cancel_at_period_end;
    if (row.stripe_subscription_id && cancelAtPeriodEnd) {
      await updateCancelAtPeriodEnd({
        stripe,
        stripeSubscriptionId: row.stripe_subscription_id,
        cancel: false,
      });
      await updateSiteSubscription(row.id, billingMode, { cancel_at_period_end: false });
      cancelAtPeriodEnd = false;
    }

    const needsResume =
      row.hosting_state_actual === "paused" ||
      row.hosting_state_actual === "pausing" ||
      row.hosting_state_desired === "paused";

    if (needsResume) {
      let stripeStatus = row.stripe_status;
      let latestInvoicePaid = false;
      if (row.stripe_subscription_id) {
        const current = await retrieveSubscriptionFresh(stripe, row.stripe_subscription_id);
        stripeStatus = current.status;
        latestInvoicePaid = isLatestInvoicePaid(current);
      }
      const paidEnough =
        stripeStatus === "active" ||
        stripeStatus === "trialing" ||
        latestInvoicePaid ||
        isGraceActive(row.grace_until, new Date());
      if (!paidEnough) {
        return NextResponse.json(
          {
            success: false,
            error: "Sajten kan inte återställas utan giltig betalning.",
            code: "needs_payment",
          },
          { status: 409 },
        );
      }
    }

    if (needsResume) {
      await updateSiteSubscription(row.id, billingMode, {
        hosting_state_desired: "active",
      });
      await enqueueHostingJob({
        subscriptionId: row.id,
        billingMode,
        kind: "resume",
      });
    }

    return NextResponse.json({
      success: true,
      subscriptionId: row.id,
      cancelAtPeriodEnd,
    });
  });
}
