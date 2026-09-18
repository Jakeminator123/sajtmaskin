import { NextResponse, type NextRequest } from "next/server";
import { verifyTokenEdge, getTokenFromRequestEdge, isAdminEmailEdge } from "@/lib/auth/edge-auth";
import {
  evaluateMutationOrigin,
  getTrustedPortalOrigins,
  isExternalMachineEndpoint,
  isPortalMutationMethod,
  isTrustedPortalOriginHeader,
} from "@/lib/security/origin-guard";

// ---------------------------------------------------------------------------
// Path sets
// ---------------------------------------------------------------------------

const ADMIN_PREFIX = "/admin";

const AUTH_REQUIRED_PATHS = new Set(["/projects", "/buy-credits", "/konto"]);

/**
 * Prefixes whose subpaths require a signed-in user. `AUTH_REQUIRED_PATHS` is an
 * exact-match set, so a dynamic route like `/projects/<id>` would slip straight
 * through it — the customer portal's per-site view must be gated by prefix.
 *
 * The server-side owner check in each route/API is still the authority; this
 * gate only keeps an anonymous visitor from reaching the page at all.
 */
const AUTH_REQUIRED_PREFIXES = ["/projects/"] as const;

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
  if (AUTH_REQUIRED_PATHS.has(pathname)) return true;
  return AUTH_REQUIRED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

const DID_EMBED_HOSTS = ["https://agent.d-id.com", "https://d-id.com", "https://*.d-id.com", "https://studio.d-id.com"];

// Vercel Toolbar / Vercel Live (preview overlays, comments, feedback) load assets
// from vercel.live, Pusher (realtime channel) and Vercel's CDN. Without these on
// the allowlist the injected toolbar trips CSP and floods /api/csp-report with
// script-src-elem / frame-src / font-src violations against https://vercel.live.
const VERCEL_LIVE_HOSTS = {
  script: ["https://vercel.live"],
  style: ["https://vercel.live"],
  font: ["https://vercel.live", "https://assets.vercel.com"],
  frame: ["https://vercel.live"],
  connect: ["https://vercel.live", "https://*.pusher.com", "wss://*.pusher.com"],
} as const;

// First-party surfaces the app itself loads on every page. Google Sign-In pulls
// the "Google Sans" webfont from fonts.gstatic.com (+ its stylesheet from
// fonts.googleapis.com), and the Mixpanel client SDK posts events to
// api-js.mixpanel.com. Without these on the allowlist they flood /api/csp-report
// with font-src / connect-src violations (report-only today) and would break
// once CSP_ENFORCE flips on. Mirrors the allowlist documented in
// next.config.ts headers().
const THIRD_PARTY_HOSTS = {
  style: ["https://fonts.googleapis.com"],
  font: ["https://fonts.gstatic.com"],
  connect: ["https://api-js.mixpanel.com"],
} as const;

// Large media (today: the kostnadsfri intro film) is served from the project's
// public Vercel Blob store instead of being committed as an mp4. `blob:` on
// media-src is the URL *scheme* and does not cover this domain, so the host
// needs its own entry — mirroring the `*.blob.vercel-storage.com` pattern that
// img-src already carries.
const VERCEL_BLOB_MEDIA_HOSTS = ["https://*.public.blob.vercel-storage.com"] as const;

// LocationPicker and CompetitorMap bootstrap the Maps JavaScript API directly,
// which then loads runtime chunks and Places data from these two exact origins.
// Keep this narrower than Google's generic allowlist: the current UI disables
// Street View and img-src already permits the HTTPS map tiles it renders.
const GOOGLE_MAPS_HOSTS = [
  "https://maps.googleapis.com",
  "https://maps.gstatic.com",
] as const;

// Google Ads gtag (Consent Mode + conversion pixels). Keep this tighter than
// a generic *.google.com allowlist — these are the hosts the official gtag
// loader talks to after `gtag/js` is fetched from Tag Manager.
const GOOGLE_ADS_HOSTS = {
  script: ["https://www.googletagmanager.com"],
  frame: ["https://www.googletagmanager.com"],
  connect: [
    "https://www.googletagmanager.com",
    "https://www.google.com",
    "https://www.google.se",
    "https://www.googleadservices.com",
    "https://googleads.g.doubleclick.net",
    "https://www.google-analytics.com",
    "https://analytics.google.com",
    "https://*.google-analytics.com",
    "https://*.analytics.google.com",
  ],
} as const;

