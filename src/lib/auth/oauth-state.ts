import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { SECRETS, URLS } from "@/lib/config";
import { getServerEnv } from "@/lib/env";

export type OAuthProvider = "google" | "github";

export const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

/**
 * Canonical Vercel production origin. GitHub's registered callback lives here
 * while users may start the flow on another first-party host.
 */
export const INTENDED_VERCEL_OAUTH_ORIGIN = "https://sajtmaskin.vercel.app";

/**
 * Parallel flows for the same provider: last start wins.
 *
 * Each provider has one host-only cookie. A new start overwrites that cookie
 * and its nonce. An older callback then fails `state_nonce_mismatch` and MUST
 * leave the newer cookie in place so the latest flow can still complete.
 */
export const OAUTH_PARALLEL_FLOW_POLICY = "last_start_wins" as const;

const OAUTH_STATE_VERSION = 1;
const OAUTH_STATE_PURPOSE = "sajtmaskin-oauth-state-v1";
const OAUTH_SESSION_PURPOSE = "sajtmaskin-oauth-session-v1";

const OAUTH_COOKIE_NAMES: Record<OAuthProvider, string> = {
  google: "sajtmaskin_oauth_google",
  github: "sajtmaskin_oauth_github",
};

export interface OAuthStatePayload {
  v: typeof OAUTH_STATE_VERSION;
  provider: OAuthProvider;
  nonce: string;
  origin: string;
  returnTo: string;
  issuedAt: number;
  sessionBinding: string | null;
  subject?: string;
}

export interface OAuthFlow {
  state: string;
  codeChallenge: string;
  cookieValue: string;
  payload: OAuthStatePayload;
}

type ParsedOAuthState =
  | { ok: true; payload: OAuthStatePayload }
  | { ok: false; reason: string };

export type VerifiedOAuthFlow =
  | {
      ok: true;
      payload: OAuthStatePayload;
      codeVerifier: string;
    }
  | { ok: false; reason: string };

function oauthSecret(): string {
  const secret = SECRETS.jwtSecret;
  if (!secret) throw new Error("OAuth state signing secret is unavailable");
  return secret;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function stateSignature(body: string): string {
  return createHmac("sha256", oauthSecret())
    .update(`${OAUTH_STATE_PURPOSE}.${body}`)
    .digest("base64url");
}

function currentSessionToken(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }
  return request.cookies.get("sajtmaskin_auth")?.value ?? null;
}

function currentSessionBinding(request: NextRequest): string | null {
  const token = currentSessionToken(request);
  if (!token) return null;
  return createHmac("sha256", oauthSecret())
    .update(`${OAUTH_SESSION_PURPOSE}.${token}`)
    .digest("base64url");
}

