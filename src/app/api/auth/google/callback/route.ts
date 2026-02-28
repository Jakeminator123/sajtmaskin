/**
 * API Route: Google OAuth callback
 * GET /api/auth/google/callback
 */

import { NextRequest, NextResponse } from "next/server";
import { handleGoogleCallback, setAuthCookie } from "@/lib/auth/auth";

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

function parseRedirectFromState(state: string | null, req: NextRequest): string {
  const fallback = "/";
  if (!state) return fallback;

  try {
    const stateData = JSON.parse(Buffer.from(state, "base64url").toString()) as {
      redirect?: unknown;
    };
    const redirect = typeof stateData.redirect === "string" ? stateData.redirect : fallback;
    return sanitizeRedirectTarget(redirect, req);
  } catch {
    return fallback;
  }
}

function buildRedirectUrl(
  path: string,
  req: NextRequest,
  query: Record<string, string>,
): URL {
  const url = new URL(path, req.nextUrl.origin);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url;
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const redirectPath = parseRedirectFromState(state, req);

    // Check for errors from Google
    if (error) {
      console.error("[API/auth/google/callback] Google error:", error);
      return NextResponse.redirect(
        buildRedirectUrl(redirectPath, req, { error: "Google-inloggning avbröts" }),
      );
    }

    // Verify code is present
    if (!code) {
      return NextResponse.redirect(
        buildRedirectUrl(redirectPath, req, { error: "Ogiltig inloggning" }),
      );
    }

    // Keep callback URI aligned with current request origin.
    const callbackUrl = new URL("/api/auth/google/callback", req.nextUrl.origin).toString();

    // Handle callback
    const result = await handleGoogleCallback(code, callbackUrl);

    if ("error" in result) {
      return NextResponse.redirect(
        buildRedirectUrl(redirectPath, req, { error: result.error }),
      );
    }

    // Set auth cookie
    await setAuthCookie(result.token, { secure: req.nextUrl.protocol === "https:" });

    // Redirect to original page with success
    return NextResponse.redirect(buildRedirectUrl(redirectPath, req, { login: "success" }));
  } catch (error) {
    console.error("[API/auth/google/callback] Error:", error);
    return NextResponse.redirect(
      buildRedirectUrl("/", req, { error: "Något gick fel vid Google-inloggning" }),
    );
  }
}
