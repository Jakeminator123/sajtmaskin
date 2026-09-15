import type Stripe from "stripe";
import { URLS } from "@/lib/config";
import type { BillingMode } from "@/lib/db/schema";
import { getBillingCustomer } from "@/lib/db/services/site-subscriptions";

let cachedPortalConfigurationId: string | null = null;

export async function resolveCancelAtPeriodEndPortalConfiguration(
  stripe: Stripe,
): Promise<string | null> {
  if (cachedPortalConfigurationId) return cachedPortalConfigurationId;

  try {
    const existing = await stripe.billingPortal.configurations.list({ limit: 20 });
    const match = existing.data.find(
      (config) =>
        config.active &&
        config.features.subscription_cancel?.enabled &&
        config.features.subscription_cancel.mode === "at_period_end",
    );
    if (match) {
      cachedPortalConfigurationId = match.id;
      return match.id;
    }

    const created = await stripe.billingPortal.configurations.create({
      business_profile: { headline: "Sajtmaskin" },
      features: {
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        customer_update: { enabled: true, allowed_updates: ["email", "address"] },
        subscription_cancel: {
          enabled: true,
          mode: "at_period_end",
        },
        subscription_update: { enabled: false },
      },
    });
    cachedPortalConfigurationId = created.id;
    return created.id;
  } catch (error) {
    console.error("[billing] portal configuration at_period_end failed:", error);
    return null;
  }
}

export async function createSiteSubscriptionPortalSession(input: {
  stripe: Stripe;
  userId: string;
  billingMode: BillingMode;
}): Promise<{ url: string } | { error: string; status: number; code: string }> {
  const customer = await getBillingCustomer(input.userId, input.billingMode);
  if (!customer) {
    return {
      error: "Ingen faktureringskund finns ännu.",
      status: 404,
      code: "billing_customer_missing",
    };
  }

  const configuration = await resolveCancelAtPeriodEndPortalConfiguration(input.stripe);
  const session = await input.stripe.billingPortal.sessions.create({
    customer: customer.stripe_customer_id,
    return_url: `${URLS.baseUrl}/konto`,
    ...(configuration ? { configuration } : {}),
  });

  if (!session.url) {
    return { error: "Kunde inte öppna Billing Portal.", status: 502, code: "portal_url_missing" };
  }
  return { url: session.url };
}

export async function updateCancelAtPeriodEnd(input: {
  stripe: Stripe;
  stripeSubscriptionId: string;
  cancel: boolean;
}): Promise<Stripe.Subscription> {
  return input.stripe.subscriptions.update(input.stripeSubscriptionId, {
    cancel_at_period_end: input.cancel,
  });
}
