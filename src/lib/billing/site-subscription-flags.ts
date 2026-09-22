/**
 * Env-grindar för sajt-abonnemang. Alla är AV som default.
 * Request-flaggor är aldrig auktoritet.
 *
 * Checkout kan slås på i Stripe TEST utan att öppna produktion:
 * live-läge förblir stängt även när env är på.
 */

import { isAffirmativeEnvValue } from "@/lib/env-affirmative";
import type { BillingMode } from "@/lib/db/schema";

export const SITE_SUBSCRIPTION_CHECKOUT_ENV = "SAJTMASKIN_SITE_SUBSCRIPTION_CHECKOUT";
export const SITE_SUBSCRIPTION_HOSTING_WRITES_ENV =
  "SAJTMASKIN_SITE_SUBSCRIPTION_HOSTING_WRITES";
export const SITE_SUBSCRIPTION_ENFORCE_PUBLISH_ENV =
  "SAJTMASKIN_SITE_SUBSCRIPTION_ENFORCE_PUBLISH";

type EnvLookup = Record<string, string | undefined>;

export function isSiteSubscriptionCheckoutEnvEnabled(
  env: EnvLookup = process.env,
): boolean {
  return isAffirmativeEnvValue(env[SITE_SUBSCRIPTION_CHECKOUT_ENV]);
}

export function isSiteSubscriptionHostingWritesEnabled(
  env: EnvLookup = process.env,
): boolean {
  return isAffirmativeEnvValue(env[SITE_SUBSCRIPTION_HOSTING_WRITES_ENV]);
}

export function isSiteSubscriptionPublishEnforced(
  env: EnvLookup = process.env,
): boolean {
  return isAffirmativeEnvValue(env[SITE_SUBSCRIPTION_ENFORCE_PUBLISH_ENV]);
}

/**
 * Checkout är redo bara i testläge när env-grinden är på.
 * Live förblir fail-closed tills ett separat ägarbeslut öppnar det.
 */
export function isSiteSubscriptionCheckoutReady(
  billingMode: BillingMode | null | undefined,
  env: EnvLookup = process.env,
): boolean {
  return billingMode === "test" && isSiteSubscriptionCheckoutEnvEnabled(env);
}
