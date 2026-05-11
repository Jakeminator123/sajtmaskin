import { NextResponse, type NextRequest } from "next/server";
import { verifyTokenEdge, getTokenFromRequestEdge, isAdminEmailEdge } from "@/lib/auth/edge-auth";
import { getAppBaseUrl } from "@/lib/app-url";

// ---------------------------------------------------------------------------
// Path sets
// ---------------------------------------------------------------------------

const ADMIN_PREFIX = "/admin";

const AUTH_REQUIRED_PATHS = new Set(["/projects", "/buy-credits"]);

const ALLOWED_ORIGINS = new Set(
  [getAppBaseUrl(), process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ""].filter(
    Boolean,
  ),
);

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

const DID_EMBED_HOSTS = ["https://agent.d-id.com", "https://d-id.com", "https://*.d-id.com", "https://studio.d-id.com"];
const VERCEL_ANALYTICS_SCRIPT_SRC = "https://va.vercel-scripts.com";
const VERCEL_ANALYTICS_CONNECT_SRC = "https://vitals.vercel-insights.com";

function isAvatarRoute(pathname: string): boolean {
  return pathname === "/avatar";
}

function allowsStaticSeoInlineScripts(pathname: string): boolean {
  return (
    pathname === "/landningssidor" ||
    pathname.startsWith("/ai-hemsida/") ||
    pathname.startsWith("/alternativ-till/") ||
    pathname.startsWith("/hemsida-for/") ||
    pathname.startsWith("/hemsida/") ||
    pathname.startsWith("/skapa-hemsida/")
  );
}

function getTier2PreviewHostCspSources(): string[] {
  const sources = new Set<string>();

  const baseUrl = process.env.SAJTMASKIN_PREVIEW_HOST_BASE_URL?.trim();
  if (baseUrl) {
    try {
      const url = new URL(baseUrl);
      if (url.origin) {
        sources.add(url.origin);
      }
    } catch {
      /* ignore invalid preview host URL */
    }
  }

  const rawSuffixes = process.env.NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES?.trim();
  if (!rawSuffixes) {
    return Array.from(sources);
  }

  for (const suffix of rawSuffixes.split(",")) {
    const normalized = suffix.trim().toLowerCase().replace(/^\./, "");
    if (!normalized) continue;
    sources.add(`https://${normalized}`);
    sources.add(`https://*.${normalized}`);
  }

  return Array.from(sources);
}

