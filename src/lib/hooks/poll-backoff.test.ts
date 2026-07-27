import { describe, expect, it, vi } from "vitest";

import {
  POLL_BACKOFF_MAX_MS,
  PollFetchError,
  pollBackoffDelayMs,
  pollJsonFetcher,
  pollRetryAfterMs,
  swrRefreshIntervalMs,
} from "./poll-backoff";

const noJitter = { random: () => 0 };

describe("pollBackoffDelayMs", () => {
  it("keeps the healthy cadence while nothing has failed", () => {
    expect(pollBackoffDelayMs(4_000, 0, noJitter)).toBe(4_000);
    expect(pollBackoffDelayMs(4_000, -1, noJitter)).toBe(4_000);
  });

  it("doubles per consecutive failure", () => {
    expect(pollBackoffDelayMs(4_000, 1, noJitter)).toBe(4_000);
    expect(pollBackoffDelayMs(4_000, 2, noJitter)).toBe(8_000);
    expect(pollBackoffDelayMs(4_000, 3, noJitter)).toBe(16_000);
  });

  it("caps the delay and never overflows on a long outage", () => {
    expect(pollBackoffDelayMs(4_000, 20, noJitter)).toBe(POLL_BACKOFF_MAX_MS);
    expect(Number.isFinite(pollBackoffDelayMs(4_000, 5_000, noJitter))).toBe(true);
  });

  it("adds upward jitter so parallel builders don't retry in lockstep", () => {
    const full = pollBackoffDelayMs(4_000, 2, { random: () => 1 });
    expect(full).toBe(10_000); // 8000 + 25%
    expect(pollBackoffDelayMs(4_000, 2, { random: () => 0.5 })).toBe(9_000);
    expect(full).toBeGreaterThan(pollBackoffDelayMs(4_000, 2, noJitter));
  });
});

describe("pollRetryAfterMs", () => {
  it("reads Retry-After from a degraded 503", () => {
    expect(
      pollRetryAfterMs({ status: 503, headers: new Headers({ "Retry-After": "3" }) }),
    ).toBe(3_000);
  });

  it("ignores statuses and responses that carry no hint", () => {
    expect(pollRetryAfterMs({ status: 503, headers: new Headers() })).toBeNull();
    expect(
      pollRetryAfterMs({ status: 500, headers: new Headers({ "Retry-After": "3" }) }),
    ).toBeNull();
  });
});

describe("swrRefreshIntervalMs", () => {
  it("leaves a disabled poller off", () => {
    expect(swrRefreshIntervalMs(0, 5, null)).toBe(0);
  });

  it("returns the base interval while healthy", () => {
    expect(swrRefreshIntervalMs(30_000, 0, null)).toBe(30_000);
  });

  it("waits at least as long as the server asked", () => {
    const withHint = swrRefreshIntervalMs(
      1_000,
      1,
      new PollFetchError("db unavailable", 503, 30_000),
    );
    expect(withHint).toBe(30_000);
  });

  it("backs off on its own when there is no hint", () => {
    expect(swrRefreshIntervalMs(10_000, 3, new Error("network"))).toBeGreaterThanOrEqual(40_000);
  });
});

describe("pollJsonFetcher", () => {
  it("throws a PollFetchError carrying status and Retry-After", async () => {
    const response = new Response(
      JSON.stringify({ ok: false, error: "Databasen svarar inte", code: "db_unavailable" }),
      { status: 503, headers: { "Retry-After": "3", "Content-Type": "application/json" } },
    );
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(pollJsonFetcher("/api/x")).rejects.toMatchObject({
      name: "PollFetchError",
      status: 503,
      retryAfterMs: 3_000,
      message: "Databasen svarar inte",
    });

    vi.unstubAllGlobals();
  });

  it("returns the parsed body on success", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ versions: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(pollJsonFetcher("/api/x")).resolves.toEqual({ versions: [] });

    vi.unstubAllGlobals();
  });
});
