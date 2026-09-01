/**
 * API Route: Start Google OAuth flow
 * GET /api/auth/google
 */

import { NextRequest, NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@/lib/auth/auth";
import {
  createOAuthFlow,
  sanitizeOAuthReturnTo,
  setOAuthFlowCookie,
} from "@/lib/auth/oauth-state";

export async function GET(req: NextRequest) {
  try {
    const redirect = sanitizeOAuthReturnTo(
      req.nextUrl.searchParams.get("redirect"),
      req.nextUrl.origin,
      "/",
    );
    const flow = createOAuthFlow("google", req, { returnTo: redirect });

    // Google accepts one callback per first-party origin. Keeping the callback
    // on the initiating origin also keeps the host-only state cookie available.
    const callbackUrl = new URL(
      "/api/auth/google/callback",
      req.nextUrl.origin,
    ).toString();
    const authUrl = getGoogleAuthUrl(
      flow.state,
      callbackUrl,
      flow.codeChallenge,
    );

    const response = NextResponse.redirect(authUrl);
    setOAuthFlowCookie(response, "google", flow, req);
    return response;
  } catch (error) {
    console.error("[API/auth/google] Error:", error);
    const errorMessage = encodeURIComponent(
      "Google-inloggning är inte konfigurerad",
    );
    return NextResponse.redirect(new URL(`/?error=${errorMessage}`, req.url));
  }
}
