import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetServerEnvCacheForTests } from "@/lib/env";
import { oauthCookieName } from "@/lib/auth/oauth-state";

const getCurrentUser = vi.hoisted(() => vi.fn());
const handleGoogleCallback = vi.hoisted(() => vi.fn());
const setAuthCookie = vi.hoisted(() => vi.fn());
const updateUserGitHub = vi.hoisted(() => vi.fn());

vi.mock("@/lib/config", () => ({
  SECRETS: {
    jwtSecret: "test-a4-oauth-secret",
    githubClientId: "github-client-id",
    githubClientSecret: "github-client-secret",
    googleClientId: "google-client-id",
    googleClientSecret: "google-client-secret",
  },
  URLS: {
    baseUrl: "https://sajtmaskin.se",
    googleCallbackUrl: "https://sajtmaskin.se/api/auth/google/callback",
    githubCallbackUrl: "https://sajtmaskin.vercel.app/api/auth/github/callback",
  },
  FEATURES: {
    useGitHubAuth: true,
  },
  IS_PRODUCTION: true,
}));

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
  handleGoogleCallback,
  setAuthCookie,
  getGoogleAuthUrl: (
    state?: string,
    redirectUri?: string,
    codeChallenge?: string,
  ) => {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    if (state) url.searchParams.set("state", state);
    if (redirectUri) url.searchParams.set("redirect_uri", redirectUri);
    if (codeChallenge) {
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
    }
    return url.toString();
  },
}));

vi.mock("@/lib/db/services/users", () => ({
  updateUserGitHub,
  getUserById: vi.fn(),
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
  createGoogleUser: vi.fn(),
  updateUserLastLogin: vi.fn(),
  isAdminEmail: vi.fn(() => false),
  setUserDiamonds: vi.fn(),
  markEmailVerified: vi.fn(),
}));

import { GET as startGoogle } from "./google/route";
import { GET as googleCallback } from "./google/callback/route";
import { GET as startGitHub } from "./github/route";
import { GET as githubCallback } from "./github/callback/route";

const FIRST_PARTY =
  "https://sajtmaskin.se,https://sajtmaskin.com,https://www.sajtmaskin.se,https://www.sajtmaskin.com";

function req(
  url: string,
  cookies: Record<string, string> = {},
): NextRequest {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  return new NextRequest(url, {
    headers: cookie ? { cookie } : undefined,
  });
}

function cookieFrom(
  response: Response,
  provider: "google" | "github",
): string {
  const name = oauthCookieName(provider);
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(new RegExp(`${name}=([^;]+)`));
  if (!match?.[1]) throw new Error(`Missing ${name} cookie`);
  return match[1];
}

function clearedCookie(response: Response, provider: "google" | "github"): boolean {
  const header = response.headers.get("set-cookie") ?? "";
  return (
    header.includes(oauthCookieName(provider)) && /Max-Age=0/i.test(header)
  );
}

function allowOrigins(value: string) {
  vi.stubEnv("OAUTH_ALLOWED_ORIGINS", value);
  resetServerEnvCacheForTests();
}

async function startProvider(
  provider: "google" | "github",
  origin: string,
  session = "session-a",
) {
  getCurrentUser.mockResolvedValue({ id: "user-a" });
  const path =
    provider === "google" ? "/api/auth/google" : "/api/auth/github";
  const cookies =
    provider === "github" ? { sajtmaskin_auth: session } : {};
  const response = await (provider === "google" ? startGoogle : startGitHub)(
    req(`${origin}${path}`, cookies),
  );
  const location = response.headers.get("location");
  if (!location) {
    return { response, state: null as string | null, cookie: null as string | null };
  }
  const state = new URL(location).searchParams.get("state");
  return {
    response,
    state,
    cookie: cookieFrom(response, provider),
  };
}

