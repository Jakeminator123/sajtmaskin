import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { updateUserGitHub } from "@/lib/database";

/**
 * GitHub OAuth - Callback Handler
 *
 * Receives the authorization code from GitHub, exchanges it for an access token,
 * and stores the token in the user's record.
 */

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  error?: string;
  error_description?: string;
}

interface GitHubUser {
  login: string;
  id: number;
  name: string | null;
  email: string | null;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Parse state to get return URL
  let returnTo = "/projects";
  if (state) {
    try {
      const stateData = JSON.parse(Buffer.from(state, "base64").toString());
      returnTo = stateData.returnTo || "/projects";
    } catch {
      console.warn("[GitHub OAuth] Could not parse state parameter");
    }
  }

  // Handle OAuth errors
  if (error) {
    console.error("[GitHub OAuth] Error from GitHub:", error);
    const errorUrl = new URL(returnTo, request.url);
    errorUrl.searchParams.set("github_error", error);
    return NextResponse.redirect(errorUrl.toString());
  }

  if (!code) {
    console.error("[GitHub OAuth] No authorization code received");
    const errorUrl = new URL(returnTo, request.url);
    errorUrl.searchParams.set("github_error", "no_code");
    return NextResponse.redirect(errorUrl.toString());
  }

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    console.error("[GitHub OAuth] GitHub OAuth is not configured");
    const errorUrl = new URL(returnTo, request.url);
    errorUrl.searchParams.set("github_error", "not_configured");
    return NextResponse.redirect(errorUrl.toString());
  }

  // Get current user (must be logged in to connect GitHub)
  const user = await getCurrentUser(request);
  if (!user) {
    console.error("[GitHub OAuth] No authenticated user");
    const errorUrl = new URL("/", request.url);
    errorUrl.searchParams.set("github_error", "not_authenticated");
    return NextResponse.redirect(errorUrl.toString());
  }

  try {
    // Exchange code for access token
    console.log("[GitHub OAuth] Exchanging code for access token...");

    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
        }),
      }
    );

    const tokenData: GitHubTokenResponse = await tokenResponse.json();

    if (tokenData.error) {
      console.error("[GitHub OAuth] Token error:", tokenData.error);
      const errorUrl = new URL(returnTo, request.url);
      errorUrl.searchParams.set("github_error", tokenData.error);
      return NextResponse.redirect(errorUrl.toString());
    }

    const accessToken = tokenData.access_token;

    // Get GitHub user info
    console.log("[GitHub OAuth] Fetching user info...");

    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!userResponse.ok) {
      console.error("[GitHub OAuth] Failed to fetch user info");
      const errorUrl = new URL(returnTo, request.url);
      errorUrl.searchParams.set("github_error", "user_fetch_failed");
      return NextResponse.redirect(errorUrl.toString());
    }

    const githubUser: GitHubUser = await userResponse.json();

    // Store GitHub token and username in user record
    console.log(
      "[GitHub OAuth] Saving GitHub connection for user:",
      user.id,
      "GitHub:",
      githubUser.login
    );

    updateUserGitHub(user.id, accessToken, githubUser.login);

    // Redirect back with success
    const successUrl = new URL(returnTo, request.url);
    successUrl.searchParams.set("github_connected", "true");
    successUrl.searchParams.set("github_username", githubUser.login);

    console.log("[GitHub OAuth] Successfully connected GitHub account");

    return NextResponse.redirect(successUrl.toString());
  } catch (error) {
    console.error("[GitHub OAuth] Error:", error);
    const errorUrl = new URL(returnTo, request.url);
    errorUrl.searchParams.set("github_error", "unknown");
    return NextResponse.redirect(errorUrl.toString());
  }
}
