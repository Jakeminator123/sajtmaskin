/**
 * Vercel Domain Price API
 * =======================
 * GET /api/vercel/domains/price?domain=example.com
 *
 * Returns the customer-facing domain price (SEK) with the operator-set markup
 * applied. Markup and USD→SEK are resolved once per request from
 * `pricing_settings`; the functions in `src/lib/domains/pricing.ts` stay pure
 * and receive them as an argument. Wholesale figures are kept in the response
 * so the backoffice / admin tools can compare margins.
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
  referenceWholesaleSek,
} from "@/lib/domains/pricing";
import { resolvePricingSettings } from "@/lib/db/services/pricing-settings";

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
    const { domain: domainPricing } = await resolvePricingSettings();

    if (!isVercelConfigured()) {
      const wholesaleSek = referenceWholesaleSek(tld);
      return NextResponse.json({
        success: true,
        domain,
        price: fallbackCustomerPriceSek(tld, domainPricing),
        vercelCost: wholesaleSek,
        currency: "SEK",
        period: 1,
        estimated: true,
        markup: domainPricing.markup,
      });
    }

    try {
      const [priceData, availabilityData] = await Promise.all([
        getDomainPrice(domain),
        checkDomainAvailability(domain),
      ]);

      const wholesaleUsd = priceData.price;
      const wholesaleSek = Math.round(wholesaleUsd * domainPricing.usdToSek);

      return NextResponse.json({
        success: true,
        domain: priceData.name,
        price: customerPriceFromUsd(wholesaleUsd, domainPricing),
        vercelCost: wholesaleSek,
        priceUsd: wholesaleUsd,
        currency: "SEK",
        period: priceData.period,
        available: availabilityData.available,
        estimated: false,
        markup: domainPricing.markup,
      });
    } catch (vercelError) {
      console.error("[API/vercel/domains/price] Vercel API error:", vercelError);

      const wholesaleSek = referenceWholesaleSek(tld);
      return NextResponse.json({
        success: true,
        domain,
        price: applyMarkupSek(wholesaleSek, domainPricing),
        vercelCost: wholesaleSek,
        currency: "SEK",
        period: 1,
        estimated: true,
        markup: domainPricing.markup,
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
