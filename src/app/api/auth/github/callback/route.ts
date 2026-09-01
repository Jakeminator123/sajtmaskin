import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import {
  clearOAuthFlowCookie,
  parseOAuthState,
  relayOAuthCallbackIfNeeded,
  verifyOAuthFlow,
} from "@/lib/auth/oauth-state";
import { FEATURES, SECRETS, URLS } from "@/lib/config";
import { updateUserGitHub } from "@/lib/db/services/users";

interface GitHubTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface GitHubUser {
  login: string;
  id: number;
  name: string | null;
  email: string | null;
}

function redirectWithGitHubError(
  origin: string,
  returnTo: string,
  error: string,
): NextResponse {
  const errorUrl = new URL(returnTo, origin);
  errorUrl.searchParams.set("github_error", error);
  return NextResponse.redirect(errorUrl);
}

function finishOAuthResponse(
  response: NextResponse,
  request: NextRequest,
): NextResponse {
  clearOAuthFlowCookie(response, "github", request);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

/**
 * GitHub OAuth - Callback Handler
 *
 * The configured callback may be canonical while the flow began on another
 * first-party app origin. A valid signed state is relayed to that start origin
 * before its host-only auth/state cookies are consumed.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const providerError = searchParams.get("error");

  const parsed = parseOAuthState("github", state);
  if (!parsed.ok) {
    console.warn("[GitHub OAuth] Rejected OAuth state:", parsed.reason);
    return finishOAuthResponse(
      redirectWithGitHubError(
        request.nextUrl.origin,
        "/projects",
        "invalid_state",
      ),
      request,
    );
  }

  const relay = relayOAuthCallbackIfNeeded(request, parsed);
  if (relay) return relay;

  const flow = verifyOAuthFlow("github", request, state);
  if (!flow.ok) {
    console.warn("[GitHub OAuth] Rejected OAuth flow:", flow.reason);
    return finishOAuthResponse(
      redirectWithGitHubError(
        parsed.payload.origin,
        "/projects",
        "invalid_state",
      ),
      request,
    );
  }

  const origin = flow.payload.origin;
  const returnTo = flow.payload.returnTo;

  if (providerError) {
    console.error("[GitHub OAuth] Error from GitHub:", providerError);
    return finishOAuthResponse(
      redirectWithGitHubError(origin, returnTo, providerError),
      request,
    );
  }

  if (!code) {
    console.error("[GitHub OAuth] No authorization code received");
    return finishOAuthResponse(
      redirectWithGitHubError(origin, returnTo, "no_code"),
      request,
    );
  }

  if (!FEATURES.useGitHubAuth) {
    console.error("[GitHub OAuth] GitHub OAuth is not configured");
    return finishOAuthResponse(
      redirectWithGitHubError(origin, returnTo, "not_configured"),
      request,
    );
  }

  const user = await getCurrentUser(request);
  if (!user || !flow.payload.subject || user.id !== flow.payload.subject) {
    console.error("[GitHub OAuth] Initiating user/session no longer matches");
    return finishOAuthResponse(
      redirectWithGitHubError(origin, "/", "session_changed"),
      request,
    );
  }

  try {
    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: SECRETS.githubClientId,
          client_secret: SECRETS.githubClientSecret,
          code,
          redirect_uri: URLS.githubCallbackUrl,
          code_verifier: flow.codeVerifier,
        }),
      },
    );

    const tokenData: GitHubTokenResponse = await tokenResponse.json();
    if (tokenData.error || !tokenData.access_token) {
      console.error(
        "[GitHub OAuth] Token exchange failed:",
        tokenData.error ?? `HTTP ${tokenResponse.status}`,
      );
      return finishOAuthResponse(
        redirectWithGitHubError(
          origin,
          returnTo,
          tokenData.error ?? "token_exchange_failed",
        ),
        request,
      );
    }

    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!userResponse.ok) {
      console.error("[GitHub OAuth] Failed to fetch user info");
      return finishOAuthResponse(
        redirectWithGitHubError(origin, returnTo, "user_fetch_failed"),
        request,
      );
    }

    const githubUser: GitHubUser = await userResponse.json();
    await updateUserGitHub(
      user.id,
      tokenData.access_token,
      githubUser.login,
    );

    const successUrl = new URL(returnTo, origin);
    successUrl.searchParams.set("github_connected", "true");
    successUrl.searchParams.set("github_username", githubUser.login);

    return finishOAuthResponse(
      NextResponse.redirect(successUrl),
      request,
    );
  } catch (error) {
    console.error("[GitHub OAuth] Error:", error);
    return finishOAuthResponse(
      redirectWithGitHubError(origin, returnTo, "unknown"),
      request,
    );
  }
}
