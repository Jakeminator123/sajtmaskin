/**
 * GET/POST /api/cron/site-subscription-reconcile
 *
 * Tidsstyrd avstämning för respit och paus/återställning.
 * En webhook dag 0 kör inte av sig själv dag 7.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { isCronRefreshAuthorized } from "@/app/api/shadcn/registry/refresh/cron-auth";
import { reconcileSiteSubscriptions } from "@/lib/billing/site-subscription-reconcile";
import {
  isSiteSubscriptionCheckoutEnvEnabled,
  isSiteSubscriptionHostingWritesEnabled,
} from "@/lib/billing/site-subscription-flags";
import { resolveServerBillingMode } from "@/lib/billing/site-subscription-offer";
import { SECRETS } from "@/lib/config";

async function run(req: NextRequest) {
  if (!isCronRefreshAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSiteSubscriptionCheckoutEnvEnabled() && !isSiteSubscriptionHostingWritesEnabled()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "feature_off" });
  }

  const billingMode = resolveServerBillingMode(SECRETS.stripeSecretKey);
  if (!billingMode) {
    return NextResponse.json({ error: "billing_mode_unavailable" }, { status: 503 });
  }

  const stripe = SECRETS.stripeSecretKey ? new Stripe(SECRETS.stripeSecretKey) : null;
  const result = await reconcileSiteSubscriptions({ billingMode, stripe });
  return NextResponse.json({ ok: true, billingMode, ...result });
}

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}
