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

export const maxDuration = 20;

const SWEDISH_TLDS = new Set(["se", "nu"]);
const VERCEL_TLDS = ["com", "io", "app", "net", "dev", "co", "org"];

export interface DomainCheckResult {
  domain: string;
  available: boolean | null;
  price: number | null;
  currency: string;
  provider: "vercel" | "loopia" | "dns";
  purchaseUrl: string | null;
  error: string | null;
}

// DNS-based availability check (fallback when no API is configured)
async function checkViaDns(domain: string): Promise<boolean | null> {
  try {
    const res = await fetch(`https://dns.google/resolve?name=${domain}&type=A`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.Status === 3) return true; // NXDOMAIN = likely available
    if (data.Status === 0 && data.Answer) return false;
    return null;
  } catch {
    return null;
  }
}

// Check a Swedish domain (.se/.nu)
async function checkSwedishDomain(domain: string): Promise<DomainCheckResult> {
  const tld = domain.split(".").pop()!;
  const estimatedPrices: Record<string, number> = { se: 199, nu: 199 };

  if (isLoopiaConfigured()) {
    try {
      const status = await domainIsFree(domain);
      const available = status === "OK" ? true : status === "DOMAIN_OCCUPIED" ? false : null;
      return {
        domain,
        available,
        price: estimatedPrices[tld] ?? 199,
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

  // Fallback: DNS check
  const available = await checkViaDns(domain);
  return {
    domain,
    available,
    price: estimatedPrices[tld] ?? 199,
    currency: "SEK",
    provider: "dns",
    purchaseUrl: available
      ? `https://www.loopia.se/domannamn/?q=${encodeURIComponent(domain)}`
      : null,
    error: null,
  };
}

// Check a Vercel-supported domain
async function checkVercelDomain(domain: string): Promise<DomainCheckResult> {
  const USD_TO_SEK = 11;
  const MARKUP = 2.5;

  if (isVercelConfigured()) {
    try {
      const [priceData, availData] = await Promise.all([
        getDomainPrice(domain).catch(() => null),
        checkDomainAvailability(domain).catch(() => null),
      ]);

      const vercelPriceUsd = priceData?.price ?? 0;
      const priceSek = vercelPriceUsd > 0 ? Math.round(vercelPriceUsd * USD_TO_SEK * MARKUP) : null;

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

  // Fallback estimates
  const tld = domain.split(".").pop()?.toLowerCase() ?? "com";
  const estimatedPrices: Record<string, number> = {
    com: 100, io: 365, app: 138, net: 100, dev: 138, co: 228, org: 100,
  };

  const available = await checkViaDns(domain);
  return {
    domain,
    available,
    price: estimatedPrices[tld] ?? 125,
    currency: "SEK",
    provider: "dns",
    purchaseUrl: available
      ? `https://vercel.com/domains/search?q=${encodeURIComponent(domain)}`
      : null,
    error: null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawQuery = (body.query ?? "").trim().toLowerCase();

    if (!rawQuery) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    // Build domain list from query
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

    // Check all domains in parallel, routing to correct provider
    const results = await Promise.all(
      domains.map(async (domain, index): Promise<DomainCheckResult> => {
        // Slight stagger to avoid rate-limiting
        if (index > 0) {
          await new Promise((r) => setTimeout(r, index * 150));
        }

        const tld = domain.split(".").pop()?.toLowerCase() ?? "";

        if (SWEDISH_TLDS.has(tld)) {
          return checkSwedishDomain(domain);
        }
        return checkVercelDomain(domain);
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
}
