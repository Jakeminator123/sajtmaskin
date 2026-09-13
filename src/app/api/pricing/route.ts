import { NextResponse } from "next/server";
import { toPublicPricing } from "@/lib/credits/public-pricing";
import { resolvePricingSettings } from "@/lib/db/services/pricing-settings";

/**
 * Publik, effektiv creditprislista. Ingen aktör, ingen tidstämpel, inget
 * domänpåslag — bara det som faktiskt debiteras i credits.
 */
export async function GET() {
  try {
    const settings = await resolvePricingSettings();
    return NextResponse.json({
      success: true,
      ...toPublicPricing(settings),
    });
  } catch (error) {
    console.error("[API/pricing] GET failed:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte hämta prislistan." },
      { status: 500 },
    );
  }
}
