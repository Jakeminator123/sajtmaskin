/**
 * Vercel Domain Price API
 * =======================
 * GET /api/vercel/domains/price?domain=example.com
 * Returns domain price from Vercel
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getDomainPrice,
  checkDomainAvailability,
  isVercelConfigured,
} from "@/lib/vercel/vercel-client";

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

    // Check if Vercel is configured
    if (!isVercelConfigured()) {
      // Fallback: Return estimated prices with 300% markup
      const tld = domain.split(".").pop()?.toLowerCase();
      const estimatedVercelCosts: Record<string, number> = {
        se: 50, // Estimated Vercel cost
        com: 40,
        io: 133,
        app: 50,
        co: 83,
        net: 40,
        org: 40,
      };

      const vercelCostEstimate = estimatedVercelCosts[tld || "com"] || 50;
      const customerPriceEstimate = Math.round(vercelCostEstimate * 2.5); // 250% markup

      return NextResponse.json({
        success: true,
        domain,
        price: customerPriceEstimate, // Customer price (250% markup)
        vercelCost: vercelCostEstimate, // Estimated Vercel cost
        currency: "SEK",
        period: 1,
        estimated: true, // Flag that this is an estimate
      });
    }

    // Get price from Vercel
    try {
      const [priceData, availabilityData] = await Promise.all([
        getDomainPrice(domain),
        checkDomainAvailability(domain),
      ]);

      // Convert USD to SEK (approximate)
      const usdToSek = 11;
      const vercelCostUsd = priceData.price;
      const vercelCostSek = vercelCostUsd * usdToSek;

      // Apply 250% markup for customer price
      const markupMultiplier = 2.5;
      const customerPriceSek = Math.round(vercelCostSek * markupMultiplier);

      return NextResponse.json({
        success: true,
        domain: priceData.name,
        price: customerPriceSek, // Customer price (250% markup)
        vercelCost: Math.round(vercelCostSek), // Vercel's cost
        priceUsd: vercelCostUsd, // Vercel's cost in USD
        currency: "SEK",
        period: priceData.period,
        available: availabilityData.available,
        estimated: false,
      });
    } catch (vercelError) {
      console.error("[API/vercel/domains/price] Vercel API error:", vercelError);

      // Fallback to estimates with 300% markup
      const tld = domain.split(".").pop()?.toLowerCase();
      const estimatedVercelCosts: Record<string, number> = {
        se: 50, // Estimated Vercel cost
        com: 40,
        io: 133,
        app: 50,
        co: 83,
      };

      const vercelCostEstimate = estimatedVercelCosts[tld || "com"] || 50;
      const customerPriceEstimate = Math.round(vercelCostEstimate * 2.5); // 250% markup

      return NextResponse.json({
        success: true,
        domain,
        price: customerPriceEstimate, // Customer price (250% markup)
        vercelCost: vercelCostEstimate, // Estimated Vercel cost
        currency: "SEK",
        period: 1,
        estimated: true,
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
