/**
 * OAuth CSRF state binding.
 *
 * A cryptographically random nonce is placed in both an HttpOnly cookie and
 * the provider `state` payload. The callback compares them and rejects a
 * missing or mismatched pair. Cookie Max-Age is the TTL.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const OAUTH_STATE_COOKIE_NAME = "sajtmaskin_oauth_state";
export const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

export function createOAuthNonce(): string {
  return randomBytes(32).toString("base64url");
}

export function oauthStateCookieOptions(secure: boolean): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  };
}

export function setOAuthStateCookie(
  response: NextResponse,
  nonce: string,
  secure: boolean,
): void {
  response.cookies.set(OAUTH_STATE_COOKIE_NAME, nonce, oauthStateCookieOptions(secure));
}

export function clearOAuthStateCookie(response: NextResponse, secure: boolean): void {
  response.cookies.set(OAUTH_STATE_COOKIE_NAME, "", {
    ...oauthStateCookieOptions(secure),
    maxAge: 0,
  });
}

export function readOAuthStateCookie(request: NextRequest): string | undefined {
  const value = request.cookies.get(OAUTH_STATE_COOKIE_NAME)?.value;
  return value && value.length > 0 ? value : undefined;
}

export function oauthStateMatches(
  cookieNonce: string | undefined,
  stateNonce: unknown,
): boolean {
  if (typeof cookieNonce !== "string" || typeof stateNonce !== "string") return false;
  if (cookieNonce.length === 0 || cookieNonce.length !== stateNonce.length) return false;

  const cookieBuf = Buffer.from(cookieNonce);
  const stateBuf = Buffer.from(stateNonce);
  if (cookieBuf.length !== stateBuf.length) return false;
  return timingSafeEqual(cookieBuf, stateBuf);
}

function isHttpsRequest(request: NextRequest): boolean {
  return request.nextUrl.protocol === "https:";
}

export function redirectWithOAuthState(
  url: string,
  nonce: string,
  request: NextRequest,
): NextResponse {
  const response = NextResponse.redirect(url);
  setOAuthStateCookie(response, nonce, isHttpsRequest(request));
  return response;
}

export function redirectClearingOAuthState(url: string, request: NextRequest): NextResponse {
  const response = NextResponse.redirect(url);
  clearOAuthStateCookie(response, isHttpsRequest(request));
  return response;
}
