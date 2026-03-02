import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_COOKIE = "sajtmaskin_auth";
const SESSION_COOKIE_NAME = "sajtmaskin_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

const AUTH_PROTECTED_PAGES = ["/builder", "/admin"];
const AUTH_PROTECTED_API = ["/api/v0/", "/api/ai/"];

function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  const randomPart2 = Math.random().toString(36).substring(2, 15);
  return `sess_${timestamp}_${randomPart}${randomPart2}`;
}

function isAuthProtected(pathname: string): boolean {
  for (const prefix of AUTH_PROTECTED_PAGES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return true;
  }
  for (const prefix of AUTH_PROTECTED_API) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasAuth = request.cookies.has(AUTH_COOKIE);

  if (isAuthProtected(pathname)) {
    if (pathname.startsWith("/api/")) {
      if (!hasAuth && !request.cookies.has(SESSION_COOKIE_NAME)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else if (!hasAuth) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  const response = NextResponse.next();

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  if (pathname.startsWith("/api/proxy-preview")) {
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
  } else {
    response.headers.set("X-Frame-Options", "DENY");
  }

  if (pathname.startsWith("/api/")) {
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