export function buildCspPolicy(
  pathname: string,
  nonce: string,
  allowLocalRuntimeScripts: boolean,
  currentOriginSources: string[],
): string {
  const isDev = process.env.NODE_ENV !== "production";
  const allowDidEmbed = isAvatarRoute(pathname);
  const allowInlineScriptElements = allowsStaticSeoInlineScripts(pathname);
  const tier2PreviewHosts = getTier2PreviewHostCspSources();

  if (pathname.startsWith("/api/preview-render")) {
    return [
      "default-src 'self' https: data: blob:",
      "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      `frame-src 'self' *.vusercontent.net *.vercel.run *.vercel.app ${tier2PreviewHosts.join(" ")}`.trim(),
      `connect-src 'self' https: *.vusercontent.net *.vercel.run *.vercel.app wss: ${tier2PreviewHosts.join(" ")}`.trim(),
      "media-src 'self' blob: data:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
      "report-uri /api/csp-report",
    ].join("; ");
  }

  const scriptSrc = [
    `'self'`,
    ...currentOriginSources,
    `'nonce-${nonce}'`,
    VERCEL_ANALYTICS_SCRIPT_SRC,
  ];
  const imgSrc = [
    "'self'",
    ...currentOriginSources,
    "data:",
    "blob:",
    "https:",
    "*.vusercontent.net",
    "*.blob.vercel-storage.com",
    "*.vercel.run",
    "*.vercel.app",
  ];
  const frameSrc = [`'self'`, ...currentOriginSources, "*.vusercontent.net", "*.vercel.run", "*.vercel.app", "player.vimeo.com", ...tier2PreviewHosts];
  const connectSrc = [
    `'self'`,
    ...currentOriginSources,
    "*.vusercontent.net",
    "*.vercel.run",
    "*.vercel.app",
    "wss:",
    VERCEL_ANALYTICS_CONNECT_SRC,
    ...tier2PreviewHosts,
  ];
  const mediaSrc = [`'self'`, ...currentOriginSources, "blob:"];
  const workerSrc = [`'self'`, ...currentOriginSources, "blob:"];

  // D-ID SDK (bundled npm) needs connect-src for WebRTC signaling on any page
  connectSrc.push("https://*.d-id.com", "https://d-id.com");

  if (allowDidEmbed) {
    scriptSrc.push(...DID_EMBED_HOSTS);
    frameSrc.push(...DID_EMBED_HOSTS);
    connectSrc.push(...DID_EMBED_HOSTS);
    mediaSrc.push("data:", ...DID_EMBED_HOSTS);
    workerSrc.push(...DID_EMBED_HOSTS);
  }

  if (isDev || allowLocalRuntimeScripts) {
    // Turbopack trips CSP in dev. Vercel analytics script is allowed above in
    // both prod and dev because root layout mounts it when VERCEL_ENV is set.
    scriptSrc.push("'unsafe-eval'");
    connectSrc.push("ws:");
  }

  const scriptElemSrc = [`'self'`, ...currentOriginSources, "'unsafe-inline'"];
  if (isDev || allowLocalRuntimeScripts) {
    scriptElemSrc.push(VERCEL_ANALYTICS_SCRIPT_SRC);
  }

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    allowInlineScriptElements ? `script-src-elem ${scriptElemSrc.join(" ")}` : null,
    "style-src 'self' 'unsafe-inline'",
    `style-src-elem 'self' ${currentOriginSources.join(" ")} 'unsafe-inline'`.trim(),
    `img-src ${imgSrc.join(" ")}`,
    `font-src 'self' ${currentOriginSources.join(" ")} data:`.trim(),
    `frame-src ${frameSrc.join(" ")}`,
    `connect-src ${connectSrc.join(" ")}`,
    `media-src ${mediaSrc.join(" ")}`,
    `worker-src ${workerSrc.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    "report-uri /api/csp-report",
  ].filter(Boolean).join("; ");
}

function addSecurityHeaders(
  response: NextResponse,
  pathname: string,
  nonce: string,
  enforceCsp: boolean,
  allowLocalRuntimeScripts: boolean,
  currentOriginSources: string[],
): void {
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (!allowLocalRuntimeScripts) {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }

  const policy = buildCspPolicy(pathname, nonce, allowLocalRuntimeScripts, currentOriginSources);
  if (enforceCsp) {
    response.headers.set("Content-Security-Policy", policy);
    response.headers.delete("Content-Security-Policy-Report-Only");
  } else {
    response.headers.set("Content-Security-Policy-Report-Only", policy);
    response.headers.delete("Content-Security-Policy");
  }
}

function addCorsHeaders(response: NextResponse, origin: string | null): void {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  if (allowed) {
    response.headers.set("Access-Control-Allow-Origin", allowed);
    const existing = response.headers.get("Vary");
    response.headers.set("Vary", existing ? `${existing}, Origin` : "Origin");
  }
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept",
  );
  response.headers.set("Access-Control-Max-Age", "86400");
}

function getCurrentOriginSources(request: NextRequest): string[] {
  const sources = new Set<string>();
  sources.add(request.nextUrl.origin);

  const host = request.headers.get("host");
  if (host) {
    sources.add(`${request.nextUrl.protocol}//${host}`);
  }

  return Array.from(sources).filter(Boolean);
}

let _jwtMissingWarned = false;

// ---------------------------------------------------------------------------
// Proxy (formerly middleware – renamed in Next.js 16)
// ---------------------------------------------------------------------------

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get("origin");
  const allowLocalRuntimeScripts =
    request.nextUrl.hostname === "localhost" || request.nextUrl.hostname === "127.0.0.1";
  const currentOriginSources = getCurrentOriginSources(request);
  const nonce = crypto.randomUUID();
  const enforceCsp = process.env.CSP_ENFORCE?.trim().toLowerCase() === "true";
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-csp-nonce", nonce);

  // ---- CORS preflight for API routes ----
  if (isApiRoute(pathname) && request.method === "OPTIONS") {
    const preflight = new NextResponse(null, { status: 204 });
    addCorsHeaders(preflight, origin);
    addSecurityHeaders(preflight, pathname, nonce, enforceCsp, allowLocalRuntimeScripts, currentOriginSources);
    return preflight;
  }

  // ---- Page auth redirects ----
  if (needsAdminAuth(pathname) || needsUserAuth(pathname)) {
    const token = getTokenFromRequestEdge(request);
    const jwtSecret =
      process.env.JWT_SECRET ||
      (process.env.NODE_ENV === "production" ? null : "dev-secret-do-not-use-in-prod");
    if (!jwtSecret && !_jwtMissingWarned) {
      _jwtMissingWarned = true;
      console.warn("[Proxy] JWT_SECRET is not set — all auth-gated pages will redirect to /");
    }
    const payload = token && jwtSecret ? await verifyTokenEdge(token, jwtSecret) : null;

    if (needsAdminAuth(pathname)) {
      if (!payload || !isAdminEmailEdge(payload.email)) {
        const redirect = NextResponse.redirect(new URL("/", request.url));
        addSecurityHeaders(redirect, pathname, nonce, enforceCsp, allowLocalRuntimeScripts, currentOriginSources);
        return redirect;
      }
    } else if (!payload) {
      const redirect = NextResponse.redirect(new URL("/", request.url));
      addSecurityHeaders(redirect, pathname, nonce, enforceCsp, allowLocalRuntimeScripts, currentOriginSources);
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
  addSecurityHeaders(response, pathname, nonce, enforceCsp, allowLocalRuntimeScripts, currentOriginSources);

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
