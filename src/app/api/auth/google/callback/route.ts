/**
 * API Route: Google OAuth callback
 * GET /api/auth/google/callback
 */

import { NextRequest, NextResponse } from "next/server";
import { handleGoogleCallback, setAuthCookie } from "@/lib/auth/auth";
import {
  clearOAuthFlowCookie,
  shouldConsumeOAuthCookie,
  verifyOAuthFlow,
} from "@/lib/auth/oauth-state";

function buildRedirectUrl(
  path: string,
  origin: string,
  query: Record<string, string>,
): URL {
  const url = new URL(path, origin);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function withOAuthSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function finishOAuthResponse(
  response: NextResponse,
  req: NextRequest,
  consumeCookie: boolean,
): NextResponse {
  if (consumeCookie) {
    clearOAuthFlowCookie(response, "google", req);
  }
  return withOAuthSecurityHeaders(response);
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
      if (flow.reason === "state_origin_not_allowed") {
        return finishOAuthResponse(
          NextResponse.json(
            { success: false, error: "Otillåten origin för OAuth" },
            { status: 400 },
          ),
          req,
          false,
        );
      }
      return finishOAuthResponse(
        NextResponse.redirect(
          buildRedirectUrl("/", req.nextUrl.origin, {
            error: "Ogiltig OAuth-session",
          }),
        ),
        req,
        shouldConsumeOAuthCookie(flow),
      );
    }

    const origin = flow.payload.origin;
    const redirectPath = flow.payload.returnTo;

    if (error) {
      console.error("[API/auth/google/callback] Google error:", error);
      return finishOAuthResponse(
        NextResponse.redirect(
          buildRedirectUrl(redirectPath, origin, {
            error: "Google-inloggning avbröts",
          }),
        ),
        req,
        true,
      );
    }

    if (!code) {
      return finishOAuthResponse(
        NextResponse.redirect(
          buildRedirectUrl(redirectPath, origin, {
            error: "Ogiltig inloggning",
          }),
        ),
        req,
        true,
      );
    }

    const callbackUrl = new URL(
      "/api/auth/google/callback",
      origin,
    ).toString();
    const result = await handleGoogleCallback(
      code,
      callbackUrl,
      flow.codeVerifier,
    );

    if ("error" in result) {
      return finishOAuthResponse(
        NextResponse.redirect(
          buildRedirectUrl(redirectPath, origin, { error: result.error }),
        ),
        req,
        true,
      );
    }

    await setAuthCookie(result.token, {
      secure: req.nextUrl.protocol === "https:",
    });

    return finishOAuthResponse(
      NextResponse.redirect(
        buildRedirectUrl(redirectPath, origin, { login: "success" }),
      ),
      req,
      true,
    );
  } catch (error) {
    console.error("[API/auth/google/callback] Error:", error);
    return finishOAuthResponse(
      NextResponse.redirect(
        buildRedirectUrl("/", req.nextUrl.origin, {
          error: "Något gick fel vid Google-inloggning",
        }),
      ),
      req,
      false,
    );
  }
}
