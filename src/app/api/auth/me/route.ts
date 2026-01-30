/**
 * API Route: Get current user
 * GET /api/auth/me
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import { getOrCreateGuestUsage } from "@/lib/data/database";

export async function GET(req: NextRequest) {
  try {
    // Try to get authenticated user
    const user = await getCurrentUser(req);

    if (user) {
      return NextResponse.json({
        success: true,
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          diamonds: user.diamonds,
          provider: user.provider,
        },
      });
    }

    // Not authenticated - return guest info
    const sessionId = getSessionIdFromRequest(req);
    let guestUsage = null;

    if (sessionId) {
      guestUsage = getOrCreateGuestUsage(sessionId);
    }

    return NextResponse.json({
      success: true,
      authenticated: false,
      user: null,
      guest: guestUsage
        ? {
            sessionId,
            generationsUsed: guestUsage.generations_used,
            refinesUsed: guestUsage.refines_used,
            canGenerate: guestUsage.generations_used < 1,
            canRefine: guestUsage.refines_used < 1,
          }
        : null,
    });
  } catch (error) {
    console.error("[API/auth/me] Error:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte hämta användarinformation. Försök ladda om sidan." },
      { status: 500 },
    );
  }
}
