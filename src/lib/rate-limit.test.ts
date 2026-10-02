import { afterEach, describe, expect, it, vi } from "vitest";

const distributedLimit = vi.hoisted(() => vi.fn());
const ratelimitConstructor = vi.hoisted(() => vi.fn());
const ratelimitControl = vi.hoisted(() => ({ throwOnConstruct: false }));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class MockRatelimit {
    static fixedWindow(maxRequests: number, window: string) {
      return { maxRequests, window };
    }

    limiter = { limit: distributedLimit };

    constructor(options: unknown) {
      ratelimitConstructor(options);
      if (ratelimitControl.throwOnConstruct) throw new Error("invalid limiter configuration");
    }

    limit(clientId: string) {
      return this.limiter.limit(clientId);
    }
  },
}));

vi.mock("@upstash/redis", () => ({
  Redis: class MockRedis {},
}));

import { RATE_LIMITS, checkRateLimit, getClientId, withRateLimit } from "./rate-limit";

const originalUpstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const originalUpstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const originalKvUrl = process.env.KV_REST_API_URL;
const originalKvToken = process.env.KV_REST_API_TOKEN;
const originalAllowMemoryProd = process.env.SAJTMASKIN_RATE_LIMIT_ALLOW_MEMORY_IN_PROD;
const originalTrustForwardedFor = process.env.SAJTMASKIN_TRUST_X_FORWARDED_FOR;

afterEach(() => {
  ratelimitControl.throwOnConstruct = false;
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  if (originalUpstashUrl) process.env.UPSTASH_REDIS_REST_URL = originalUpstashUrl;
  else delete process.env.UPSTASH_REDIS_REST_URL;
  if (originalUpstashToken) process.env.UPSTASH_REDIS_REST_TOKEN = originalUpstashToken;
  else delete process.env.UPSTASH_REDIS_REST_TOKEN;
  if (originalKvUrl) process.env.KV_REST_API_URL = originalKvUrl;
  else delete process.env.KV_REST_API_URL;
  if (originalKvToken) process.env.KV_REST_API_TOKEN = originalKvToken;
  else delete process.env.KV_REST_API_TOKEN;
  if (originalAllowMemoryProd)
    process.env.SAJTMASKIN_RATE_LIMIT_ALLOW_MEMORY_IN_PROD = originalAllowMemoryProd;
  else delete process.env.SAJTMASKIN_RATE_LIMIT_ALLOW_MEMORY_IN_PROD;
  if (originalTrustForwardedFor)
    process.env.SAJTMASKIN_TRUST_X_FORWARDED_FOR = originalTrustForwardedFor;
  else delete process.env.SAJTMASKIN_TRUST_X_FORWARDED_FOR;
});

