import { NextResponse, type NextRequest } from "next/server";
import {
  verifyTokenEdge,
  getTokenFromRequestEdge,
  isAdminEmailEdge,
} from "@/lib/auth/edge-auth";
import { getAppBaseUrl } from "@/lib/app-url";

// ---------------------------------------------------------------------------
// Path sets
// ---------------------------------------------------------------------------

const ADMIN_PREFIX = "/admin";

const AUTH_REQUIRED_PATHS = new Set(["/projects", "/buy-credits", "/inspector"]);

const ALLOWED_ORIGINS = new Set([
  getAppBaseUrl(),
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

function buildCspPolicy(pathname: string, nonce: string): string {
  if (pathname.startsWith("/api/preview-render")) {
    return [
      "default-src 'self' https: data: blob:",
      "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      "frame-src 'self' *.vusercontent.net",
      "connect-src 'self' https: *.vusercontent.net wss:",
      "media-src 'self' blob: data:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
      "report-uri /api/csp-report",
    ].join("; ");
  }

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: *.vusercontent.net *.blob.vercel-storage.com api.dicebear.com quickchart.io images.unsplash.com images.pexels.com ui.shadcn.com https://ui.shadcn.com",
    "font-src 'self' data:",
    "frame-src 'self' *.vusercontent.net",
    "connect-src 'self' *.vusercontent.net wss:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    "report-uri /api/csp-report",
  ].join("; ");
}

function addSecurityHeaders(
  response: NextResponse,
  pathname: string,
  nonce: string,
  enforceCsp: boolean,
): void {
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains",
  );

  const policy = buildCspPolicy(pathname, nonce);
  if (enforceCsp) {
    response.headers.set("Content-Security-Policy", policy);
    response.headers.delete("Content-Security-Policy-Report-Only");
  } else {
    response.headers.set("Content-Security-Policy-Report-Only", policy);
    response.headers.delete("Content-Security-Policy");
  }
}

function addCorsHeaders(
  response: NextResponse,
  origin: string | null,
): void {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  if (allowed) {
    response.headers.set("Access-Control-Allow-Origin", allowed);
    const existing = response.headers.get("Vary");
    response.headers.set("Vary", existing ? `${existing}, Origin` : "Origin");
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

let _jwtMissingWarned = false;

// ---------------------------------------------------------------------------
// Proxy (formerly middleware – renamed in Next.js 16)
// ---------------------------------------------------------------------------

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get("origin");
  const nonce = crypto.randomUUID();
  const enforceCsp = process.env.CSP_ENFORCE?.trim().toLowerCase() === "true";
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-csp-nonce", nonce);

  // ---- CORS preflight for API routes ----
  if (isApiRoute(pathname) && request.method === "OPTIONS") {
    const preflight = new NextResponse(null, { status: 204 });
    addCorsHeaders(preflight, origin);
    addSecurityHeaders(preflight, pathname, nonce, enforceCsp);
    return preflight;
  }

  // ---- Page auth redirects ----
  if (needsAdminAuth(pathname) || needsUserAuth(pathname)) {
    const token = getTokenFromRequestEdge(request);
    const jwtSecret =
      process.env.JWT_SECRET ||
      (process.env.NODE_ENV === "production"
        ? null
        : "dev-secret-do-not-use-in-prod");
    if (!jwtSecret && !_jwtMissingWarned) {
      _jwtMissingWarned = true;
      console.warn(
        "[Proxy] JWT_SECRET is not set — all auth-gated pages will redirect to /",
      );
    }
    const payload =
      token && jwtSecret ? await verifyTokenEdge(token, jwtSecret) : null;

    if (needsAdminAuth(pathname)) {
      if (!payload || !isAdminEmailEdge(payload.email)) {
        const redirect = NextResponse.redirect(new URL("/", request.url));
        addSecurityHeaders(redirect, pathname, nonce, enforceCsp);
        return redirect;
      }
    } else if (!payload) {
      const redirect = NextResponse.redirect(new URL("/", request.url));
      addSecurityHeaders(redirect, pathname, nonce, enforceCsp);
      return redirect;
    }
  }

  // ---- Continue to route ----
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // ---- CORS headers for API responses ----
  if (isApiRoute(pathname)) {
    addCorsHeaders(response, origin);
  }

  // ---- Security headers on all responses ----
  addSecurityHeaders(response, pathname, nonce, enforceCsp);

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
