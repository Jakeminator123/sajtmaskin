import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { OAUTH_STATE_COOKIE_NAME } from "@/lib/auth/oauth-state";

const handleGoogleCallback = vi.hoisted(() => vi.fn());
const setAuthCookie = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ handleGoogleCallback, setAuthCookie }));

import { GET } from "./route";

function encodeState(payload: { redirect?: string; nonce?: string }): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function callbackRequest(query: string, cookieNonce?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieNonce !== undefined) {
    headers.cookie = `${OAUTH_STATE_COOKIE_NAME}=${cookieNonce}`;
  }
  return new NextRequest(`https://app.test/api/auth/google/callback?${query}`, { headers });
}

function locationOf(response: Response): URL {
  return new URL(response.headers.get("location") ?? "https://missing.test/");
}

function setCookieHeader(response: Response): string {
  const multi = response.headers.getSetCookie?.() ?? [];
  if (multi.length > 0) return multi.join("\n");
  return response.headers.get("set-cookie") ?? "";
}

describe("GET /api/auth/google/callback", () => {
  const nonce = "oauth-nonce-google-test-value-aaaaaaaa";
  const redirect = "/projects";
  const matchingState = encodeState({ redirect, nonce });

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    handleGoogleCallback.mockReset();
    setAuthCookie.mockReset();
    handleGoogleCallback.mockResolvedValue({ token: "jwt-token", user: { id: "user-1" } });
    setAuthCookie.mockResolvedValue(undefined);
  });

  it("rejects when the nonce cookie is absent", async () => {
    const response = await GET(
      callbackRequest(`code=attacker-code&state=${encodeURIComponent(matchingState)}`),
    );

    const location = locationOf(response);
    expect(location.pathname).toBe(redirect);
    expect(location.searchParams.get("error")).toBe("Ogiltig inloggning");
    expect(handleGoogleCallback).not.toHaveBeenCalled();
    expect(setAuthCookie).not.toHaveBeenCalled();
  });

  it("rejects when the cookie and state nonce disagree", async () => {
    const response = await GET(
      callbackRequest(
        `code=attacker-code&state=${encodeURIComponent(matchingState)}`,
        "different-nonce-from-victim-browser-bbbbbbbb",
      ),
    );

    const location = locationOf(response);
    expect(location.searchParams.get("error")).toBe("Ogiltig inloggning");
    expect(handleGoogleCallback).not.toHaveBeenCalled();
    expect(setAuthCookie).not.toHaveBeenCalled();
    expect(setCookieHeader(response)).toMatch(/Max-Age=0/i);
  });

  it("accepts the matching pair, honours redirect, and clears the nonce cookie", async () => {
    const response = await GET(
      callbackRequest(`code=good-code&state=${encodeURIComponent(matchingState)}`, nonce),
    );

    const location = locationOf(response);
    expect(location.origin).toBe("https://app.test");
    expect(location.pathname).toBe("/projects");
    expect(location.searchParams.get("login")).toBe("success");
    expect(handleGoogleCallback).toHaveBeenCalledWith(
      "good-code",
      "https://app.test/api/auth/google/callback",
    );
    expect(setAuthCookie).toHaveBeenCalledWith("jwt-token", { secure: true });
    expect(setCookieHeader(response)).toMatch(/Max-Age=0/i);
  });
});