describe("OAuth route handlers", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    allowOrigins(FIRST_PARTY);
    getCurrentUser.mockReset();
    handleGoogleCallback.mockReset();
    setAuthCookie.mockReset();
    updateUserGitHub.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    getCurrentUser.mockResolvedValue({ id: "user-a" });
    handleGoogleCallback.mockResolvedValue({
      user: { id: "user-a" },
      token: "app-token",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    resetServerEnvCacheForTests();
  });

  it("never exchanges tokens for missing, invalid, expired or tampered state", async () => {
    const started = await startProvider("github", "https://sajtmaskin.se");
    const [body, signature] = started.state!.split(".");
    const tampered = `${body}.${signature.endsWith("A") ? `${signature.slice(0, -1)}B` : `${signature.slice(0, -1)}A`}`;

    const missing = await githubCallback(
      req("https://sajtmaskin.se/api/auth/github/callback?code=abc"),
    );
    const invalid = await githubCallback(
      req(
        "https://sajtmaskin.se/api/auth/github/callback?code=abc&state=not-a-state",
      ),
    );
    const tamperedRes = await githubCallback(
      req(
        `https://sajtmaskin.se/api/auth/github/callback?code=abc&state=${encodeURIComponent(tampered)}`,
        {
          sajtmaskin_auth: "session-a",
          [oauthCookieName("github")]: started.cookie!,
        },
      ),
    );

    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const fresh = await startProvider("google", "https://sajtmaskin.se");
    vi.setSystemTime(now + 11 * 60 * 1000);
    const expired = await googleCallback(
      req(
        `https://sajtmaskin.se/api/auth/google/callback?code=abc&state=${encodeURIComponent(fresh.state!)}`,
        { [oauthCookieName("google")]: fresh.cookie! },
      ),
    );
    vi.useRealTimers();

    expect(missing.status).not.toBe(200);
    expect(invalid.status).not.toBe(200);
    expect(tamperedRes.status).not.toBe(200);
    expect(expired.status).not.toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(handleGoogleCallback).not.toHaveBeenCalled();
    expect(updateUserGitHub).not.toHaveBeenCalled();
  });

  it("rejects provider mix-up without token exchange", async () => {
    const google = await startProvider("google", "https://sajtmaskin.se");
    const response = await githubCallback(
      req(
        `https://sajtmaskin.se/api/auth/github/callback?code=abc&state=${encodeURIComponent(google.state!)}`,
        {
          sajtmaskin_auth: "session-a",
          [oauthCookieName("github")]: google.cookie!,
          [oauthCookieName("google")]: google.cookie!,
        },
      ),
    );

    expect(response.status).not.toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateUserGitHub).not.toHaveBeenCalled();
  });

  it("rejects replay after the matching cookie was consumed", async () => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json({ access_token: "ghtoken" }),
      )
      .mockResolvedValueOnce(
        Response.json({ login: "octocat", id: 1, name: "O", email: null }),
      );

    const started = await startProvider("github", "https://sajtmaskin.se");
    const first = await githubCallback(
      req(
        `https://sajtmaskin.se/api/auth/github/callback?code=abc&state=${encodeURIComponent(started.state!)}`,
        {
          sajtmaskin_auth: "session-a",
          [oauthCookieName("github")]: started.cookie!,
        },
      ),
    );
    expect(first.headers.get("location")).toContain("github_connected=true");
    expect(clearedCookie(first, "github")).toBe(true);
    expect(updateUserGitHub).toHaveBeenCalledWith(
      "user-a",
      "ghtoken",
      "octocat",
    );

    fetchMock.mockClear();
    updateUserGitHub.mockClear();
    const replay = await githubCallback(
      req(
        `https://sajtmaskin.se/api/auth/github/callback?code=abc&state=${encodeURIComponent(started.state!)}`,
      ),
    );
    expect(replay.headers.get("location")).toContain("invalid_state");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateUserGitHub).not.toHaveBeenCalled();
  });

  it("does not save a GitHub token after user or session switch", async () => {
    const started = await startProvider(
      "github",
      "https://sajtmaskin.se",
      "session-a",
    );

    getCurrentUser.mockResolvedValue({ id: "user-b" });
    const switchedSession = await githubCallback(
      req(
        `https://sajtmaskin.se/api/auth/github/callback?code=abc&state=${encodeURIComponent(started.state!)}`,
        {
          sajtmaskin_auth: "session-b",
          [oauthCookieName("github")]: started.cookie!,
        },
      ),
    );
    expect(switchedSession.headers.get("location")).toContain("invalid_state");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateUserGitHub).not.toHaveBeenCalled();

    getCurrentUser.mockResolvedValue({ id: "user-b" });
    const switchedUser = await githubCallback(
      req(
        `https://sajtmaskin.se/api/auth/github/callback?code=abc&state=${encodeURIComponent(started.state!)}`,
        {
          sajtmaskin_auth: "session-a",
          [oauthCookieName("github")]: started.cookie!,
        },
      ),
    );
    expect(switchedUser.headers.get("location")).toContain("session_changed");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateUserGitHub).not.toHaveBeenCalled();
  });

  it("rejects relay to an origin outside the first-party allowlist", async () => {
    allowOrigins("https://evil.example");
    const evil = await startProvider("github", "https://evil.example");
    expect(evil.state).toBeTruthy();

    allowOrigins(FIRST_PARTY);
    const relayed = await githubCallback(
      req(
        `https://sajtmaskin.vercel.app/api/auth/github/callback?code=stolen&state=${encodeURIComponent(evil.state!)}`,
      ),
    );
    expect(relayed.status).toBe(400);
    expect(relayed.headers.get("location")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateUserGitHub).not.toHaveBeenCalled();
  });

  it("returns 400 and signs nothing when start origin is not allowlisted", async () => {
    const google = await startGoogle(
      req("https://evil.example/api/auth/google"),
    );
    const github = await startGitHub(
      req("https://evil.example/api/auth/github", {
        sajtmaskin_auth: "session-a",
      }),
    );

    expect(google.status).toBe(400);
    expect(github.status).toBe(400);
    expect(google.headers.get("location")).toBeNull();
    expect(github.headers.get("location")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "https://sajtmaskin.se",
    "https://sajtmaskin.com",
    "https://sajtmaskin.vercel.app",
  ] as const)("completes a valid Google flow from %s", async (origin) => {
    const started = await startProvider("google", origin);
    expect(started.state).toBeTruthy();
    const authUrl = new URL(started.response.headers.get("location")!);
    expect(authUrl.searchParams.get("redirect_uri")).toBe(
      `${origin}/api/auth/google/callback`,
    );

    const callback = await googleCallback(
      req(
        `${origin}/api/auth/google/callback?code=ok&state=${encodeURIComponent(started.state!)}`,
        { [oauthCookieName("google")]: started.cookie! },
      ),
    );
    expect(handleGoogleCallback).toHaveBeenCalledWith(
      "ok",
      `${origin}/api/auth/google/callback`,
      expect.any(String),
    );
    expect(callback.headers.get("location")).toContain("login=success");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "https://sajtmaskin.se",
    "https://sajtmaskin.com",
    "https://sajtmaskin.vercel.app",
  ] as const)("completes a valid GitHub flow from %s", async (origin) => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("github.com/login/oauth/access_token")) {
        return Response.json({ access_token: `token-for-${origin}` });
      }
      if (url.includes("api.github.com/user")) {
        return Response.json({
          login: "octocat",
          id: 1,
          name: "O",
          email: null,
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const started = await startProvider("github", origin);
    expect(started.state).toBeTruthy();

    const canonicalCookies =
      origin === "https://sajtmaskin.vercel.app"
        ? {
            sajtmaskin_auth: "session-a",
            [oauthCookieName("github")]: started.cookie!,
          }
        : {};
    const canonical = await githubCallback(
      req(
        `https://sajtmaskin.vercel.app/api/auth/github/callback?code=ok&state=${encodeURIComponent(started.state!)}`,
        canonicalCookies,
      ),
    );

    if (origin === "https://sajtmaskin.vercel.app") {
      expect(canonical.headers.get("location")).toContain("github_connected=true");
      expect(updateUserGitHub).toHaveBeenCalledWith(
        "user-a",
        "token-for-https://sajtmaskin.vercel.app",
        "octocat",
      );
      return;
    }

    expect(canonical.headers.get("location")).toBe(
      `${origin}/api/auth/github/callback?code=ok&state=${encodeURIComponent(started.state!)}`,
    );
    expect(fetchMock).not.toHaveBeenCalled();

    const finished = await githubCallback(
      req(canonical.headers.get("location")!, {
        sajtmaskin_auth: "session-a",
        [oauthCookieName("github")]: started.cookie!,
      }),
    );
    expect(finished.headers.get("location")).toContain("github_connected=true");
    expect(updateUserGitHub).toHaveBeenCalledWith(
      "user-a",
      `token-for-${origin}`,
      "octocat",
    );
  });

  it("lets the latest same-provider start win and keeps its cookie on stale callback", async () => {
    const first = await startProvider("github", "https://sajtmaskin.se");
    const second = await startProvider("github", "https://sajtmaskin.se");

    const stale = await githubCallback(
      req(
        `https://sajtmaskin.se/api/auth/github/callback?code=old&state=${encodeURIComponent(first.state!)}`,
        {
          sajtmaskin_auth: "session-a",
          [oauthCookieName("github")]: second.cookie!,
        },
      ),
    );
    expect(stale.headers.get("location")).toContain("invalid_state");
    expect(clearedCookie(stale, "github")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock
      .mockResolvedValueOnce(Response.json({ access_token: "new-token" }))
      .mockResolvedValueOnce(
        Response.json({ login: "octocat", id: 1, name: "O", email: null }),
      );
    const latest = await githubCallback(
      req(
        `https://sajtmaskin.se/api/auth/github/callback?code=new&state=${encodeURIComponent(second.state!)}`,
        {
          sajtmaskin_auth: "session-a",
          [oauthCookieName("github")]: second.cookie!,
        },
      ),
    );
    expect(latest.headers.get("location")).toContain("github_connected=true");
    expect(updateUserGitHub).toHaveBeenCalledWith(
      "user-a",
      "new-token",
      "octocat",
    );
  });
});
