import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import {
  createOAuthFlow,
  oauthOriginNotAllowedResponse,
  resolveAllowedOAuthStartOrigin,
  sanitizeOAuthReturnTo,
  setOAuthFlowCookie,
} from "@/lib/auth/oauth-state";
import { FEATURES, SECRETS, URLS } from "@/lib/config";

/**
 * GitHub OAuth - Start Flow
 *
 * Redirects a signed-in user to GitHub to connect their account.
 */
export async function GET(request: NextRequest) {
  if (!FEATURES.useGitHubAuth) {
    console.error("[GitHub OAuth] GitHub OAuth is not configured");
    return NextResponse.json(
      { success: false, error: "GitHub OAuth is not configured" },
      { status: 500 },
    );
  }

  const user = await getCurrentUser(request);
  if (!user) {
    const errorUrl = new URL("/", request.nextUrl.origin);
    errorUrl.searchParams.set("github_error", "not_authenticated");
    return NextResponse.redirect(errorUrl);
  }

  const origin = resolveAllowedOAuthStartOrigin(request);
  if (!origin) {
    return oauthOriginNotAllowedResponse();
  }

  const returnTo = sanitizeOAuthReturnTo(
    request.nextUrl.searchParams.get("returnTo"),
    origin,
    "/projects",
  );
  const flow = createOAuthFlow("github", request, {
    returnTo,
    subject: user.id,
  });

  // GitHub has one canonical registered callback. oauth-state relays that
  // callback back to this signed start origin before consuming host cookies.
  const githubAuthUrl = new URL("https://github.com/login/oauth/authorize");
  githubAuthUrl.searchParams.set("client_id", SECRETS.githubClientId);
  githubAuthUrl.searchParams.set("redirect_uri", URLS.githubCallbackUrl);
  githubAuthUrl.searchParams.set("scope", "repo user:email");
  githubAuthUrl.searchParams.set("state", flow.state);
  githubAuthUrl.searchParams.set("code_challenge", flow.codeChallenge);
  githubAuthUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(githubAuthUrl);
  setOAuthFlowCookie(response, "github", flow, request);
  return response;
}
