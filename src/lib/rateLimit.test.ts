import { afterEach, describe, expect, it } from "vitest";
import {
  RATE_LIMITS,
  checkRateLimit,
  getClientId,
  withRateLimit,
} from "./rateLimit";

const originalUpstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const originalUpstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

afterEach(() => {
  if (originalUpstashUrl) process.env.UPSTASH_REDIS_REST_URL = originalUpstashUrl;
  else delete process.env.UPSTASH_REDIS_REST_URL;
  if (originalUpstashToken) process.env.UPSTASH_REDIS_REST_TOKEN = originalUpstashToken;
  else delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe("rateLimit", () => {
  it("uses verified userId when provided", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    expect(getClientId(req, "user_123")).toBe("user:user_123");
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
    const blocked = await withRateLimit(req2, endpoint, async () =>
      new Response("should-not-run", { status: 200 }),
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
    expect(blocked.headers.get("X-RateLimit-Remaining")).toBe("0");
  });
});
