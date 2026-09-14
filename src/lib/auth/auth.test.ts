import crypto from "crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cookies, headers } from "next/headers";
import {
  AUTH_COOKIE_HOST_NAME,
  AUTH_COOKIE_LEGACY_NAME,
  SESSION_COOKIE_HOST_NAME,
  SESSION_COOKIE_LEGACY_NAME,
} from "./host-cookies";
import { getTokenFromRequestEdge } from "./edge-auth";

const claimUnclaimedSessionProjects = vi.hoisted(() => vi.fn());

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

// The only write that could move project ownership. Mocked so a claim would be
// observable instead of throwing on the missing database connection.
vi.mock("@/lib/db/services/projects", () => ({ claimUnclaimedSessionProjects }));

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

const VALID_GUEST = "sess_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_GUEST = "sess_11111111-2222-4333-8444-555555555555";

/** One `headers()` resolution with the exact header set a test needs. */
function mockIncomingHeaders(values: Record<string, string>): void {
  vi.mocked(headers).mockResolvedValueOnce({
    get: (name: string) => values[name.toLowerCase()] ?? null,
  } as never);
}

// The `...Once` queues below must not survive a test: a reader that returns
// early leaves its cookie-store mock unconsumed and would shift the next test.
beforeEach(() => {
  vi.mocked(cookies).mockReset();
  vi.mocked(cookies).mockResolvedValue({
    set: vi.fn(),
    get: vi.fn(),
    getAll: vi.fn(() => []),
    delete: vi.fn(),
  } as never);
  vi.mocked(headers).mockReset();
  vi.mocked(headers).mockResolvedValue({ get: () => null } as never);
});

function mockCookieStore(overrides?: { getAll?: () => { name: string; value: string }[] }) {
  const set = vi.fn();
  const getAll = vi.fn(overrides?.getAll ?? (() => []));
  vi.mocked(cookies).mockResolvedValueOnce({
    set,
    get: vi.fn(),
    getAll,
    delete: vi.fn(),
  } as never);
  return { set, getAll };
}

describe("auth token security", () => {
  let auth: typeof import("./auth");

  beforeAll(async () => {
    auth = await import("./auth");
  });

  beforeEach(() => {
    claimUnclaimedSessionProjects.mockReset();
    claimUnclaimedSessionProjects.mockResolvedValue(["proj_1"]);
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

    const fromCookie = new Request("http://127.0.0.1:3010", {
      headers: { cookie: "foo=bar; sajtmaskin_auth=token_from_cookie; x=y" },
    });
    expect(auth.getTokenFromRequest(fromCookie)).toBe("token_from_cookie");
  });

  it("does not accept a lone leftover auth cookie as a session over HTTPS", () => {
    const request = new Request("https://sajtmaskin.se/", {
      headers: { cookie: `${AUTH_COOKIE_LEGACY_NAME}=leftover_jwt` },
    });
    expect(auth.getTokenFromRequest(request)).toBeNull();
    expect(getTokenFromRequestEdge(request)).toBeNull();
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
    const { set } = mockCookieStore();

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
    const { set } = mockCookieStore();

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
    const { set } = mockCookieStore();

    await auth.clearAuthCookie({ secure: true });

    const names = set.mock.calls.map((call) => call[0]);
    expect(names).toContain(AUTH_COOKIE_HOST_NAME);
    expect(names).toContain(AUTH_COOKIE_LEGACY_NAME);
    expect(
      set.mock.calls.every((call) => (call[2] as { maxAge: number }).maxAge === 0),
    ).toBe(true);
  });

  it("expires the leftover auth name on the parent Domain over HTTPS", async () => {
    const { set } = mockCookieStore();
    mockIncomingHeaders({ host: "preview.sajtmaskin.se" });

    await auth.clearAuthCookie({ secure: true });

    const leftover = set.mock.calls.find(
      (call) => call[0] === AUTH_COOKIE_LEGACY_NAME,
    );
    expect(leftover?.[2]).toMatchObject({
      domain: ".sajtmaskin.se",
      maxAge: 0,
      path: "/",
      secure: true,
    });
    const hostCookie = set.mock.calls.find(
      (call) => call[0] === AUTH_COOKIE_HOST_NAME,
    );
    expect((hostCookie?.[2] as { domain?: string }).domain).toBeUndefined();
  });
});

