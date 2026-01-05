/**
 * Vercel Domain Purchase API
 * ==========================
 * POST /api/vercel/domains/purchase
 * Purchases a domain via Vercel Domains Registrar API with 300% markup
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getDomainPrice,
  purchaseDomain,
  getDomainOrderStatus,
  isVercelConfigured,
  DomainContactInfo,
} from "@/lib/vercel-client";

// Allow up to 5 minutes for domain purchase and order processing
export const maxDuration = 300;

const USD_TO_SEK = 11; // Approximate conversion rate
const MARKUP_MULTIPLIER = 3; // 300% markup

/**
 * Poll order status until completion or timeout
 */
async function waitForOrderCompletion(
  orderId: string,
  teamId?: string,
  maxWaitTime = 300000, // 5 minutes (increased from 2)
  pollInterval = 3000 // 3 seconds (increased from 2)
): Promise<{ success: boolean; status: string; error?: string }> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const orderStatus = await getDomainOrderStatus(orderId, teamId);

      if (
        orderStatus.status === "completed" ||
        orderStatus.status === "success"
      ) {
        return { success: true, status: orderStatus.status };
      }

      if (orderStatus.status === "failed" || orderStatus.status === "error") {
        return {
          success: false,
          status: orderStatus.status,
          error: orderStatus.error || "Domain purchase failed",
        };
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error(
        "[API/vercel/domains/purchase] Error polling order:",
        error
      );
      // Continue polling on error
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  return {
    success: false,
    status: "timeout",
    error: "Order completion timeout - please check order status manually",
  };
}

export async function POST(request: NextRequest) {
  try {
    // Check if Vercel is configured
    if (!isVercelConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: "Vercel integration not configured. Set VERCEL_API_TOKEN.",
        },
        { status: 503 }
      );
    }

    const body = await request.json();
    const {
      domain,
      years = 1,
      contactInfo,
      teamId,
    }: {
      domain: string;
      years?: number;
      contactInfo: DomainContactInfo;
      teamId?: string;
    } = body;

    // Validate required fields
    if (!domain || typeof domain !== "string") {
      return NextResponse.json(
        { success: false, error: "Domain is required" },
        { status: 400 }
      );
    }

    if (!contactInfo || typeof contactInfo !== "object") {
      return NextResponse.json(
        { success: false, error: "Contact information is required" },
        { status: 400 }
      );
    }

    // Validate contact info fields
    const requiredFields = [
      "firstName",
      "lastName",
      "email",
      "phone",
      "address1",
      "city",
      "zip",
      "country",
    ];
    for (const field of requiredFields) {
      if (!contactInfo[field as keyof DomainContactInfo]) {
        return NextResponse.json(
          { success: false, error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // IMPORTANT: Vercel API requires "state" for all TLDs including .se
    // For countries without states (like Sweden), use city or a dash as fallback
    if (!contactInfo.state || contactInfo.state.trim() === "") {
      // Use city as state fallback (common workaround for countries without states)
      contactInfo.state = contactInfo.city || "-";
      console.log(
        "[API/vercel/domains/purchase] Using city as state fallback:",
        contactInfo.state
      );
    }

    console.log("[API/vercel/domains/purchase] Purchasing domain:", domain);

    // Get Vercel's cost for the domain
    let vercelPriceData;
    try {
      vercelPriceData = await getDomainPrice(domain, teamId);
    } catch (error) {
      console.error(
        "[API/vercel/domains/purchase] Failed to get price:",
        error
      );
      return NextResponse.json(
        {
          success: false,
          error:
            "Failed to get domain price. Domain may not be available for purchase.",
        },
        { status: 500 }
      );
    }

    // Calculate customer price (300% markup)
    const vercelCostUsd = vercelPriceData.price;
    const vercelCostSek = vercelCostUsd * USD_TO_SEK;
    const customerPriceSek = Math.round(vercelCostSek * MARKUP_MULTIPLIER);

    console.log(
      `[API/vercel/domains/purchase] Pricing: Vercel cost: ${vercelCostUsd} USD (${vercelCostSek} SEK), Customer price: ${customerPriceSek} SEK`
    );

    // Purchase domain via Vercel API
    let purchaseResult;
    try {
      purchaseResult = await purchaseDomain(domain, {
        years,
        autoRenew: true,
        expectedPrice: vercelCostUsd,
        contactInformation: contactInfo,
        teamId,
      });
    } catch (error) {
      console.error("[API/vercel/domains/purchase] Purchase failed:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to purchase domain. Please check your payment method.";
      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
        },
        { status: 500 }
      );
    }

    console.log(
      "[API/vercel/domains/purchase] Purchase initiated, order ID:",
      purchaseResult.orderId
    );

    // Wait for order completion
    const orderResult = await waitForOrderCompletion(
      purchaseResult.orderId,
      teamId
    );

    if (!orderResult.success) {
      return NextResponse.json(
        {
          success: false,
          error:
            orderResult.error ||
            "Domain purchase did not complete successfully",
          orderId: purchaseResult.orderId,
          status: orderResult.status,
        },
        { status: 500 }
      );
    }

    // Note: Domain assignment to project is handled separately
    // This API only handles domain purchase

    return NextResponse.json({
      success: true,
      orderId: purchaseResult.orderId,
      domain: purchaseResult.domain,
      customerPrice: customerPriceSek,
      vercelCost: vercelCostSek,
      currency: "SEK",
      status: orderResult.status,
    });
  } catch (error) {
    console.error("[API/vercel/domains/purchase] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
