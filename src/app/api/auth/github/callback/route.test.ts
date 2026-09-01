import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { OAUTH_STATE_COOKIE_NAME } from "@/lib/auth/oauth-state";

const getCurrentUser = vi.hoisted(() => vi.fn());
const updateUserGitHub = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/db/services/users", () => ({ updateUserGitHub }));
vi.mock("@/lib/config", () => ({
  SECRETS: {
    githubClientId: "gh-client-id",
    githubClientSecret: "gh-secret",
  },
  URLS: {
    baseUrl: "https://app.test",
    githubCallbackUrl: "https://app.test/api/auth/github/callback",
  },
  FEATURES: {
    useGitHubAuth: true,
  },
}));

import { GET } from "./route";

function encodeState(payload: { returnTo?: string; nonce?: string }): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function callbackRequest(query: string, cookieNonce?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieNonce !== undefined) {
    headers.cookie = `${OAUTH_STATE_COOKIE_NAME}=${cookieNonce}`;
  }
  return new NextRequest(`https://app.test/api/auth/github/callback?${query}`, { headers });
}

function locationOf(response: Response): URL {
  return new URL(response.headers.get("location") ?? "https://missing.test/");
}

function setCookieHeader(response: Response): string {
  const multi = response.headers.getSetCookie?.() ?? [];
  if (multi.length > 0) return multi.join("\n");
  return response.headers.get("set-cookie") ?? "";
}

describe("GET /api/auth/github/callback", () => {
  const nonce = "oauth-nonce-github-test-value-aaaaaaaa";
  const returnTo = "/builder";
  const matchingState = encodeState({ returnTo, nonce });

  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    getCurrentUser.mockReset();
    updateUserGitHub.mockReset();
    getCurrentUser.mockResolvedValue({ id: "user-1", email: "user@example.com" });
    updateUserGitHub.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects when the nonce cookie is absent", async () => {
    const response = await GET(
      callbackRequest(`code=attacker-code&state=${encodeURIComponent(matchingState)}`),
    );

    expect(response.status).toBe(307);
    const location = locationOf(response);
    expect(location.pathname).toBe(returnTo);
    expect(location.searchParams.get("github_error")).toBe("invalid_state");
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(updateUserGitHub).not.toHaveBeenCalled();
  });

  it("rejects when the cookie and state nonce disagree", async () => {
    const response = await GET(
      callbackRequest(
        `code=attacker-code&state=${encodeURIComponent(matchingState)}`,
        "different-nonce-from-victim-browser-bbbbbbbb",
      ),
    );

    const location = locationOf(response);
    expect(location.searchParams.get("github_error")).toBe("invalid_state");
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(updateUserGitHub).not.toHaveBeenCalled();
    expect(setCookieHeader(response)).toMatch(/Max-Age=0/i);
  });

  it("accepts the matching pair, honours returnTo, and clears the nonce cookie", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("login/oauth/access_token")) {
        return Response.json({ access_token: "gho_token", token_type: "bearer", scope: "repo" });
      }
      if (url.includes("api.github.com/user")) {
        return Response.json({ login: "octocat", id: 1, name: "Octo", email: null });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      callbackRequest(`code=good-code&state=${encodeURIComponent(matchingState)}`, nonce),
    );

    const location = locationOf(response);
    expect(location.origin).toBe("https://app.test");
    expect(location.pathname).toBe("/builder");
    expect(location.searchParams.get("github_connected")).toBe("true");
    expect(location.searchParams.get("github_username")).toBe("octocat");
    expect(location.searchParams.get("github_error")).toBeNull();
    expect(updateUserGitHub).toHaveBeenCalledWith("user-1", "gho_token", "octocat");
    expect(setCookieHeader(response)).toMatch(/Max-Age=0/i);
  });
});
