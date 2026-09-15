/**
 * Serverägt sajt-abonnemangserbjudande.
 *
 * Klientbelopp, klientläge och request-flaggor är aldrig auktoritet.
 * Pris och villkor ägs av `site-subscription-config.ts` (provisoriska).
 * Activation styrs av env och är AV som default; live förblir stängt.
 */

import type { BillingMode } from "@/lib/db/schema";
import {
  SITE_SUBSCRIPTION_COMMERCIAL_DEFAULTS,
  SITE_SUBSCRIPTION_PRICE_REF,
  type SiteSubscriptionCommercialDefaults,
} from "./site-subscription-config";
import { isSiteSubscriptionCheckoutReady } from "./site-subscription-flags";

export type { BillingMode };
export { SITE_SUBSCRIPTION_PRICE_REF };

export const SITE_SUBSCRIPTION_KIND = "site_subscription" as const;

export const SITE_SUBSCRIPTION_CHECKOUT_NOT_ACTIVATED =
  "site_subscription_checkout_not_activated" as const;

export const SITE_SUBSCRIPTION_ACTIVATION_NOT_READY = "activation_not_ready" as const;

export const SITE_SUBSCRIPTION_ACTIVATION_READY = "ready" as const;

export type SiteSubscriptionCommercialTerms = {
  status: "not_ratified";
  ratification: "proposal";
  amount_ore: number;
  currency: "sek";
  included_credits: number;
  rollover: boolean;
  grace_days: number;
  retention_days: number;
};

export type SiteSubscriptionOffer = {
  kind: typeof SITE_SUBSCRIPTION_KIND;
  billing_mode: BillingMode;
  price_ref: typeof SITE_SUBSCRIPTION_PRICE_REF;
  commercial_terms: SiteSubscriptionCommercialTerms;
  activation: {
    ready: boolean;
    code: typeof SITE_SUBSCRIPTION_ACTIVATION_NOT_READY | typeof SITE_SUBSCRIPTION_ACTIVATION_READY;
    live_closed?: boolean;
  };
};

export type SiteSubscriptionCheckoutMetadata = {
  kind: typeof SITE_SUBSCRIPTION_KIND;
  projectId: string;
  userId: string;
  billing_mode: BillingMode;
  price_ref: typeof SITE_SUBSCRIPTION_PRICE_REF;
};

export type SiteSubscriptionClaimCode =
  | "claim_available"
  | "open_claim_exists"
  | "invalid_claim_input";

export type SiteSubscriptionOpenRow = {
  projectId: string;
  billingMode: BillingMode;
  lifecycleState: string;
};

export type SiteSubscriptionClaimResult = {
  ok: boolean;
  code: SiteSubscriptionClaimCode;
  openClaimKey: string | null;
};

/**
 * `billing_mode` ägs av betrodd serverkonfiguration (Stripe-nyckelns läge).
 * Request-body får aldrig välja test/live.
 */
export function resolveServerBillingMode(
  stripeSecretKey: string | null | undefined,
): BillingMode | null {
  const key = stripeSecretKey?.trim() ?? "";
  if (key.startsWith("sk_live_")) return "live";
  if (key.startsWith("sk_test_")) return "test";
  return null;
}

export function snapshotSiteSubscriptionCommercialTerms(
  defaults: SiteSubscriptionCommercialDefaults = SITE_SUBSCRIPTION_COMMERCIAL_DEFAULTS,
): SiteSubscriptionCommercialTerms {
  return {
    status: "not_ratified",
    ratification: "proposal",
    amount_ore: defaults.amountOre,
    currency: "sek",
    included_credits: defaults.includedCredits,
    rollover: defaults.rollover,
    grace_days: defaults.graceDays,
    retention_days: defaults.retentionDays,
  };
}

/**
 * Request-flaggor ignoreras. Env + testläge krävs för ready.
 */
export function isSiteSubscriptionCheckoutActivated(
  _untrustedHints?: unknown,
  billingMode?: BillingMode | null,
  env: Record<string, string | undefined> = process.env,
): boolean {
  void _untrustedHints;
  return isSiteSubscriptionCheckoutReady(billingMode ?? null, env);
}

export function buildSiteSubscriptionOffer(
  billingMode: BillingMode,
  env: Record<string, string | undefined> = process.env,
): SiteSubscriptionOffer {
  const ready = isSiteSubscriptionCheckoutReady(billingMode, env);
  return {
    kind: SITE_SUBSCRIPTION_KIND,
    billing_mode: billingMode,
    price_ref: SITE_SUBSCRIPTION_PRICE_REF,
    commercial_terms: snapshotSiteSubscriptionCommercialTerms(),
    activation: {
      ready,
      code: ready ? SITE_SUBSCRIPTION_ACTIVATION_READY : SITE_SUBSCRIPTION_ACTIVATION_NOT_READY,
      ...(billingMode === "live" ? { live_closed: true } : {}),
    },
  };
}

export function buildSiteSubscriptionCheckoutMetadata(input: {
  projectId: string;
  userId: string;
  billingMode: BillingMode;
}): SiteSubscriptionCheckoutMetadata {
  return {
    kind: SITE_SUBSCRIPTION_KIND,
    projectId: input.projectId,
    userId: input.userId,
    billing_mode: input.billingMode,
    price_ref: SITE_SUBSCRIPTION_PRICE_REF,
  };
}

/** Samma nyckel som D1-schemats genererade `open_claim_key`. */
export function buildSiteSubscriptionOpenClaimKey(
  billingMode: BillingMode,
  projectId: string,
): string {
  return `${billingMode}:${projectId}`;
}

export function isOpenSiteSubscriptionLifecycle(lifecycleState: string): boolean {
  return lifecycleState !== "ended";
}

/**
 * Högst ett öppet anspråk per projekt+läge. Rena resultatkoder — ingen I/O.
 * Avslutade rader tar inte sloten.
 */
export function evaluateSiteSubscriptionOpenClaim(input: {
  projectId: string;
  billingMode: BillingMode;
  openRows?: SiteSubscriptionOpenRow[];
}): SiteSubscriptionClaimResult {
  const projectId = input.projectId.trim();
  if (!projectId) {
    return { ok: false, code: "invalid_claim_input", openClaimKey: null };
  }

  const openClaimKey = buildSiteSubscriptionOpenClaimKey(input.billingMode, projectId);
  const hasOpenClaim = (input.openRows ?? []).some(
    (row) =>
      row.projectId === projectId &&
      row.billingMode === input.billingMode &&
      isOpenSiteSubscriptionLifecycle(row.lifecycleState),
  );

  if (hasOpenClaim) {
    return { ok: false, code: "open_claim_exists", openClaimKey };
  }

  return { ok: true, code: "claim_available", openClaimKey };
}
