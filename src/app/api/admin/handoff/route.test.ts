import { createHmac, randomBytes } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetHandoffJtiStore } from "@/lib/auth/admin-handoff";

const setAuthCookie = vi.hoisted(() => vi.fn(async () => {}));
const createConfiguredAdminLogin = vi.hoisted(() =>
  vi.fn(async (): Promise<{ token: string } | { error: "unconfigured" }> => ({ token: "jwt-admin" })),
);
const withRateLimit = vi.hoisted(() =>
  vi.fn((_req: unknown, _key: string, handler: () => Promise<Response>) => handler()),
);

vi.mock("@/lib/auth/auth", () => ({
  setAuthCookie,
  createConfiguredAdminLogin,
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit,
}));

import { GET, POST } from "./route";

const SECRET = "route-handoff-secret";

function sign(
  next = "/admin/kostnadsfri",
  claims: { iat?: number; exp?: number; jti?: string } = {},
) {
  const iat = claims.iat ?? Math.floor(Date.now() / 1000);
  const payload = {
    iss: "jakobscrape-dash",
    aud: "sajtmaskin-admin",
    iat,
    exp: claims.exp ?? iat + 60,
    jti: claims.jti ?? randomBytes(16).toString("hex"),
    next,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", SECRET).update(body, "utf8").digest("base64url");
  return `${body}.${signature}`;
}

function post(token: string) {
  return new NextRequest("https://sajtmaskin.se/api/admin/handoff", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://sajtmaskin-dash.onrender.com",
    },
    body: new URLSearchParams({ token }).toString(),
  });
}

function location(response: Response): URL {
  return new URL(response.headers.get("location") ?? "", "https://sajtmaskin.se");
}

const REDIS_ENV_KEYS = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
] as const;
const savedRedisEnv = Object.fromEntries(REDIS_ENV_KEYS.map((key) => [key, process.env[key]]));

function hideRedisEnv(): void {
  for (const key of REDIS_ENV_KEYS) delete process.env[key];
}

function restoreRedisEnv(): void {
  for (const key of REDIS_ENV_KEYS) {
    const value = savedRedisEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

beforeEach(() => {
  hideRedisEnv();
  process.env.ADMIN_HANDOFF_SECRET = SECRET;
  createConfiguredAdminLogin.mockResolvedValue({ token: "jwt-admin" });
  withRateLimit.mockImplementation((_req, _key, handler: () => Promise<Response>) => handler());
  resetHandoffJtiStore();
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.ADMIN_HANDOFF_SECRET;
  restoreRedisEnv();
  resetHandoffJtiStore();
});

describe("POST /api/admin/handoff", () => {
  it("sets the admin session and redirects to next", async () => {
    const res = await POST(post(sign("/admin")));
    expect(res.status).toBe(303);
    expect(location(res).origin).toBe("https://sajtmaskin.se");
    expect(location(res).pathname).toBe("/admin");
    expect(setAuthCookie).toHaveBeenCalledWith("jwt-admin", { secure: true });
    expect(withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      "auth:admin-handoff",
      expect.any(Function),
    );
  });

  it("sends a bad signature, an expired ticket, and a missing secret to login", async () => {
    const valid = sign();
    const forged = `${valid.slice(0, -1)}${valid.endsWith("a") ? "b" : "a"}`;
    const forgedRes = await POST(post(forged));
    expect(forgedRes.status).toBe(303);
    expect(location(forgedRes).pathname).toBe("/");

    const iat = Math.floor(Date.now() / 1000) - 120;
    const expired = await POST(post(sign("/admin/kostnadsfri", { iat, exp: iat + 60 })));
    expect(location(expired).pathname).toBe("/");

    delete process.env.ADMIN_HANDOFF_SECRET;
    const missing = await POST(post(sign()));
    expect(location(missing).pathname).toBe("/");
    expect(setAuthCookie).not.toHaveBeenCalled();
  });

  it("rejects a reused jti", async () => {
    const token = sign();
    const first = await POST(post(token));
    expect(location(first).pathname).toBe("/admin/kostnadsfri");
    const second = await POST(post(token));
    expect(second.status).toBe(303);
    expect(location(second).pathname).toBe("/");
    expect(setAuthCookie).toHaveBeenCalledTimes(1);
  });

  it("keeps an off-site next on the admin stats page", async () => {
    const res = await POST(post(sign("https://evil.example/admin")));
    const target = location(res);
    expect(target.origin).toBe("https://sajtmaskin.se");
    expect(target.pathname).toBe("/admin/kostnadsfri");
    expect(target.href).not.toContain("evil.example");
    expect(setAuthCookie).toHaveBeenCalledTimes(1);
  });

  it("returns 429 when the rate limit bucket is exhausted", async () => {
    withRateLimit.mockResolvedValueOnce(new Response(null, { status: 429 }));
    const res = await POST(post(sign()));
    expect(res.status).toBe(429);
    expect(setAuthCookie).not.toHaveBeenCalled();
  });

  it("does not set a session when no admin user is configured", async () => {
    createConfiguredAdminLogin.mockResolvedValueOnce({ error: "unconfigured" });
    const res = await POST(post(sign()));
    expect(location(res).pathname).toBe("/");
    expect(setAuthCookie).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/handoff", () => {
  it("answers 405", () => {
    const res = GET();
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
  });
});
