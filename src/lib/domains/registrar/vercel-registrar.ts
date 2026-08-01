/**
 * Vercel Registrar provider — prices, availability and (behind a flag) buys.
 *
 * Registration is gated by `SAJTMASKIN_DOMAIN_PURCHASE` on top of the usual
 * credential check. Pricing is harmless to run with a token present, but
 * placing a real order is not, and a token that exists for deploys should not
 * imply consent to spend money on the owner's registrar account.
 *
 * ---------------------------------------------------------------------------
 * `register()` IS AN UNFINISHED SKELETON — DO NOT ENABLE THE FLAG IN PROD.
 *
 * Search, pricing, Stripe Checkout, the order table and the compensation path
 * are complete and exercised by tests. The last hop is not. Two independent
 * reviews of #706 found the same thing, and it is written down here rather
 * than fixed because finishing it needs a product decision, not a patch:
 *
 *  1. `buyDomain` posts to `/v5/domains/buy`, which belongs to the retired
 *     Domains API family (sunset November 2025). The current endpoint is
 *     `POST /v1/registrar/domains/{domain}/buy`.
 *  2. That endpoint additionally requires `contactInformation` — the
 *     registrant's name, address and country. Sajtmaskin never collects any
 *     registrant data, and there is nowhere to read it from. Adding it is a
 *     UI, storage and GDPR decision, not a client-library change.
 *
 * So a paid purchase would fail at the registrar step even with a valid token.
 * Nothing can be charged today because the flag is off by default — but note
 * that "development/preview only" is a RECOMMENDATION in `config/env-policy
 * .json`, not a code guard: `FEATURES.useDomainPurchase` checks the flag and a
 * Stripe key, nothing about `NODE_ENV`. Setting it in production would take
 * effect. Before it is ever turned on, both points above must be closed and
 * the compensation path re-tested against a real registrar response. See the
 * note in `fulfilment.ts` about ambiguous post-dispatch failures, which
 * becomes reachable the moment this works.
 * ---------------------------------------------------------------------------
 */

import {
  buyDomain,
  checkDomainAvailability,
  getDomainPrice,
  isVercelConfigured,
} from "@/lib/vercel/vercel-client";
import { bindingQuoteFromUsd, unknownQuote, USD_TO_SEK } from "@/lib/domains/pricing";
import { FEATURES } from "@/lib/config";
import type { DomainPriceQuote } from "@/lib/domains/pricing";
import type { RegisterResult, RegistrarProvider, RegistrarQuote } from "./types";

export const vercelRegistrar: RegistrarProvider = {
  id: "vercel",

  // Claims nothing exclusively: the resolver treats Vercel as the generalist
  // and asks it for any TLD no specialist answered for.
  supportsTld() {
    return true;
  },

  canQuote() {
    return isVercelConfigured();
  },

  canRegister() {
    return isVercelConfigured() && FEATURES.useDomainPurchase;
  },

  async getQuote(domain: string): Promise<RegistrarQuote> {
    if (!isVercelConfigured()) {
      return {
        registrar: "vercel",
        available: null,
        quote: unknownQuote(),
        error: "vercel_not_configured",
      };
    }
    // Price and availability are independent failures: a name can be priceable
    // but unavailable, and an availability blip should not erase a good price.
    const [priceResult, availabilityResult] = await Promise.allSettled([
      getDomainPrice(domain),
      checkDomainAvailability(domain),
    ]);

    const price = priceResult.status === "fulfilled" ? priceResult.value : null;
    const availability =
      availabilityResult.status === "fulfilled" ? availabilityResult.value : null;

    const quote = price
      ? bindingQuoteFromUsd(price.price, price.period ?? 1)
      : unknownQuote();

    const failed = priceResult.status === "rejected" && availabilityResult.status === "rejected";

    return {
      registrar: "vercel",
      available: availability?.available ?? null,
      quote,
      error: failed ? "vercel_lookup_failed" : null,
    };
  },

  async register(domain: string, binding: DomainPriceQuote): Promise<RegisterResult> {
    if (!this.canRegister()) {
      throw new Error("Vercel registrar cannot register domains in this environment");
    }
    if (!binding.binding || binding.wholesaleSek === null) {
      throw new Error("Refusing to register without a binding registrar quote");
    }
    // Vercel prices in USD and rejects the buy when its current price differs
    // from `expectedPrice`. Convert back through the same fixed rate the quote
    // used so a rounding drift here cannot silently widen the accepted window.
    const expectedPriceUsd = binding.wholesaleSek / USD_TO_SEK;
    const result = await buyDomain(domain, expectedPriceUsd, {
      teamId: process.env.VERCEL_TEAM_ID,
    });
    return { registrarOrderId: result.orderId };
  },
};
