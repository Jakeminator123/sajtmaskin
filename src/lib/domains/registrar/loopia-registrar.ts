/**
 * Loopia provider — authoritative availability for .se/.nu, no registration.
 *
 * `canRegister()` is hard-coded `false` and that is not a stub waiting to be
 * filled in casually: placing a .se order requires registrant contact data and
 * a registrar agreement neither this module nor the checkout flow collects.
 * Returning `true` here would let the purchase path take money for something it
 * cannot deliver, so the honest answer keeps .se/.nu unbuyable until that work
 * is done deliberately.
 *
 * Pricing is likewise absent: Loopia's availability call returns a status code,
 * never a price. This provider therefore reports availability and leaves the
 * quote `unknown`, so the caller falls back to a clearly-labelled reference
 * figure instead of dressing a constant up as an offer.
 */

import { domainIsFree, isLoopiaConfigured } from "@/lib/loopia/loopia-client";
import { unknownQuote } from "@/lib/domains/pricing";
import type { DomainPriceQuote } from "@/lib/domains/pricing";
import type { RegisterResult, RegistrarProvider, RegistrarQuote } from "./types";

const LOOPIA_TLDS = new Set(["se", "nu"]);

export const loopiaRegistrar: RegistrarProvider = {
  id: "loopia",

  supportsTld(tld: string) {
    return LOOPIA_TLDS.has(tld.toLowerCase());
  },

  canQuote() {
    return isLoopiaConfigured();
  },

  canRegister() {
    return false;
  },

  async getQuote(domain: string): Promise<RegistrarQuote> {
    if (!isLoopiaConfigured()) {
      return {
        registrar: "loopia",
        available: null,
        quote: unknownQuote(),
        error: "loopia_not_configured",
      };
    }
    try {
      const status = await domainIsFree(domain);
      const available = status === "OK" ? true : status === "DOMAIN_OCCUPIED" ? false : null;
      return {
        registrar: "loopia",
        available,
        quote: unknownQuote(),
        error: status === "AUTH_ERROR" ? "loopia_auth_failed" : null,
      };
    } catch (err) {
      console.error(`[registrar/loopia] Availability lookup failed for ${domain}:`, err);
      return {
        registrar: "loopia",
        available: null,
        quote: unknownQuote(),
        error: "loopia_lookup_failed",
      };
    }
  },

  async register(_domain: string, _binding: DomainPriceQuote): Promise<RegisterResult> {
    throw new Error(
      "Loopia registration is not implemented (registrant contact data and a registrar agreement are required)",
    );
  },
};
