import crypto from "crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import {
  AUTH_COOKIE_HOST_NAME,
  AUTH_COOKIE_LEGACY_NAME,
} from "./host-cookies";
import { getTokenFromRequestEdge } from "./edge-auth";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: vi.fn(),
    get: vi.fn(),
    getAll: vi.fn(() => []),
    delete: vi.fn(),
  })),
  headers: vi.fn(async () => ({
    get: vi.fn(() => null),
  })),
}));

vi.mock("@/lib/db/services/users", () => ({
  getUserById: vi.fn(),
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
  createGoogleUser: vi.fn(),
  updateUserLastLogin: vi.fn(),
  isAdminEmail: vi.fn(() => false),
  setUserDiamonds: vi.fn(),
  markEmailVerified: vi.fn(),
}));

vi.mock("@/lib/config", () => ({
  SECRETS: {
    jwtSecret: "unit-test-jwt-secret",
    googleClientId: "google-client-id",
    googleClientSecret: "google-client-secret",
    superadminEmail: "",
    superadminPassword: "",
    testUserEmail: "",
    testUserPassword: "",
  },
  URLS: {
    googleCallbackUrl: "http://localhost:3000/api/auth/google/callback",
  },
  IS_PRODUCTION: false,
}));

describe("auth token security", () => {
  let auth: typeof import("./auth");

  beforeAll(async () => {
    auth = await import("./auth");
  });

  it("creates and verifies JWT tokens", () => {
    const token = auth.createToken("user_1", "user@example.com");
    const payload = auth.verifyToken(token);

    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe("user_1");
    expect(payload?.email).toBe("user@example.com");
  });

  it("rejects tampered JWT signatures", () => {
    const token = auth.createToken("user_2", "tamper@example.com");
    const [header, body, signature] = token.split(".");
    const tamperedSignature = `${signature.slice(0, -1)}x`;
    const tampered = `${header}.${body}.${tamperedSignature}`;

    expect(auth.verifyToken(tampered)).toBeNull();
  });

  it("rejects expired JWT tokens", () => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(
      JSON.stringify({
        userId: "user_expired",
        email: "expired@example.com",
        iat: 1,
        exp: 2,
      }),
    ).toString("base64url");
    const signature = crypto
      .createHmac("sha256", "unit-test-jwt-secret")
      .update(`${header}.${body}`)
      .digest("base64url");

    const expiredToken = `${header}.${body}.${signature}`;
    expect(auth.verifyToken(expiredToken)).toBeNull();
  });

  it("adds OAuth state and PKCE to the Google authorization URL", () => {
    const url = new URL(
      auth.getGoogleAuthUrl(
        "signed-state",
        "https://sajtmaskin.se/api/auth/google/callback",
        "pkce-challenge",
      ),
    );

    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("code_challenge")).toBe("pkce-challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://sajtmaskin.se/api/auth/google/callback",
    );
  });

  it("extracts token from authorization header and cookie", () => {
    const fromHeader = new Request("https://example.com", {
      headers: { authorization: "Bearer token_from_header" },
    });
    expect(auth.getTokenFromRequest(fromHeader)).toBe("token_from_header");

    const fromCookie = new Request("https://example.com", {
      headers: { cookie: "foo=bar; sajtmaskin_auth=token_from_cookie; x=y" },
    });
    expect(auth.getTokenFromRequest(fromCookie)).toBe("token_from_cookie");
  });

  it("prefers the __Host- auth cookie over a leftover unprefixed name", () => {
    const request = new Request("https://sajtmaskin.se/", {
      headers: {
        cookie: `${AUTH_COOKIE_LEGACY_NAME}=legacy_token; ${AUTH_COOKIE_HOST_NAME}=host_token`,
      },
    });
    expect(auth.getTokenFromRequest(request)).toBe("host_token");
    expect(getTokenFromRequestEdge(request)).toBe("host_token");
  });

  it("refuses a duplicated auth cookie name instead of first-wins", () => {
    const request = new Request("https://sajtmaskin.se/", {
      headers: {
        cookie: `${AUTH_COOKIE_LEGACY_NAME}=host_only_token; ${AUTH_COOKIE_LEGACY_NAME}=parent_domain_token`,
      },
    });
    expect(auth.getTokenFromRequest(request)).toBeNull();
    expect(getTokenFromRequestEdge(request)).toBeNull();
  });

  it("uses __Host- when the leftover name is duplicated", () => {
    const request = new Request("https://sajtmaskin.se/", {
      headers: {
        cookie: [
          `${AUTH_COOKIE_LEGACY_NAME}=host_only_token`,
          `${AUTH_COOKIE_LEGACY_NAME}=parent_domain_token`,
          `${AUTH_COOKIE_HOST_NAME}=host_token`,
        ].join("; "),
      },
    });
    expect(auth.getTokenFromRequest(request)).toBe("host_token");
  });

  it("writes __Host- and expires the leftover name over HTTPS", async () => {
    const set = vi.fn();
    vi.mocked(cookies).mockResolvedValueOnce({
      set,
      get: vi.fn(),
      getAll: vi.fn(() => []),
      delete: vi.fn(),
    } as never);

    await auth.setAuthCookie("fresh_token", { secure: true });

    expect(set).toHaveBeenCalledWith(
      AUTH_COOKIE_HOST_NAME,
      "fresh_token",
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
      }),
    );
    expect(set).toHaveBeenCalledWith(
      AUTH_COOKIE_LEGACY_NAME,
      "",
      expect.objectContaining({
        path: "/",
        maxAge: 0,
        secure: true,
      }),
    );
    const writeOptions = set.mock.calls[0]?.[2] as { domain?: string };
    expect(writeOptions.domain).toBeUndefined();
  });

  it("keeps the unprefixed name on local HTTP so __Host- is not sent without Secure", async () => {
    const set = vi.fn();
    vi.mocked(cookies).mockResolvedValueOnce({
      set,
      get: vi.fn(),
      getAll: vi.fn(() => []),
      delete: vi.fn(),
    } as never);

    await auth.setAuthCookie("dev_token", { secure: false });

    expect(set).toHaveBeenCalledWith(
      AUTH_COOKIE_LEGACY_NAME,
      "dev_token",
      expect.objectContaining({ secure: false, path: "/", httpOnly: true }),
    );
    expect(set.mock.calls.some((call) => call[0] === AUTH_COOKIE_HOST_NAME)).toBe(
      false,
    );
  });

  it("clears both auth cookie names on logout", async () => {
    const set = vi.fn();
    vi.mocked(cookies).mockResolvedValueOnce({
      set,
      get: vi.fn(),
      getAll: vi.fn(() => []),
      delete: vi.fn(),
    } as never);

    await auth.clearAuthCookie({ secure: true });

    const names = set.mock.calls.map((call) => call[0]);
    expect(names).toContain(AUTH_COOKIE_HOST_NAME);
    expect(names).toContain(AUTH_COOKIE_LEGACY_NAME);
    expect(
      set.mock.calls.every((call) => (call[2] as { maxAge: number }).maxAge === 0),
    ).toBe(true);
  });
});
