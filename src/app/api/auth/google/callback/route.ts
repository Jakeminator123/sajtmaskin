/**
 * API Route: Google OAuth callback
 * GET /api/auth/google/callback
 */

import { NextRequest, NextResponse } from "next/server";
import { handleGoogleCallback, setAuthCookie } from "@/lib/auth/auth";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // Parse redirect URL from state
    let redirectUrl = "/";
    if (state) {
      try {
        const stateData = JSON.parse(
          Buffer.from(state, "base64url").toString()
        );
        redirectUrl = stateData.redirect || "/";
      } catch {
        // Invalid state, use default redirect
      }
    }

    // Check for errors from Google
    if (error) {
      console.error("[API/auth/google/callback] Google error:", error);
      return NextResponse.redirect(
        new URL(
          `${redirectUrl}?error=${encodeURIComponent(
            "Google-inloggning avbröts"
          )}`,
          req.url
        )
      );
    }

    // Verify code is present
    if (!code) {
      return NextResponse.redirect(
        new URL(
          `${redirectUrl}?error=${encodeURIComponent("Ogiltig inloggning")}`,
          req.url
        )
      );
    }

    // Handle callback
    const result = await handleGoogleCallback(code);

    if ("error" in result) {
      return NextResponse.redirect(
        new URL(
          `${redirectUrl}?error=${encodeURIComponent(result.error)}`,
          req.url
        )
      );
    }

    // Set auth cookie
    await setAuthCookie(result.token);

    // Redirect to original page with success
    return NextResponse.redirect(
      new URL(`${redirectUrl}?login=success`, req.url)
    );
  } catch (error) {
    console.error("[API/auth/google/callback] Error:", error);
    return NextResponse.redirect(
      new URL(
        `/?error=${encodeURIComponent("Något gick fel vid Google-inloggning")}`,
        req.url
      )
    );
  }
}
