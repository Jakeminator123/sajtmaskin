/**
 * Serverägt sajt-abonnemangserbjudande och stängd checkout-kontrakt.
 *
 * Klientbelopp, klientläge och request-flaggor är aldrig auktoritet.
 * Pris, inkluderade credits, rollover, respit och bevarande är inte
 * ratificerade — de hårdkodas inte som sanning här. Activation är stängd:
 * ingen Stripe-session och ingen DB-skrivning hör hemma i den här modulen.
 */

import type { BillingMode } from "@/lib/db/schema";

export type { BillingMode };

export const SITE_SUBSCRIPTION_KIND = "site_subscription" as const;

/** Snapshot-referens. `proposal:` markerar att beloppet inte är ratificerat. */
export const SITE_SUBSCRIPTION_PRICE_REF = "proposal:site_subscription.monthly" as const;

export const SITE_SUBSCRIPTION_CHECKOUT_NOT_ACTIVATED =
  "site_subscription_checkout_not_activated" as const;

export const SITE_SUBSCRIPTION_ACTIVATION_NOT_READY = "activation_not_ready" as const;

/** Körbar grind. Finns ingen öppen väg att slå på den från request eller env. */
export const SITE_SUBSCRIPTION_CHECKOUT_ACTIVATED = false;

export type SiteSubscriptionCommercialTerms = {
  status: "not_ratified";
  ratification: "proposal";
};

export type SiteSubscriptionOffer = {
  kind: typeof SITE_SUBSCRIPTION_KIND;
  billing_mode: BillingMode;
  price_ref: typeof SITE_SUBSCRIPTION_PRICE_REF;
  commercial_terms: SiteSubscriptionCommercialTerms;
  activation: {
    ready: false;
    code: typeof SITE_SUBSCRIPTION_ACTIVATION_NOT_READY;
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

export function isSiteSubscriptionCheckoutActivated(_untrustedHints?: unknown): false {
  return SITE_SUBSCRIPTION_CHECKOUT_ACTIVATED;
}

export function buildSiteSubscriptionOffer(billingMode: BillingMode): SiteSubscriptionOffer {
  return {
    kind: SITE_SUBSCRIPTION_KIND,
    billing_mode: billingMode,
    price_ref: SITE_SUBSCRIPTION_PRICE_REF,
    commercial_terms: {
      status: "not_ratified",
      ratification: "proposal",
    },
    activation: {
      ready: false,
      code: SITE_SUBSCRIPTION_ACTIVATION_NOT_READY,
    },
  };
}

/**
 * Metadata för en framtida Stripe-session. Byggs bara som rent kontrakt —
 * anroparen får inte skicka objektet till Stripe i den här skivan.
 */
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
