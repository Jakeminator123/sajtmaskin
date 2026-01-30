/**
 * API Route: Check if user can generate/refine
 * GET /api/credits/check?action=generate|refine
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import { getOrCreateGuestUsage } from "@/lib/data/database";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const action = searchParams.get("action") || "generate";

    // Try to get authenticated user
    const user = await getCurrentUser(req);

    if (user) {
      // Authenticated user - check diamonds
      const canProceed = user.diamonds >= 1;

      return NextResponse.json({
        success: true,
        canProceed,
        reason: canProceed ? null : "Du har slut på diamanter. Köp fler för att fortsätta.",
        authenticated: true,
        balance: user.diamonds,
        cost: 1,
      });
    }

    // Guest user - check usage limits
    const sessionId = getSessionIdFromRequest(req);

    if (!sessionId) {
      return NextResponse.json({
        success: true,
        canProceed: true,
        reason: null,
        authenticated: false,
        guest: {
          generationsUsed: 0,
          refinesUsed: 0,
        },
      });
    }

    const guestUsage = getOrCreateGuestUsage(sessionId);

    let canProceed = false;
    let reason: string | null = null;

    if (action === "generate") {
      canProceed = guestUsage.generations_used < 1;
      if (!canProceed) {
        reason = "Du har använt din gratis generation. Skapa ett konto för att fortsätta bygga!";
      }
    } else if (action === "refine") {
      canProceed = guestUsage.refines_used < 1;
      if (!canProceed) {
        reason = "Du har använt din gratis förfining. Skapa ett konto för att fortsätta förfina!";
      }
    }

    return NextResponse.json({
      success: true,
      canProceed,
      reason,
      authenticated: false,
      guest: {
        generationsUsed: guestUsage.generations_used,
        refinesUsed: guestUsage.refines_used,
        canGenerate: guestUsage.generations_used < 1,
        canRefine: guestUsage.refines_used < 1,
      },
    });
  } catch (error) {
    console.error("[API/credits/check] Error:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte kontrollera diamanter. Försök igen." },
      { status: 500 },
    );
  }
}
