/**
 * API Route: Start Google OAuth flow
 * GET /api/auth/google
 */

import { NextRequest, NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@/lib/auth/auth";

export async function GET(req: NextRequest) {
  try {
    // Get optional redirect URL from query params
    const searchParams = req.nextUrl.searchParams;
    const redirect = searchParams.get("redirect") || "/";

    // Create state with redirect info
    const state = Buffer.from(JSON.stringify({ redirect })).toString(
      "base64url"
    );

    // Generate Google OAuth URL
    const authUrl = getGoogleAuthUrl(state);

    // Redirect to Google
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("[API/auth/google] Error:", error);

    // If Google OAuth is not configured, redirect to home with error
    const errorMessage = encodeURIComponent(
      "Google-inloggning är inte konfigurerad"
    );
    return NextResponse.redirect(new URL(`/?error=${errorMessage}`, req.url));
  }
}
