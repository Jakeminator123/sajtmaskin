import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {
  OAUTH_STATE_COOKIE_NAME,
  OAUTH_STATE_MAX_AGE_SECONDS,
  clearOAuthStateCookie,
  createOAuthNonce,
  oauthStateCookieOptions,
  oauthStateMatches,
  readOAuthStateCookie,
  setOAuthStateCookie,
} from "./oauth-state";

function setCookieHeader(response: NextResponse): string {
  const multi = response.headers.getSetCookie?.() ?? [];
  if (multi.length > 0) return multi.join("\n");
  return response.headers.get("set-cookie") ?? "";
}

describe("oauth-state helper", () => {
  it("creates unique nonces", () => {
    const a = createOAuthNonce();
    const b = createOAuthNonce();
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).not.toBe(b);
  });

  it("matches equal nonces and rejects mismatches or missing values", () => {
    const nonce = createOAuthNonce();
    expect(oauthStateMatches(nonce, nonce)).toBe(true);
    const mutated = `${nonce.slice(0, -1)}${nonce.endsWith("A") ? "B" : "A"}`;
    expect(oauthStateMatches(nonce, mutated)).toBe(false);
    expect(oauthStateMatches(undefined, nonce)).toBe(false);
    expect(oauthStateMatches(nonce, undefined)).toBe(false);
    expect(oauthStateMatches("", nonce)).toBe(false);
    expect(oauthStateMatches(nonce, 12)).toBe(false);
  });

  it("uses the same cookie flags as sajtmaskin_auth (HttpOnly, Lax, Path=/, short Max-Age)", () => {
    const options = oauthStateCookieOptions(true);
    expect(options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
    });
    expect(OAUTH_STATE_MAX_AGE_SECONDS).toBe(10 * 60);
    expect(OAUTH_STATE_COOKIE_NAME).toBe("sajtmaskin_oauth_state");
  });

  it("sets and clears the nonce cookie on a response", () => {
    const response = NextResponse.redirect("https://example.com/next");
    setOAuthStateCookie(response, "nonce-value", true);

    const header = setCookieHeader(response);
    expect(header).toContain(`${OAUTH_STATE_COOKIE_NAME}=nonce-value`);
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=Lax/i);
    expect(header).toMatch(/Path=\//i);
    expect(header).toMatch(/Secure/i);
    expect(header).toMatch(/Max-Age=600/i);

    clearOAuthStateCookie(response, true);
    const cleared = setCookieHeader(response);
    expect(cleared).toMatch(/Max-Age=0/i);
  });

  it("reads the nonce from the request cookie", () => {
    const request = new NextRequest("https://example.com/callback", {
      headers: { cookie: `${OAUTH_STATE_COOKIE_NAME}=abc123` },
    });
    expect(readOAuthStateCookie(request)).toBe("abc123");

    const empty = new NextRequest("https://example.com/callback");
    expect(readOAuthStateCookie(empty)).toBeUndefined();
  });
});
