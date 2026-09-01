/**
 * API Route: Google OAuth callback
 * GET /api/auth/google/callback
 */

import { NextRequest } from "next/server";
import { handleGoogleCallback, setAuthCookie } from "@/lib/auth/auth";
import {
  oauthStateMatches,
  readOAuthStateCookie,
  redirectClearingOAuthState,
} from "@/lib/auth/oauth-state";

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

function parseRedirectFromState(
  state: string | null,
  req: NextRequest,
): { path: string; nonce: string | undefined } {
  const fallback = "/";
  if (!state) return { path: fallback, nonce: undefined };

  try {
    const stateData = JSON.parse(Buffer.from(state, "base64url").toString()) as {
      redirect?: unknown;
      nonce?: unknown;
    };
    const nonce = typeof stateData.nonce === "string" ? stateData.nonce : undefined;
    const redirect = typeof stateData.redirect === "string" ? stateData.redirect : fallback;
    return { path: sanitizeRedirectTarget(redirect, req), nonce };
  } catch {
    return { path: fallback, nonce: undefined };
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
    const { path: redirectPath, nonce: stateNonce } = parseRedirectFromState(state, req);
    const redirect = (url: URL) => redirectClearingOAuthState(url.toString(), req);

    if (!oauthStateMatches(readOAuthStateCookie(req), stateNonce)) {
      return redirect(buildRedirectUrl(redirectPath, req, { error: "Ogiltig inloggning" }));
    }

    // Check for errors from Google
    if (error) {
      console.error("[API/auth/google/callback] Google error:", error);
      return redirect(buildRedirectUrl(redirectPath, req, { error: "Google-inloggning avbröts" }));
    }

    // Verify code is present
    if (!code) {
      return redirect(buildRedirectUrl(redirectPath, req, { error: "Ogiltig inloggning" }));
    }

    // Keep callback URI aligned with current request origin.
    const callbackUrl = new URL("/api/auth/google/callback", req.nextUrl.origin).toString();

    // Handle callback
    const result = await handleGoogleCallback(code, callbackUrl);

    if ("error" in result) {
      return redirect(buildRedirectUrl(redirectPath, req, { error: result.error }));
    }

    // Set auth cookie
    await setAuthCookie(result.token, { secure: req.nextUrl.protocol === "https:" });

    // Redirect to original page with success
    return redirect(buildRedirectUrl(redirectPath, req, { login: "success" }));
  } catch (error) {
    console.error("[API/auth/google/callback] Error:", error);
    return redirectClearingOAuthState(
      buildRedirectUrl("/", req, { error: "Något gick fel vid Google-inloggning" }).toString(),
      req,
    );
  }
}
