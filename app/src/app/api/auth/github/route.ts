import { NextRequest, NextResponse } from "next/server";

/**
 * GitHub OAuth - Start Flow
 *
 * Redirects user to GitHub to authorize the app.
 * After authorization, GitHub redirects back to /api/auth/github/callback
 */

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const REDIRECT_URI =
  process.env.GITHUB_REDIRECT_URI ||
  `${
    process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
  }/api/auth/github/callback`;

export async function GET(request: NextRequest) {
  if (!GITHUB_CLIENT_ID) {
    console.error("[GitHub OAuth] GITHUB_CLIENT_ID is not configured");
    return NextResponse.json(
      { success: false, error: "GitHub OAuth is not configured" },
      { status: 500 }
    );
  }

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
