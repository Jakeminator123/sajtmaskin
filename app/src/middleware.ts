/**
 * Next.js Middleware
 *
 * Runs before every request to:
 * 1. Create/validate session cookie
 * 2. Add rate limiting headers
 * 3. (Future) Protect authenticated routes
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Session configuration
const SESSION_COOKIE_NAME = "sajtmaskin_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

// Routes that don't need session
const PUBLIC_PATHS = ["/_next", "/favicon.ico", "/api/health"];

// Generate session ID
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  const randomPart2 = Math.random().toString(36).substring(2, 15);
  return `sess_${timestamp}_${randomPart}${randomPart2}`;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public paths
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Get or create session
  let sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  let isNewSession = false;

  if (!sessionId || !sessionId.startsWith("sess_")) {
    sessionId = generateSessionId();
    isNewSession = true;
  }

  // Create response
  const response = NextResponse.next();

  // Set session cookie if new
  if (isNewSession) {
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionId,
      path: "/",
      maxAge: SESSION_MAX_AGE,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  // Add session ID to headers for API routes to access
  response.headers.set("x-session-id", sessionId);

  // Add security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return response;
}

// Configure which routes use this middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};

