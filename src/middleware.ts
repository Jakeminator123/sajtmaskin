import { NextResponse, type NextRequest } from "next/server";
import {
  verifyTokenEdge,
  getTokenFromRequestEdge,
  isAdminEmailEdge,
} from "@/lib/auth/edge-auth";

// ---------------------------------------------------------------------------
// Path sets
// ---------------------------------------------------------------------------

const ADMIN_PREFIX = "/admin";

const AUTH_REQUIRED_PATHS = new Set(["/projects", "/buy-credits", "/inspector"]);

const ALLOWED_ORIGINS = new Set([
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") || "http://localhost:3000",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

function needsAdminAuth(pathname: string): boolean {
  return pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);
}

function needsUserAuth(pathname: string): boolean {
  return AUTH_REQUIRED_PATHS.has(pathname);
}

function addSecurityHeaders(response: NextResponse): void {
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
}

function addCorsHeaders(
  response: NextResponse,
  origin: string | null,
): void {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  if (allowed) {
    response.headers.set("Access-Control-Allow-Origin", allowed);
  }
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept",
  );
  response.headers.set("Access-Control-Max-Age", "86400");
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get("origin");

  // ---- CORS preflight for API routes ----
  if (isApiRoute(pathname) && request.method === "OPTIONS") {
    const preflight = new NextResponse(null, { status: 204 });
    addCorsHeaders(preflight, origin);
    addSecurityHeaders(preflight);
    return preflight;
  }

  // ---- Page auth redirects ----
  if (needsAdminAuth(pathname) || needsUserAuth(pathname)) {
    const token = getTokenFromRequestEdge(request);
    // Edge Runtime cannot import config.ts (Node.js singleton), so read directly from env
    const jwtSecret = process.env.JWT_SECRET || "dev-secret-change-in-production";
    const payload = token ? await verifyTokenEdge(token, jwtSecret) : null;

    if (needsAdminAuth(pathname)) {
      if (!payload || !isAdminEmailEdge(payload.email)) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    } else if (!payload) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // ---- Continue to route ----
  const response = NextResponse.next();

  // ---- CORS headers for API responses ----
  if (isApiRoute(pathname)) {
    addCorsHeaders(response, origin);
  }

  // ---- Security headers on all responses ----
  addSecurityHeaders(response);

  return response;
}

// ---------------------------------------------------------------------------
// Matcher — skip static assets, _next internals, favicon, images
// ---------------------------------------------------------------------------

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|icons|images|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
