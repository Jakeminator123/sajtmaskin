/**
 * Unified Domain Check API
 * ========================
 *
 * POST /api/domains/check
 * Body: { query: string }
 *
 * Checks availability + pricing across providers:
 *  - .se / .nu  -> Loopia XML-RPC API (or DNS fallback)
 *  - .com / .io / .app / .net / .dev / .co -> Vercel Registrar API
 *
 * Returns: { results: DomainCheckResult[] }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getDomainPrice,
  checkDomainAvailability,
  isVercelConfigured,
} from "@/lib/vercel/vercel-client";
import { domainIsFree, isLoopiaConfigured } from "@/lib/loopia/loopia-client";
import {
  applyMarkupSek,
  customerPriceFromUsd,
  fallbackCustomerPriceSek,
} from "@/lib/domains/pricing";
import { lookupWhois, summarizeWhois, type WhoisSummary } from "@/lib/domains/rdap-client";
import { withRateLimit } from "@/lib/rateLimit";

export const maxDuration = 20;

const SWEDISH_TLDS = new Set(["se", "nu"]);

export interface DomainCheckResult {
  domain: string;
  available: boolean | null;
  price: number | null;
  currency: string;
  provider: "vercel" | "loopia" | "dns";
  purchaseUrl: string | null;
  error: string | null;
  /**
   * Optional WHOIS/RDAP enrichment. Populated when an RDAP server exists
   * for the TLD and the lookup completed within the request budget.
   * Consumers (UI / clients) MUST treat this as best-effort metadata.
   */
  whois?: WhoisSummary | null;
}

async function checkViaDns(domain: string): Promise<boolean | null> {
  try {
    const res = await fetch(`https://dns.google/resolve?name=${domain}&type=A`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.Status === 3) return true;
    if (data.Status === 0 && data.Answer) return false;
    return null;
  } catch {
    return null;
  }
}

/**
 * Wholesale .se/.nu reference price in SEK before markup. These are the
 * approximate Loopia-style wholesale numbers used as fallbacks when the
 * registrar API doesn't return a price of its own.
 */
const SWEDISH_WHOLESALE_SEK: Record<string, number> = { se: 99, nu: 99 };

async function checkSwedishDomain(domain: string): Promise<DomainCheckResult> {
  const tld = domain.split(".").pop()!;
  const wholesale = SWEDISH_WHOLESALE_SEK[tld] ?? 99;
  const customerPrice = applyMarkupSek(wholesale);

  if (isLoopiaConfigured()) {
    try {
      const status = await domainIsFree(domain);
      const available = status === "OK" ? true : status === "DOMAIN_OCCUPIED" ? false : null;
      return {
        domain,
        available,
        price: customerPrice,
        currency: "SEK",
        provider: "loopia",
        purchaseUrl: available
          ? `https://www.loopia.se/domannamn/?q=${encodeURIComponent(domain)}`
          : null,
        error: status === "AUTH_ERROR" ? "Loopia authentication failed" : null,
      };
    } catch (err) {
      console.error(`[domains/check] Loopia error for ${domain}:`, err);
    }
  }

  const available = await checkViaDns(domain);
  return {
    domain,
    available,
    price: customerPrice,
    currency: "SEK",
    provider: "dns",
    purchaseUrl: available
      ? `https://www.loopia.se/domannamn/?q=${encodeURIComponent(domain)}`
      : null,
    error: null,
  };
}

async function checkVercelDomain(domain: string): Promise<DomainCheckResult> {
  if (isVercelConfigured()) {
    try {
      const [priceData, availData] = await Promise.all([
        getDomainPrice(domain).catch(() => null),
        checkDomainAvailability(domain).catch(() => null),
      ]);

      const vercelPriceUsd = priceData?.price ?? 0;
      const priceSek = vercelPriceUsd > 0 ? customerPriceFromUsd(vercelPriceUsd) : null;

      return {
        domain,
        available: availData?.available ?? null,
        price: priceSek,
        currency: "SEK",
        provider: "vercel",
        purchaseUrl: availData?.available
          ? `https://vercel.com/domains/search?q=${encodeURIComponent(domain)}`
          : null,
        error: null,
      };
    } catch (err) {
      console.error(`[domains/check] Vercel error for ${domain}:`, err);
    }
  }

  const tld = domain.split(".").pop()?.toLowerCase() ?? "com";
  const available = await checkViaDns(domain);
  return {
    domain,
    available,
    price: fallbackCustomerPriceSek(tld),
    currency: "SEK",
    provider: "dns",
    purchaseUrl: available
      ? `https://vercel.com/domains/search?q=${encodeURIComponent(domain)}`
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
      let domains: string[];

      if (hasTld) {
        domains = [rawQuery];
      } else {
        domains = [
          `${rawQuery}.se`,
          `${rawQuery}.com`,
          `${rawQuery}.nu`,
          `${rawQuery}.io`,
          `${rawQuery}.app`,
          `${rawQuery}.net`,
        ];
      }

      const results = await Promise.all(
        domains.map(async (domain, index): Promise<DomainCheckResult> => {
          if (index > 0) {
            await new Promise((r) => setTimeout(r, index * 150));
          }

          const tld = domain.split(".").pop()?.toLowerCase() ?? "";
          const base = SWEDISH_TLDS.has(tld)
            ? await checkSwedishDomain(domain)
            : await checkVercelDomain(domain);
          return enrichWithWhois(base);
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
