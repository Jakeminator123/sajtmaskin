import type Stripe from "stripe";
import type { BillingMode } from "@/lib/db/schema";
import {
  getBillingCustomer,
  insertBillingCustomer,
} from "@/lib/db/services/site-subscriptions";
import { isUniqueViolation } from "./site-subscription-errors";

export async function getOrCreateBillingCustomer(input: {
  stripe: Stripe;
  userId: string;
  email: string | null | undefined;
  billingMode: BillingMode;
}): Promise<{ id: string; stripeCustomerId: string }> {
  const existing = await getBillingCustomer(input.userId, input.billingMode);
  if (existing) {
    return { id: existing.id, stripeCustomerId: existing.stripe_customer_id };
  }

  const customer = await input.stripe.customers.create({
    email: input.email || undefined,
    metadata: {
      userId: input.userId,
      billing_mode: input.billingMode,
    },
  });

  try {
    const row = await insertBillingCustomer({
      userId: input.userId,
      billingMode: input.billingMode,
      stripeCustomerId: customer.id,
    });
    return { id: row.id, stripeCustomerId: row.stripe_customer_id };
  } catch (error) {
    if (!isUniqueViolation(error, "billing_customers_user_mode_unique")) {
      throw error;
    }
    const winner = await getBillingCustomer(input.userId, input.billingMode);
    if (!winner) throw error;
    return { id: winner.id, stripeCustomerId: winner.stripe_customer_id };
  }
}
