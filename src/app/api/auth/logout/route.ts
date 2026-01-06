/**
 * API Route: Logout user
 * POST /api/auth/logout
 */

import { NextResponse } from "next/server";
import { clearAuthCookie } from "@/lib/auth";

export async function POST() {
  try {
    // Clear auth cookie
    await clearAuthCookie();

    return NextResponse.json({
      success: true,
      message: "Du har loggats ut",
    });
  } catch (error) {
    console.error("[API/auth/logout] Error:", error);
    return NextResponse.json(
      { success: false, error: "Något gick fel vid utloggning" },
      { status: 500 }
    );
  }
}