function normalizeOrigin(rawOrigin: string): string | null {
  try {
    const url = new URL(rawOrigin);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Accept only an exact origin token. Paths, queries, credentials, and any
 * wildcard character are rejected — never expanded.
 */
export function parseExactOAuthOrigin(rawOrigin: string): string | null {
  const trimmed = rawOrigin.trim();
  if (!trimmed || trimmed.includes("*")) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (url.search || url.hash) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  return url.origin;
}

export class OAuthOriginNotAllowedError extends Error {
  readonly code = "origin_not_allowed" as const;

  constructor(readonly origin: string | null) {
    super("OAuth start origin is not on the first-party allowlist");
    this.name = "OAuthOriginNotAllowedError";
  }
}

export function isOAuthOriginNotAllowedError(
  error: unknown,
): error is OAuthOriginNotAllowedError {
  return error instanceof OAuthOriginNotAllowedError;
}

/**
 * First-party OAuth origins that may be signed into state as a relay
 * destination: `URLS.baseUrl`, the intended Vercel origin, and exact entries
 * from `OAUTH_ALLOWED_ORIGINS`. No wildcards, no `request.nextUrl.origin`.
 */
export function getOAuthAllowedOrigins(): string[] {
  const origins = new Set<string>();
  const base = parseExactOAuthOrigin(URLS.baseUrl) ?? normalizeOrigin(URLS.baseUrl);
  if (base) origins.add(base);
  origins.add(INTENDED_VERCEL_OAUTH_ORIGIN);

  const extra = getServerEnv().OAUTH_ALLOWED_ORIGINS ?? "";
  for (const part of extra.split(",")) {
    const origin = parseExactOAuthOrigin(part);
    if (origin) origins.add(origin);
  }
  return [...origins].sort();
}

export function isOAuthOriginAllowed(rawOrigin: string): boolean {
  const origin = parseExactOAuthOrigin(rawOrigin) ?? normalizeOrigin(rawOrigin);
  return origin !== null && getOAuthAllowedOrigins().includes(origin);
}

export function resolveAllowedOAuthStartOrigin(
  request: NextRequest,
): string | null {
  const origin = normalizeOrigin(request.nextUrl.origin);
  if (!origin || !isOAuthOriginAllowed(origin)) return null;
  return origin;
}

export function oauthOriginNotAllowedResponse(): NextResponse {
  const response = NextResponse.json(
    { success: false, error: "Otillåten origin för OAuth" },
    { status: 400 },
  );
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export function sanitizeOAuthReturnTo(
  rawReturnTo: string | null | undefined,
  origin: string,
  fallback: string,
): string {
  if (!rawReturnTo) return fallback;
  try {
    const candidate = new URL(rawReturnTo, origin);
    if (candidate.origin !== origin) return fallback;
    const path = `${candidate.pathname}${candidate.search}${candidate.hash}`;
    return path.startsWith("/") && !path.startsWith("//") ? path : fallback;
  } catch {
    return fallback;
  }
}

export function createPkceVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function createPkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function encodeState(payload: OAuthStatePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${stateSignature(body)}`;
}

function encodeCookie(nonce: string, codeVerifier: string): string {
  return Buffer.from(JSON.stringify({ nonce, codeVerifier })).toString("base64url");
}

function decodeCookie(
  rawCookie: string | undefined,
): { nonce: string; codeVerifier: string } | null {
  if (!rawCookie) return null;
  try {
    const value = JSON.parse(Buffer.from(rawCookie, "base64url").toString()) as {
      nonce?: unknown;
      codeVerifier?: unknown;
    };
    if (
      typeof value.nonce !== "string" ||
      typeof value.codeVerifier !== "string" ||
      !/^[A-Za-z0-9_-]{32,}$/.test(value.nonce) ||
      !/^[A-Za-z0-9_-]{32,}$/.test(value.codeVerifier)
    ) {
      return null;
    }
    return { nonce: value.nonce, codeVerifier: value.codeVerifier };
  } catch {
    return null;
  }
}

export function oauthCookieName(provider: OAuthProvider): string {
  return OAUTH_COOKIE_NAMES[provider];
}

export function createOAuthFlow(
  provider: OAuthProvider,
  request: NextRequest,
  options: { returnTo: string; subject?: string },
): OAuthFlow {
  const origin = resolveAllowedOAuthStartOrigin(request);
  if (!origin) {
    throw new OAuthOriginNotAllowedError(
      normalizeOrigin(request.nextUrl.origin),
    );
  }

  const fallback = provider === "github" ? "/projects" : "/";
  const returnTo = sanitizeOAuthReturnTo(options.returnTo, origin, fallback);
  const nonce = randomBytes(32).toString("base64url");
  const codeVerifier = createPkceVerifier();
  const payload: OAuthStatePayload = {
    v: OAUTH_STATE_VERSION,
    provider,
    nonce,
    origin,
    returnTo,
    issuedAt: Date.now(),
    sessionBinding: currentSessionBinding(request),
    ...(options.subject ? { subject: options.subject } : {}),
  };

  return {
    state: encodeState(payload),
    codeChallenge: createPkceChallenge(codeVerifier),
    cookieValue: encodeCookie(nonce, codeVerifier),
    payload,
  };
}

export function parseOAuthState(
  provider: OAuthProvider,
  rawState: string | null,
  now = Date.now(),
): ParsedOAuthState {
  if (!rawState) return { ok: false, reason: "state_missing" };

  const [body, suppliedSignature, extra] = rawState.split(".");
  if (!body || !suppliedSignature || extra) {
    return { ok: false, reason: "state_malformed" };
  }
  if (!safeEqual(stateSignature(body), suppliedSignature)) {
    return { ok: false, reason: "state_signature" };
  }

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString(),
    ) as Partial<OAuthStatePayload>;
    const origin =
      typeof payload.origin === "string" ? normalizeOrigin(payload.origin) : null;
    const fallback = provider === "github" ? "/projects" : "/";

    if (
      payload.v !== OAUTH_STATE_VERSION ||
      payload.provider !== provider ||
      typeof payload.nonce !== "string" ||
      !/^[A-Za-z0-9_-]{32,}$/.test(payload.nonce) ||
      !origin ||
      origin !== payload.origin ||
      typeof payload.returnTo !== "string" ||
      sanitizeOAuthReturnTo(payload.returnTo, origin, fallback) !==
        payload.returnTo ||
      typeof payload.issuedAt !== "number" ||
      !Number.isFinite(payload.issuedAt) ||
      (payload.sessionBinding !== null &&
        typeof payload.sessionBinding !== "string") ||
      (payload.subject !== undefined && typeof payload.subject !== "string")
    ) {
      return { ok: false, reason: "state_payload" };
    }

    if (!isOAuthOriginAllowed(origin)) {
      return { ok: false, reason: "state_origin_not_allowed" };
    }

    const ageMs = now - payload.issuedAt;
    if (ageMs < -30_000 || ageMs > OAUTH_STATE_MAX_AGE_SECONDS * 1_000) {
      return { ok: false, reason: "state_expired" };
    }

    return { ok: true, payload: payload as OAuthStatePayload };
  } catch {
    return { ok: false, reason: "state_payload" };
  }
}

function cookieOptions(request: NextRequest) {
  return {
    httpOnly: true as const,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax" as const,
    path: "/",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  };
}

export function setOAuthFlowCookie(
  response: NextResponse,
  provider: OAuthProvider,
  flow: OAuthFlow,
  request: NextRequest,
): void {
  response.cookies.set(
    oauthCookieName(provider),
    flow.cookieValue,
    cookieOptions(request),
  );
}

export function clearOAuthFlowCookie(
  response: NextResponse,
  provider: OAuthProvider,
  request: NextRequest,
): void {
  response.cookies.set(oauthCookieName(provider), "", {
    ...cookieOptions(request),
    maxAge: 0,
    expires: new Date(0),
  });
}

export function verifyOAuthFlow(
  provider: OAuthProvider,
  request: NextRequest,
  rawState: string | null,
  now = Date.now(),
): VerifiedOAuthFlow {
  const parsed = parseOAuthState(provider, rawState, now);
  if (!parsed.ok) return parsed;

  const cookie = decodeCookie(
    request.cookies.get(oauthCookieName(provider))?.value,
  );
  if (!cookie) return { ok: false, reason: "state_cookie_missing" };
  if (!safeEqual(cookie.nonce, parsed.payload.nonce)) {
    return { ok: false, reason: "state_nonce_mismatch" };
  }
  if (
    parsed.payload.sessionBinding !== currentSessionBinding(request)
  ) {
    return { ok: false, reason: "state_session_mismatch" };
  }

  return {
    ok: true,
    payload: parsed.payload,
    codeVerifier: cookie.codeVerifier,
  };
}

/**
 * Consume the host cookie only when it belongs to this callback.
 * `state_nonce_mismatch` means a newer start already replaced the cookie —
 * leave that newer cookie intact (last start wins).
 */
export function shouldConsumeOAuthCookie(result: VerifiedOAuthFlow): boolean {
  return result.ok || result.reason === "state_session_mismatch";
}

function applyOAuthSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

/**
 * GitHub has one configured canonical callback, while users can start the flow
 * on another first-party app origin. Relay only to an allowlisted origin that
 * was signed into state — never to `request.nextUrl.origin`.
 */
export function relayOAuthCallbackIfNeeded(
  request: NextRequest,
  parsed: Extract<ParsedOAuthState, { ok: true }>,
): NextResponse | null {
  if (!isOAuthOriginAllowed(parsed.payload.origin)) {
    return oauthOriginNotAllowedResponse();
  }

  if (parsed.payload.origin === request.nextUrl.origin) return null;

  const target = new URL("/api/auth/github/callback", parsed.payload.origin);
  for (const key of ["code", "state", "error", "error_description"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value !== null) target.searchParams.set(key, value);
  }

  return applyOAuthSecurityHeaders(NextResponse.redirect(target));
}