function isAvatarRoute(pathname: string): boolean {
  return pathname === "/avatar";
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

function buildCspPolicy(pathname: string, nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  const allowDidEmbed = isAvatarRoute(pathname);
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
    `'nonce-${nonce}'`,
    ...VERCEL_LIVE_HOSTS.script,
    ...GOOGLE_MAPS_HOSTS,
    ...GOOGLE_ADS_HOSTS.script,
  ];
  const imgSrc = [
    "'self'",
    "data:",
    "blob:",
    "https:",
    "*.vusercontent.net",
    "*.blob.vercel-storage.com",
    "*.vercel.run",
    "*.vercel.app",
  ];
  const frameSrc = [`'self'`, "*.vusercontent.net", "*.vercel.run", "*.vercel.app", ...VERCEL_LIVE_HOSTS.frame, ...GOOGLE_ADS_HOSTS.frame, ...tier2PreviewHosts];
  const connectSrc = [`'self'`, "*.vusercontent.net", "*.vercel.run", "*.vercel.app", "wss:", ...VERCEL_LIVE_HOSTS.connect, ...tier2PreviewHosts];
  const mediaSrc = [`'self'`, "blob:", ...VERCEL_BLOB_MEDIA_HOSTS];
  const workerSrc = [`'self'`, "blob:"];

  // D-ID SDK (bundled npm) needs connect-src for WebRTC signaling on any page
  connectSrc.push("https://*.d-id.com", "https://d-id.com");

  // Mixpanel analytics egress (see THIRD_PARTY_HOSTS)
  connectSrc.push(...THIRD_PARTY_HOSTS.connect);

  // Google Maps JS bootstrap, runtime chunks and Places requests.
  connectSrc.push(...GOOGLE_MAPS_HOSTS);

  // Google Ads gtag / conversion beacons (see GOOGLE_ADS_HOSTS).
  connectSrc.push(...GOOGLE_ADS_HOSTS.connect);

  if (allowDidEmbed) {
    scriptSrc.push(...DID_EMBED_HOSTS);
    frameSrc.push(...DID_EMBED_HOSTS);
    connectSrc.push(...DID_EMBED_HOSTS);
    mediaSrc.push("data:", ...DID_EMBED_HOSTS);
    workerSrc.push(...DID_EMBED_HOSTS);
  }

  if (isDev) {
    // Turbopack and Vercel's local analytics debug script trip CSP in dev.
    scriptSrc.push("'unsafe-eval'", "https://va.vercel-scripts.com");
    connectSrc.push("ws:");
  }

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    `style-src 'self' 'unsafe-inline' ${[...VERCEL_LIVE_HOSTS.style, ...THIRD_PARTY_HOSTS.style].join(" ")}`,
    `img-src ${imgSrc.join(" ")}`,
    `font-src 'self' data: ${[...VERCEL_LIVE_HOSTS.font, ...THIRD_PARTY_HOSTS.font].join(" ")}`,
    `frame-src ${frameSrc.join(" ")}`,
    `connect-src ${connectSrc.join(" ")}`,
    `media-src ${mediaSrc.join(" ")}`,
    `worker-src ${workerSrc.join(" ")}`,
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
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");

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
  trustedOrigins: ReadonlySet<string>,
): void {
  const allowed = origin && isTrustedPortalOriginHeader(origin, trustedOrigins) ? origin : "";
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

let _jwtMissingWarned = false;

// ---------------------------------------------------------------------------
// Proxy (formerly middleware – renamed in Next.js 16)
// ---------------------------------------------------------------------------

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get("origin");
  const trustedOrigins = getTrustedPortalOrigins();
  const nonce = crypto.randomUUID();
  const enforceCsp = process.env.CSP_ENFORCE?.trim().toLowerCase() === "true";
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-csp-nonce", nonce);

  // ---- CORS preflight for API routes ----
  if (isApiRoute(pathname) && request.method === "OPTIONS") {
    if (origin !== null && !isTrustedPortalOriginHeader(origin, trustedOrigins)) {
      const denied = NextResponse.json(
        { error: "origin_not_allowed" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
      addSecurityHeaders(denied, pathname, nonce, enforceCsp);
      return denied;
    }
    const preflight = new NextResponse(null, { status: 204 });
    addCorsHeaders(preflight, origin, trustedOrigins);
    addSecurityHeaders(preflight, pathname, nonce, enforceCsp);
    return preflight;
  }

  // ---- Exact-Origin CSRF guard for browser mutations ----
  if (isPortalMutationMethod(request.method) && !isExternalMachineEndpoint(pathname)) {
    const decision = evaluateMutationOrigin(request.headers, trustedOrigins);
    if (!decision.allowed) {
      const denied = NextResponse.json(
        { error: "origin_not_allowed" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
      addSecurityHeaders(denied, pathname, nonce, enforceCsp);
      return denied;
    }
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
    addCorsHeaders(response, origin, trustedOrigins);
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
