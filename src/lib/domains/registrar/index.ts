/**
 * Domain offer resolution — one answer per domain, with its provenance intact.
 *
 * Search and purchase used to disagree because they assembled their own
 * answers from different sources. Everything now goes through
 * {@link resolveDomainOffer}, which returns not just "available + price" but
 * where each half came from and whether the result is strong enough to charge
 * a card against.
 *
 * Provider order is deliberate: a TLD specialist (Loopia for .se/.nu) answers
 * availability more authoritatively than the generalist, but only the
 * generalist can currently price and buy. So we ask both and merge, rather
 * than letting one TLD's owner veto the other's capability.
 */

import { referenceQuote, unknownQuote } from "@/lib/domains/pricing";
import { checkAvailabilityViaDns } from "@/lib/domains/dns-availability";
import { loopiaRegistrar } from "./loopia-registrar";
import { vercelRegistrar } from "./vercel-registrar";
import type { DomainPriceQuote } from "@/lib/domains/pricing";
import type { RegistrarId, RegistrarProvider } from "./types";

export type { RegistrarId, RegistrarProvider, RegistrarQuote } from "./types";
export { loopiaRegistrar } from "./loopia-registrar";
export { vercelRegistrar } from "./vercel-registrar";

const SPECIALISTS: readonly RegistrarProvider[] = [loopiaRegistrar];
const GENERALIST: RegistrarProvider = vercelRegistrar;

/** Why a domain that was found cannot be bought here. */
export type PurchaseBlockedReason =
  | "unknown_availability"
  | "not_available"
  | "no_binding_price"
  | "no_registrar_for_tld"
  | "purchase_disabled";

export interface DomainOffer {
  domain: string;
  tld: string;
  available: boolean | null;
  availabilitySource: RegistrarId | "dns" | "none";
  quote: DomainPriceQuote;
  /** True only when we can both charge a real price and actually deliver. */
  purchasable: boolean;
  purchaseBlockedReason: PurchaseBlockedReason | null;
  /** Which provider would fulfil the order. `null` when nobody can. */
  fulfilmentRegistrar: RegistrarId | null;
}

export function tldOf(domain: string): string {
  return domain.split(".").pop()?.toLowerCase() ?? "";
}

/** Providers relevant for a TLD: specialists first, generalist last. */
export function providersForTld(tld: string): RegistrarProvider[] {
  const specialists = SPECIALISTS.filter((p) => p.supportsTld(tld));
  return [...specialists, GENERALIST];
}

/**
 * The provider that would actually place the order, or `null`.
 *
 * Requires BOTH `canRegister()` and a binding quote — a provider willing to
 * buy at a price nobody quoted is exactly the failure mode this guards.
 */
export function fulfilmentProviderFor(
  tld: string,
  quote: DomainPriceQuote,
): RegistrarProvider | null {
  if (!quote.binding) return null;
  return providersForTld(tld).find((p) => p.canRegister()) ?? null;
}

export async function resolveDomainOffer(domain: string): Promise<DomainOffer> {
  const normalized = domain.trim().toLowerCase();
  const tld = tldOf(normalized);
  const providers = providersForTld(tld);

  const results = await Promise.all(
    providers.filter((p) => p.canQuote()).map((p) => p.getQuote(normalized)),
  );

  // Availability: first provider (specialist order) that returned a verdict.
  const withVerdict = results.find((r) => r.available !== null);
  let available = withVerdict?.available ?? null;
  let availabilitySource: DomainOffer["availabilitySource"] = withVerdict?.registrar ?? "none";

  if (available === null) {
    const dnsVerdict = await checkAvailabilityViaDns(normalized);
    if (dnsVerdict !== null) {
      available = dnsVerdict;
      availabilitySource = "dns";
    }
  }

  // Price: the first binding quote wins; otherwise a labelled reference figure
  // so the surface can still say "ungefär" instead of showing nothing.
  const binding = results.find((r) => r.quote.binding)?.quote;
  const quote = binding ?? (results.length > 0 ? referenceQuote(tld) : referenceQuote(tld));

  const fulfilment = fulfilmentProviderFor(tld, quote);
  const blockedReason = resolveBlockedReason({ available, quote, tld, fulfilment });

  return {
    domain: normalized,
    tld,
    available,
    availabilitySource,
    quote: quote ?? unknownQuote(),
    purchasable: blockedReason === null,
    purchaseBlockedReason: blockedReason,
    fulfilmentRegistrar: fulfilment?.id ?? null,
  };
}

function resolveBlockedReason(input: {
  available: boolean | null;
  quote: DomainPriceQuote;
  tld: string;
  fulfilment: RegistrarProvider | null;
}): PurchaseBlockedReason | null {
  if (input.available === false) return "not_available";
  if (input.available === null) return "unknown_availability";
  if (!input.quote.binding) return "no_binding_price";
  if (!input.fulfilment) {
    // Distinguish "nobody serves this TLD" from "purchases are switched off",
    // so the UI can say which — they need different owner actions.
    const anyImplements = providersForTld(input.tld).some(
      (p) => p.id === "vercel" && p.canQuote(),
    );
    return anyImplements ? "purchase_disabled" : "no_registrar_for_tld";
  }
  return null;
}
