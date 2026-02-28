/**
 * API Route: Start Google OAuth flow
 * GET /api/auth/google
 */

import { NextRequest, NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@/lib/auth/auth";

function sanitizeRedirectTarget(rawRedirect: string | null, req: NextRequest): string {
  const fallback = "/";
  if (!rawRedirect) return fallback;

  try {
    const baseOrigin = req.nextUrl.origin;
    const candidate = new URL(rawRedirect, baseOrigin);
    if (candidate.origin !== baseOrigin) return fallback;

    return `${candidate.pathname}${candidate.search}${candidate.hash}` || fallback;
  } catch {
    return fallback;
  }
}

export async function GET(req: NextRequest) {
  try {
    // Get optional redirect URL from query params (same-origin only)
    const searchParams = req.nextUrl.searchParams;
    const redirect = sanitizeRedirectTarget(searchParams.get("redirect"), req);

    // Create state with redirect info
    const state = Buffer.from(JSON.stringify({ redirect })).toString("base64url");

    // Use current request origin for OAuth callback to avoid cross-env redirects.
    const callbackUrl = new URL("/api/auth/google/callback", req.nextUrl.origin).toString();

    // Generate Google OAuth URL
    const authUrl = getGoogleAuthUrl(state, callbackUrl);

    // Redirect to Google
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("[API/auth/google] Error:", error);

    // If Google OAuth is not configured, redirect to home with error
    const errorMessage = encodeURIComponent("Google-inloggning är inte konfigurerad");
    return NextResponse.redirect(new URL(`/?error=${errorMessage}`, req.url));
  }
}