describe("rateLimit", () => {
  it("configures the public attempt bucket at three requests per ten minutes", () => {
    expect(RATE_LIMITS["analys:public:attempt"]).toEqual({
      maxRequests: 3,
      windowMs: 10 * 60 * 1000,
    });
  });

  it("uses verified userId when provided", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    expect(getClientId(req, { userId: "user_123" })).toBe("user:user_123");
  });

  // Codex P2 (PR #435): the guest session id is client-controlled (cookie /
  // x-session-id header) — rotating it must not mint a fresh rate-limit
  // bucket. Guests are keyed on IP.
  it("keys guests on IP and ignores client-supplied session headers", () => {
    const req = new Request("https://example.com", {
      headers: {
        "x-session-id": "rotated-session-1",
        "x-forwarded-for": "1.2.3.4",
      },
    });
    expect(getClientId(req)).toBe("ip:1.2.3.4");

    const rotated = new Request("https://example.com", {
      headers: {
        "x-session-id": "rotated-session-2",
        "x-forwarded-for": "1.2.3.4",
      },
    });
    expect(getClientId(rotated)).toBe(getClientId(req));
  });

  it("ignores x-user-id header from request", () => {
    const req = new Request("https://example.com", {
      headers: {
        "x-user-id": "spoofed_id",
        "x-forwarded-for": "1.2.3.4",
      },
    });
    expect(getClientId(req)).toBe("ip:1.2.3.4");
  });

  it("prefers x-real-ip over x-forwarded-for", () => {
    const req = new Request("https://example.com", {
      headers: {
        "x-real-ip": "5.5.5.5",
        "x-forwarded-for": "9.9.9.9, 10.0.0.1",
      },
    });
    expect(getClientId(req)).toBe("ip:5.5.5.5");
  });

  it("falls back to first forwarded IP", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" },
    });
    expect(getClientId(req)).toBe("ip:9.9.9.9");
  });

  it("does not trust x-forwarded-for in production unless explicitly enabled", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.SAJTMASKIN_TRUST_X_FORWARDED_FOR;

    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" },
    });

    expect(getClientId(req)).toBe("ip:unknown");
  });

  it("can explicitly trust x-forwarded-for in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.SAJTMASKIN_TRUST_X_FORWARDED_FOR = "true";

    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" },
    });

    expect(getClientId(req)).toBe("ip:9.9.9.9");
  });

  it("returns ip:unknown when no IP headers present", () => {
    const req = new Request("https://example.com");
    expect(getClientId(req)).toBe("ip:unknown");
  });

  it("enforces limits in memory mode", () => {
    const endpoint = `unit:memory:${Date.now()}`;
    const client = `client_${Math.random()}`;
    const cfg = { maxRequests: 2, windowMs: 10_000 };

    const first = checkRateLimit(client, endpoint, cfg);
    const second = checkRateLimit(client, endpoint, cfg);
    const third = checkRateLimit(client, endpoint, cfg);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it("resets memory window after expiry", async () => {
    const endpoint = `unit:reset:${Date.now()}`;
    const client = `client_${Math.random()}`;
    const cfg = { maxRequests: 1, windowMs: 20 };

    const first = checkRateLimit(client, endpoint, cfg);
    expect(first.allowed).toBe(true);

    const blocked = checkRateLimit(client, endpoint, cfg);
    expect(blocked.allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 30));
    const allowedAgain = checkRateLimit(client, endpoint, cfg);
    expect(allowedAgain.allowed).toBe(true);
  });

  it("returns 429 and rate limit headers in withRateLimit", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;

    const endpoint = `unit:withRateLimit:${Date.now()}`;
    RATE_LIMITS[endpoint] = { maxRequests: 1, windowMs: 60_000 };

    const req1 = new Request("https://example.com", {
      headers: { "x-forwarded-for": "7.7.7.7" },
    });
    const ok = await withRateLimit(req1, endpoint, async () => new Response("ok", { status: 200 }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("X-RateLimit-Mode")).toBe("memory");

    const req2 = new Request("https://example.com", {
      headers: { "x-forwarded-for": "7.7.7.7" },
    });
    const blocked = await withRateLimit(
      req2,
      endpoint,
      async () => new Response("should-not-run", { status: 200 }),
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
    expect(blocked.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("keys withRateLimit on verified userId across different IPs", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;

    const endpoint = `unit:withRateLimit-user:${Date.now()}`;
    RATE_LIMITS[endpoint] = { maxRequests: 1, windowMs: 60_000 };

    const req1 = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.1.1.1" },
    });
    const ok = await withRateLimit(
      req1,
      endpoint,
      async () => new Response("ok", { status: 200 }),
      { userId: "user_abc" },
    );
    expect(ok.status).toBe(200);

    const req2 = new Request("https://example.com", {
      headers: { "x-forwarded-for": "9.9.9.9" },
    });
    const blocked = await withRateLimit(
      req2,
      endpoint,
      async () => new Response("should-not-run", { status: 200 }),
      { userId: "user_abc" },
    );
    expect(blocked.status).toBe(429);
  });

  it("fails closed in production when distributed rate limiting is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.SAJTMASKIN_RATE_LIMIT_ALLOW_MEMORY_IN_PROD;

    const res = await withRateLimit(
      new Request("https://example.com"),
      `unit:prod-missing-redis:${Date.now()}`,
      async () => new Response("should-not-run", { status: 200 }),
    );

    expect(res.status).toBe(503);
    expect(res.headers.get("X-RateLimit-Mode")).toBe("unconfigured");
  });

  it("allows explicit production memory fallback for emergency/dev-like deployments", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    process.env.SAJTMASKIN_RATE_LIMIT_ALLOW_MEMORY_IN_PROD = "1";

    const res = await withRateLimit(
      new Request("https://example.com"),
      `unit:prod-memory-opt-in:${Date.now()}`,
      async () => new Response("ok", { status: 200 }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Mode")).toBe("memory");
  });

  it("keeps the default distributed-timeout behavior fail-open", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = "secret";
    distributedLimit.mockResolvedValue({
      success: true,
      remaining: 0,
      reset: Date.now() + 60_000,
      reason: "timeout",
    });
    const handler = vi.fn(async () => new Response("ok"));

    const response = await withRateLimit(
      new Request("https://example.com", { headers: { "x-real-ip": "203.0.113.1" } }),
      `unit:timeout-default:${Date.now()}`,
      handler,
    );

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("fails closed on a distributed timeout only when opted in", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = "secret";
    distributedLimit.mockResolvedValue({
      success: true,
      remaining: 0,
      reset: Date.now() + 60_000,
      reason: "timeout",
    });
    const handler = vi.fn(async () => new Response("should-not-run"));

    const response = await withRateLimit(
      new Request("https://example.com", { headers: { "x-real-ip": "203.0.113.2" } }),
      `unit:timeout-closed:${Date.now()}`,
      handler,
      { failClosedOnTimeout: true },
    );

    expect(response.status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
    expect(ratelimitConstructor).toHaveBeenCalledWith(expect.objectContaining({ timeout: 2_000 }));
  });

  it("fails closed on a limiter exception when opted in", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = "secret";
    distributedLimit.mockRejectedValue(new Error("redis unavailable"));
    const handler = vi.fn(async () => new Response("should-not-run"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await withRateLimit(
      new Request("https://example.com", { headers: { "x-real-ip": "203.0.113.3" } }),
      `unit:exception-closed:${Date.now()}`,
      handler,
      { failClosedOnTimeout: true },
    );

    expect(response.status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
  });

  it("fails closed when the opted-in limiter cannot be constructed", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = "secret";
    ratelimitControl.throwOnConstruct = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await withRateLimit(
      new Request("https://example.com", { headers: { "x-real-ip": "203.0.113.5" } }),
      `unit:constructor-closed:${Date.now()}`,
      async () => new Response("should-not-run"),
      { failClosedOnTimeout: true },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("X-RateLimit-Mode")).toBe("unavailable");
  });

  it("preserves the default exception behavior for other endpoints", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = "secret";
    distributedLimit.mockRejectedValue(new Error("redis unavailable"));

    await expect(
      withRateLimit(
        new Request("https://example.com", { headers: { "x-real-ip": "203.0.113.4" } }),
        `unit:exception-default:${Date.now()}`,
        async () => new Response("should-not-run"),
      ),
    ).rejects.toThrow("redis unavailable");
  });
});
