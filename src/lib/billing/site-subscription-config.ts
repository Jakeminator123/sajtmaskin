/**
 * PROVISORISK affärskonfiguration för sajt-abonnemang.
 *
 * INTE affärsmässigt ratificerad. Pris, inkluderade credits, rollover,
 * respit och bevarande är förslag tills ägaren fastställer dem.
 * Servern äger värdena — klienten får aldrig skicka belopp, läge eller villkor.
 *
 * Ändra bara den här filen när villkoren ska bytas. Inga dubbletter i rutter.
 */

export const SITE_SUBSCRIPTION_COMMERCIAL_RATIFICATION = "not_ratified" as const;

/** Snapshot-referens. `proposal:` markerar att beloppet inte är ratificerat. */
export const SITE_SUBSCRIPTION_PRICE_REF = "proposal:site_subscription.monthly" as const;

export const SITE_SUBSCRIPTION_CURRENCY = "sek" as const;

/**
 * Provisoriska defaults (ägarbeslut 2026-09-15: 7 dagar grace / 90 dagar
 * retention). Månadspris och creditkvot är medvetet enkla att byta här.
 */
export const SITE_SUBSCRIPTION_COMMERCIAL_DEFAULTS = {
  ratification: SITE_SUBSCRIPTION_COMMERCIAL_RATIFICATION,
  /** 199 SEK — provisoriskt introduktionspris, inte ratificerat. */
  amountSek: 199,
  /** Stripe debiterar öre. */
  amountOre: 19_900,
  includedCredits: 40,
  /** Månatligt tillskott läggs på saldot. Köpta credits nollställs inte. */
  rollover: true,
  graceDays: 7,
  retentionDays: 90,
  interval: "month" as const,
  productName: "Sajtmaskin sajt-abonnemang",
  productDescription:
    "Provisoriskt månadsabonnemang för en publicerad sajt. Villkoren är inte ratificerade.",
} as const;

export type SiteSubscriptionCommercialDefaults =
  typeof SITE_SUBSCRIPTION_COMMERCIAL_DEFAULTS;

export function getSiteSubscriptionCommercialDefaults(): SiteSubscriptionCommercialDefaults {
  return SITE_SUBSCRIPTION_COMMERCIAL_DEFAULTS;
}

export function addCalendarDays(from: Date, days: number): Date {
  const next = new Date(from.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
