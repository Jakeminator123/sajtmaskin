/**
 * Vercel Domain Price API
 * =======================
 * GET /api/vercel/domains/price?domain=example.com
 *
 * Returns the customer-facing domain price (SEK) with the shared markup
 * from `src/lib/domains/pricing.ts` applied. Wholesale figures are kept
 * in the response so the backoffice / admin tools can compare margins.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getDomainPrice,
  checkDomainAvailability,
  isVercelConfigured,
} from "@/lib/vercel/vercel-client";
import {
  applyMarkupSek,
  customerPriceFromUsd,
  fallbackCustomerPriceSek,
  USD_TO_SEK,
  FALLBACK_VERCEL_COSTS_SEK,
  DOMAIN_PRICE_MARKUP,
} from "@/lib/domains/pricing";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const domain = searchParams.get("domain");

    if (!domain) {
      return NextResponse.json(
        { success: false, error: "Domain parameter is required" },
        { status: 400 },
      );
    }

    const tld = domain.split(".").pop()?.toLowerCase() ?? "com";

    if (!isVercelConfigured()) {
      const wholesaleSek = FALLBACK_VERCEL_COSTS_SEK[tld] ?? 50;
      return NextResponse.json({
        success: true,
        domain,
        price: fallbackCustomerPriceSek(tld),
        vercelCost: wholesaleSek,
        currency: "SEK",
        period: 1,
        estimated: true,
        markup: DOMAIN_PRICE_MARKUP,
      });
    }

    try {
      const [priceData, availabilityData] = await Promise.all([
        getDomainPrice(domain),
        checkDomainAvailability(domain),
      ]);

      const wholesaleUsd = priceData.price;
      const wholesaleSek = Math.round(wholesaleUsd * USD_TO_SEK);

      return NextResponse.json({
        success: true,
        domain: priceData.name,
        price: customerPriceFromUsd(wholesaleUsd),
        vercelCost: wholesaleSek,
        priceUsd: wholesaleUsd,
        currency: "SEK",
        period: priceData.period,
        available: availabilityData.available,
        estimated: false,
        markup: DOMAIN_PRICE_MARKUP,
      });
    } catch (vercelError) {
      console.error("[API/vercel/domains/price] Vercel API error:", vercelError);

      const wholesaleSek = FALLBACK_VERCEL_COSTS_SEK[tld] ?? 50;
      return NextResponse.json({
        success: true,
        domain,
        price: applyMarkupSek(wholesaleSek),
        vercelCost: wholesaleSek,
        currency: "SEK",
        period: 1,
        estimated: true,
        markup: DOMAIN_PRICE_MARKUP,
      });
    }
  } catch (error) {
    console.error("[API/vercel/domains/price] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
