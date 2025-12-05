import { NextRequest, NextResponse } from "next/server";
import { SECRETS, URLS, FEATURES } from "@/lib/config";

/**
 * GitHub OAuth - Start Flow
 *
 * Redirects user to GitHub to authorize the app.
 * After authorization, GitHub redirects back to /api/auth/github/callback
 */

export async function GET(request: NextRequest) {
  // Check if GitHub OAuth is enabled
  if (!FEATURES.useGitHubAuth) {
    console.error("[GitHub OAuth] GitHub OAuth is not configured");
    return NextResponse.json(
      { success: false, error: "GitHub OAuth is not configured" },
      { status: 500 }
    );
  }

  const GITHUB_CLIENT_ID = SECRETS.githubClientId;
  const REDIRECT_URI = URLS.githubCallbackUrl;

  // Get the return URL from query params (where to redirect after OAuth)
  const searchParams = request.nextUrl.searchParams;
  const returnTo = searchParams.get("returnTo") || "/projects";

  // Create state parameter to prevent CSRF and store return URL
  const state = Buffer.from(
    JSON.stringify({
      returnTo,
      timestamp: Date.now(),
    })
  ).toString("base64");

  // Build GitHub OAuth URL
  const githubAuthUrl = new URL("https://github.com/login/oauth/authorize");
  githubAuthUrl.searchParams.set("client_id", GITHUB_CLIENT_ID);
  githubAuthUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  githubAuthUrl.searchParams.set("scope", "repo user:email");
  githubAuthUrl.searchParams.set("state", state);

  console.log("[GitHub OAuth] Redirecting to GitHub for authorization");

  return NextResponse.redirect(githubAuthUrl.toString());
}
