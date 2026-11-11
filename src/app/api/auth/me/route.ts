/**
 * API Route: Get current user
 * GET /api/auth/me
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { toPublicAuthUser } from "@/lib/auth/public-user";

export async function GET(req: NextRequest) {
  try {
    // Try to get authenticated user
    const user = await getCurrentUser(req);

    if (user) {
      return NextResponse.json({
        success: true,
        authenticated: true,
        user: toPublicAuthUser(user),
      });
    }

    return NextResponse.json({
      success: true,
      authenticated: false,
      user: null,
      guest: null,
    });
  } catch (error) {
    console.error("[API/auth/me] Error:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte hämta användarinformation. Försök ladda om sidan." },
      { status: 500 },
    );
  }
}
