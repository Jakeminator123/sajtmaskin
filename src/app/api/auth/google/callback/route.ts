/**
 * API Route: Google OAuth callback
 * GET /api/auth/google/callback
 */

import { NextRequest, NextResponse } from "next/server";
import { handleGoogleCallback, setAuthCookie } from "@/lib/auth/auth";
import {
  clearOAuthFlowCookie,
  verifyOAuthFlow,
} from "@/lib/auth/oauth-state";

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

function finishOAuthResponse(
  response: NextResponse,
  req: NextRequest,
): NextResponse {
  clearOAuthFlowCookie(response, "google", req);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const flow = verifyOAuthFlow("google", req, state);

    if (!flow.ok) {
      console.warn(
        "[API/auth/google/callback] Rejected OAuth state:",
        flow.reason,
      );
      return finishOAuthResponse(
        NextResponse.redirect(
          buildRedirectUrl("/", req, { error: "Ogiltig OAuth-session" }),
        ),
        req,
      );
    }

    const redirectPath = flow.payload.returnTo;

    if (error) {
      console.error("[API/auth/google/callback] Google error:", error);
      return finishOAuthResponse(
        NextResponse.redirect(
          buildRedirectUrl(redirectPath, req, {
            error: "Google-inloggning avbröts",
          }),
        ),
        req,
      );
    }

    if (!code) {
      return finishOAuthResponse(
        NextResponse.redirect(
          buildRedirectUrl(redirectPath, req, {
            error: "Ogiltig inloggning",
          }),
        ),
        req,
      );
    }

    const callbackUrl = new URL(
      "/api/auth/google/callback",
      flow.payload.origin,
    ).toString();
    const result = await handleGoogleCallback(
      code,
      callbackUrl,
      flow.codeVerifier,
    );

    if ("error" in result) {
      return finishOAuthResponse(
        NextResponse.redirect(
          buildRedirectUrl(redirectPath, req, { error: result.error }),
        ),
        req,
      );
    }

    await setAuthCookie(result.token, {
      secure: req.nextUrl.protocol === "https:",
    });

    return finishOAuthResponse(
      NextResponse.redirect(
        buildRedirectUrl(redirectPath, req, { login: "success" }),
      ),
      req,
    );
  } catch (error) {
    console.error("[API/auth/google/callback] Error:", error);
    return finishOAuthResponse(
      NextResponse.redirect(
        buildRedirectUrl("/", req, {
          error: "Något gick fel vid Google-inloggning",
        }),
      ),
      req,
    );
  }
}
