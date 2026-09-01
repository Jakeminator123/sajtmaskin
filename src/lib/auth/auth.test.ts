import crypto from "crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getUserByEmail,
  isAdminEmail,
  markEmailVerified,
  setUserDiamonds,
  updateUserLastLogin,
} from "@/lib/db/services/users";
import { createSessionCookie } from "./session";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
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
    googleClientId: "",
    googleClientSecret: "",
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
});

describe("session cookie flags", () => {
  it("includes secure attributes in production-style cookie", () => {
    const cookie = createSessionCookie("sess_test", { secure: true });
    expect(cookie).toContain("sajtmaskin_session=sess_test");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Max-Age=");
  });
});

describe("loginUser privileged-email gate", () => {
  let auth: typeof import("./auth");

  beforeAll(async () => {
    auth = await import("./auth");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAdminEmail).mockReturnValue(false);
  });

  it("blocks an unverified privileged email on the password path and does not bootstrap admin", async () => {
    const password = "attacker-chosen-password";
    const passwordHash = auth.hashPassword(password);
    vi.mocked(isAdminEmail).mockReturnValue(true);
    vi.mocked(getUserByEmail).mockResolvedValue({
      id: "hijack_1",
      email: "admin@sajtmaskin.se",
      name: "Hijack",
      password_hash: passwordHash,
      email_verified: false,
      diamonds: 0,
    } as Awaited<ReturnType<typeof getUserByEmail>>);

    const result = await auth.loginUser("admin@sajtmaskin.se", password);

    expect(result).toEqual({
      error:
        "Du måste bekräfta din e-post innan du kan logga in. Använd 'Skicka verifieringsmail igen' i inloggningsrutan.",
    });
    expect(markEmailVerified).not.toHaveBeenCalled();
    expect(setUserDiamonds).not.toHaveBeenCalled();
    expect(updateUserLastLogin).not.toHaveBeenCalled();
  });
});
