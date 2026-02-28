import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "sajtmaskin_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  const randomPart2 = Math.random().toString(36).substring(2, 15);
  return `sess_${timestamp}_${randomPart}${randomPart2}`;
}

const API_PREFIX = "/api/";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // Security headers on every response
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  if (pathname.startsWith("/api/proxy-preview")) {
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
  } else {
    response.headers.set("X-Frame-Options", "DENY");
  }

  // Only create/propagate session cookies on API routes.
  // Marketing pages stay cookie-free so Vercel edge can cache them.
  if (pathname.startsWith(API_PREFIX)) {
    let sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    let isNewSession = false;

    if (!sessionId || !sessionId.startsWith("sess_")) {
      sessionId = generateSessionId();
      isNewSession = true;
    }

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

    response.headers.set("x-session-id", sessionId);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|opengraph-image).*)",
  ],
};
