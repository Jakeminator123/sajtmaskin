/**
 * Unified Domain Check API
 * ========================
 *
 * POST /api/domains/check
 * Body: { query: string }
 *
 * Availability + price for a name (or a spread of TLDs when the query has
 * none). Everything comes from `resolveDomainOffer`, the same resolver the
 * purchase route uses, so search and checkout can no longer disagree about
 * whether a name is free or what it costs.
 *
 * The response distinguishes a real quote from an estimate (`priceEstimated`)
 * and says whether the name can actually be bought here (`purchasable` +
 * `purchaseBlockedReason`). Before that split every result rendered as a bare
 * number, so a reference figure for a `.se` was indistinguishable from a
 * registrar quote for a `.com` — which is what made the prices look arbitrary.
 */

import { NextRequest, NextResponse } from "next/server";
import { isVercelConfigured } from "@/lib/vercel/vercel-client";
import { isLoopiaConfigured } from "@/lib/loopia/loopia-client";
import { resolveDomainOffer, type DomainOffer } from "@/lib/domains/registrar";
import { lookupWhois, summarizeWhois, type WhoisSummary } from "@/lib/domains/rdap-client";
import { withRateLimit } from "@/lib/rateLimit";

export const maxDuration = 20;

export interface DomainCheckResult {
  domain: string;
  available: boolean | null;
  price: number | null;
  currency: string;
  provider: "vercel" | "loopia" | "dns" | "none";
  /** True when `price` is a per-TLD reference figure, not a registrar quote. */
  priceEstimated: boolean;
  /** True when the name can be bought in-app right now. */
  purchasable: boolean;
  purchaseBlockedReason: string | null;
  /** External registrar link, offered only when we cannot sell it ourselves. */
  purchaseUrl: string | null;
  error: string | null;
  /**
   * Optional WHOIS/RDAP enrichment. Populated when an RDAP server exists
   * for the TLD and the lookup completed within the request budget.
   * Consumers (UI / clients) MUST treat this as best-effort metadata.
   */
  whois?: WhoisSummary | null;
}

function externalPurchaseUrl(domain: string, tld: string): string {
  return tld === "se" || tld === "nu"
    ? `https://www.loopia.se/domannamn/?q=${encodeURIComponent(domain)}`
    : `https://vercel.com/domains/search?q=${encodeURIComponent(domain)}`;
}

function toCheckResult(offer: DomainOffer): DomainCheckResult {
  return {
    domain: offer.domain,
    available: offer.available,
    price: offer.quote.customerSek,
    currency: offer.quote.currency,
    provider: offer.availabilitySource,
    priceEstimated: !offer.quote.binding,
    purchasable: offer.purchasable,
    purchaseBlockedReason: offer.purchaseBlockedReason,
    // Only point people elsewhere when we genuinely cannot complete the sale.
    purchaseUrl:
      offer.available === true && !offer.purchasable
        ? externalPurchaseUrl(offer.domain, offer.tld)
        : null,
    error: null,
  };
}

/**
 * Best-effort RDAP enrichment. Never blocks the availability response —
 * if the lookup throws or RDAP doesn't cover the TLD we just omit the
 * field and the consumer falls back to availability-only data.
 */
async function enrichWithWhois(result: DomainCheckResult): Promise<DomainCheckResult> {
  try {
    const whois = await lookupWhois(result.domain);
    const summary = summarizeWhois(whois);
    if (!summary) return result;

    /**
     * RDAP is the most reliable signal of registration: if it responds
     * with 404 the registry is telling us the name doesn't exist. Use
     * that to firm up `available` when the primary source was uncertain.
     */
    const merged: DomainCheckResult = { ...result, whois: summary };
    if (merged.available === null && summary.registered === false) {
      merged.available = true;
    }
    if (merged.available === null && summary.registered === true) {
      merged.available = false;
    }
    return merged;
  } catch (err) {
    console.warn(`[domains/check] RDAP enrichment failed for ${result.domain}:`, err);
    return result;
  }
}

export async function POST(req: NextRequest) {
  return withRateLimit(req, "domains:check", async () => {
    try {
      const body = await req.json();
      const rawQuery = (body.query ?? "").trim().toLowerCase();

      if (!rawQuery) {
        return NextResponse.json({ error: "query is required" }, { status: 400 });
      }

      const hasTld = rawQuery.includes(".");
      const domains = hasTld
        ? [rawQuery]
        : [
            `${rawQuery}.se`,
            `${rawQuery}.com`,
            `${rawQuery}.nu`,
            `${rawQuery}.io`,
            `${rawQuery}.app`,
            `${rawQuery}.net`,
          ];

      const results = await Promise.all(
        domains.map(async (domain, index): Promise<DomainCheckResult> => {
          if (index > 0) {
            await new Promise((r) => setTimeout(r, index * 150));
          }
          const offer = await resolveDomainOffer(domain);
          return enrichWithWhois(toCheckResult(offer));
        }),
      );

      return NextResponse.json({
        success: true,
        results,
        providers: {
          vercel: isVercelConfigured(),
          loopia: isLoopiaConfigured(),
        },
      });
    } catch (error) {
      console.error("[domains/check] Error:", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}