describe("server-component auth cookie reader", () => {
  let auth: typeof import("./auth");
  let users: typeof import("@/lib/db/services/users");

  beforeAll(async () => {
    auth = await import("./auth");
    users = await import("@/lib/db/services/users");
  });

  beforeEach(() => {
    vi.mocked(users.getUserById).mockReset();
    vi.mocked(users.getUserById).mockResolvedValue({ id: "user_1" } as never);
  });

  it("refuses a duplicated auth cookie name and does not let cookies() rescue it", async () => {
    const first = auth.createToken("user_1", "one@example.com");
    const second = auth.createToken("user_2", "two@example.com");
    mockIncomingHeaders({
      cookie: `${AUTH_COOKIE_LEGACY_NAME}=${first}; ${AUTH_COOKIE_LEGACY_NAME}=${second}`,
    });
    // Next's parser collapses the pair, so a fall-through would hand back a
    // usable JWT even though the raw header was ambiguous.
    const { getAll } = mockCookieStore({
      getAll: () => [{ name: AUTH_COOKIE_LEGACY_NAME, value: second }],
    });

    await expect(auth.getCurrentUserFromCookies()).resolves.toBeNull();
    expect(getAll).not.toHaveBeenCalled();
    expect(users.getUserById).not.toHaveBeenCalled();
  });

  it("ignores a lone leftover JWT once the request is on the HTTPS policy", async () => {
    const token = auth.createToken("user_1", "one@example.com");
    mockIncomingHeaders({
      cookie: `${AUTH_COOKIE_LEGACY_NAME}=${token}`,
      "x-forwarded-proto": "https",
    });

    await expect(auth.getCurrentUserFromCookies()).resolves.toBeNull();
    expect(users.getUserById).not.toHaveBeenCalled();
  });

  it("still reads the leftover JWT on local HTTP", async () => {
    const token = auth.createToken("user_1", "one@example.com");
    mockIncomingHeaders({ cookie: `${AUTH_COOKIE_LEGACY_NAME}=${token}` });

    await expect(auth.getCurrentUserFromCookies()).resolves.toEqual({
      id: "user_1",
    });
  });

  it("uses the __Host- cookie over a shadowed leftover on HTTPS", async () => {
    const host = auth.createToken("user_1", "one@example.com");
    const parent = auth.createToken("user_2", "two@example.com");
    mockIncomingHeaders({
      cookie: [
        `${AUTH_COOKIE_LEGACY_NAME}=${parent}`,
        `${AUTH_COOKIE_HOST_NAME}=${host}`,
      ].join("; "),
      "x-forwarded-proto": "https",
    });

    await expect(auth.getCurrentUserFromCookies()).resolves.toEqual({
      id: "user_1",
    });
    expect(users.getUserById).toHaveBeenCalledWith("user_1");
  });
});

// A leftover cookie is plantable from a subdomain, and a login only proves the
// account. So no shape of leftover — lone, shadowed, or on HTTP — may move
// `app_projects.user_id` at login.
describe("leftover guest cookie at __Host- login", () => {
  let auth: typeof import("./auth");

  beforeAll(async () => {
    auth = await import("./auth");
  });

  beforeEach(() => {
    claimUnclaimedSessionProjects.mockReset();
    claimUnclaimedSessionProjects.mockResolvedValue(["proj_1"]);
  });

  it("does not claim from an unambiguous leftover guest session", async () => {
    const token = auth.createToken("user_1", "one@example.com");
    const { set } = mockCookieStore();
    mockIncomingHeaders({
      cookie: `${SESSION_COOKIE_LEGACY_NAME}=${VALID_GUEST}`,
      host: "sajtmaskin.se",
    });

    await auth.setAuthCookie(token, { secure: true });

    expect(claimUnclaimedSessionProjects).not.toHaveBeenCalled();
    // Login writes auth cookies only; the guest name is cleaned up by the
    // guest-session path, which is complementary cleanup and not the control.
    expect(
      set.mock.calls.map((call) => call[0]),
    ).toEqual([AUTH_COOKIE_HOST_NAME, AUTH_COOKIE_LEGACY_NAME]);
  });

  it("does not claim from a shadowed leftover guest cookie", async () => {
    const token = auth.createToken("user_1", "one@example.com");
    const { set } = mockCookieStore();
    mockIncomingHeaders({
      cookie: `${SESSION_COOKIE_LEGACY_NAME}=${VALID_GUEST}; ${SESSION_COOKIE_LEGACY_NAME}=${OTHER_GUEST}`,
      host: "sajtmaskin.se",
    });

    await auth.setAuthCookie(token, { secure: true });

    expect(claimUnclaimedSessionProjects).not.toHaveBeenCalled();
    expect(
      set.mock.calls.some((call) => call[0] === SESSION_COOKIE_LEGACY_NAME),
    ).toBe(false);
  });

  it("does not claim on local HTTP, where the leftover is still the live cookie", async () => {
    const token = auth.createToken("user_1", "one@example.com");
    const { set } = mockCookieStore();
    mockIncomingHeaders({
      cookie: `${SESSION_COOKIE_LEGACY_NAME}=${VALID_GUEST}`,
      host: "127.0.0.1:3010",
    });

    await auth.setAuthCookie(token, { secure: false });

    expect(claimUnclaimedSessionProjects).not.toHaveBeenCalled();
    expect(set.mock.calls.map((call) => call[0])).toEqual([
      AUTH_COOKIE_LEGACY_NAME,
    ]);
  });

  it("does not claim when a __Host- guest session is also present", async () => {
    const token = auth.createToken("user_1", "one@example.com");
    mockCookieStore();
    mockIncomingHeaders({
      cookie: [
        `${SESSION_COOKIE_HOST_NAME}=${OTHER_GUEST}`,
        `${SESSION_COOKIE_LEGACY_NAME}=${VALID_GUEST}`,
      ].join("; "),
      host: "sajtmaskin.se",
    });

    await auth.setAuthCookie(token, { secure: true });

    expect(claimUnclaimedSessionProjects).not.toHaveBeenCalled();
  });
});
