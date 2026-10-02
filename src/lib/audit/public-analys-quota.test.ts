import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redisValues = vi.hoisted(() => new Map<string, string>());
const redisSet = vi.hoisted(() => vi.fn());
const redisGet = vi.hoisted(() => vi.fn());
const redisEval = vi.hoisted(() => vi.fn());
const redisConstructor = vi.hoisted(() => vi.fn());
const redisControl = vi.hoisted(() => ({
  throwAfterCommit: false,
  throwOnConstruct: false,
}));

vi.mock("@upstash/redis", () => ({
  Redis: function MockRedis(options: unknown) {
    redisConstructor(options);
    if (redisControl.throwOnConstruct) throw new Error("invalid redis configuration");
    return { set: redisSet, get: redisGet, eval: redisEval };
  },
}));

const {
  acquirePublicAnalysQuota,
  commitPublicAnalysQuota,
  getStockholmCalendarDay,
  releasePublicAnalysQuota,
  resetPublicAnalysQuotaForTests,
} = await import("./public-analys-quota");

const originalEnv = {
  nodeEnv: process.env.NODE_ENV,
  vercel: process.env.VERCEL,
  vercelEnv: process.env.VERCEL_ENV,
  upstashUrl: process.env.UPSTASH_REDIS_REST_URL,
  upstashToken: process.env.UPSTASH_REDIS_REST_TOKEN,
  kvUrl: process.env.KV_REST_API_URL,
  kvToken: process.env.KV_REST_API_TOKEN,
};

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  resetPublicAnalysQuotaForTests();
  redisValues.clear();
  redisControl.throwAfterCommit = false;
  redisControl.throwOnConstruct = false;
  vi.clearAllMocks();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  vi.stubEnv("NODE_ENV", "test");

  redisSet.mockImplementation(async (key: string, value: string) => {
    if (redisValues.has(key)) return null;
    redisValues.set(key, value);
    return "OK";
  });
  redisGet.mockImplementation(async (key: string) => redisValues.get(key) ?? null);
  redisEval.mockImplementation(
    async (script: string, keys: string[], args: Array<string | number>) => {
      const key = keys[0];
      const current = redisValues.get(key);
      if (script.includes('redis.call("set"')) {
        if (current !== args[0]) return 0;
        redisValues.set(key, String(args[1]));
        if (redisControl.throwAfterCommit) throw new Error("commit response lost");
        return 1;
      }
      if (current !== args[0] && current !== args[1]) return 0;
      redisValues.delete(key);
      return 1;
    },
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  restoreEnv("NODE_ENV", originalEnv.nodeEnv);
  restoreEnv("VERCEL", originalEnv.vercel);
  restoreEnv("VERCEL_ENV", originalEnv.vercelEnv);
  restoreEnv("UPSTASH_REDIS_REST_URL", originalEnv.upstashUrl);
  restoreEnv("UPSTASH_REDIS_REST_TOKEN", originalEnv.upstashToken);
  restoreEnv("KV_REST_API_URL", originalEnv.kvUrl);
  restoreEnv("KV_REST_API_TOKEN", originalEnv.kvToken);
});

describe("public analys daily quota", () => {
  it("admits exactly one concurrent reservation", async () => {
    const now = new Date("2026-06-01T10:00:00.000Z");
    const results = await Promise.all([
      acquirePublicAnalysQuota("ip:203.0.113.1", now),
      acquirePublicAnalysQuota("ip:203.0.113.1", now),
    ]);

    expect(results.filter((result) => result.status === "acquired")).toHaveLength(1);
    expect(results.filter((result) => result.status === "reserved")).toHaveLength(1);
  });

  it("admits exactly one Redis-backed concurrent reservation with NX and a 360s TTL", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = "secret";
    const now = new Date("2026-06-01T10:00:00.000Z");

    const results = await Promise.all([
      acquirePublicAnalysQuota("ip:203.0.113.10", now),
      acquirePublicAnalysQuota("ip:203.0.113.10", now),
    ]);

    expect(results.filter((result) => result.status === "acquired")).toHaveLength(1);
    expect(results.filter((result) => result.status === "reserved")).toHaveLength(1);
    expect(redisSet).toHaveBeenCalledTimes(2);
    for (const call of redisSet.mock.calls) {
      expect(call[2]).toEqual({ nx: true, ex: 360 });
    }
  });

  it("blocks the same client after a successful commit", async () => {
    const now = new Date("2026-06-01T10:00:00.000Z");
    const first = await acquirePublicAnalysQuota("ip:203.0.113.2", now);
    expect(first.status).toBe("acquired");
    if (first.status !== "acquired") throw new Error("expected reservation");

    expect(await commitPublicAnalysQuota(first.reservation, now)).toBe("committed");
    expect(await acquirePublicAnalysQuota("ip:203.0.113.2", now)).toEqual({
      status: "committed",
    });
  });

  it("allows retry after a failed run releases its reservation", async () => {
    const now = new Date("2026-06-01T10:00:00.000Z");
    const first = await acquirePublicAnalysQuota("ip:203.0.113.3", now);
    if (first.status !== "acquired") throw new Error("expected reservation");

    expect(await releasePublicAnalysQuota(first.reservation, now)).toBe("released");
    expect((await acquirePublicAnalysQuota("ip:203.0.113.3", now)).status).toBe("acquired");
  });

  it("never lets a stale token release a replacement reservation", async () => {
    const firstTime = new Date("2026-06-01T10:00:00.000Z");
    const afterExpiry = new Date(firstTime.getTime() + 361_000);
    const first = await acquirePublicAnalysQuota("ip:203.0.113.4", firstTime);
    if (first.status !== "acquired") throw new Error("expected first reservation");
    const replacement = await acquirePublicAnalysQuota("ip:203.0.113.4", afterExpiry);
    if (replacement.status !== "acquired") throw new Error("expected replacement reservation");

    expect(await releasePublicAnalysQuota(first.reservation, afterExpiry)).toBe("lost");
    expect(await commitPublicAnalysQuota(replacement.reservation, afterExpiry)).toBe("committed");
  });

  it("uses Lua CAS so stale Redis release and commit cannot mutate a replacement token", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = "secret";
    const first = await acquirePublicAnalysQuota("ip:203.0.113.11");
    if (first.status !== "acquired") throw new Error("expected reservation");
    const replacementToken = "reserved:replacement-token";
    redisValues.set(first.reservation.key, replacementToken);

    expect(await releasePublicAnalysQuota(first.reservation)).toBe("lost");
    expect(redisValues.get(first.reservation.key)).toBe(replacementToken);
    expect(await commitPublicAnalysQuota(first.reservation)).toBe("lost");
    expect(redisValues.get(first.reservation.key)).toBe(replacementToken);

    const [releaseScript, releaseKeys, releaseArgs] = redisEval.mock.calls[0] as [
      string,
      string[],
      string[],
    ];
    expect(releaseScript).toContain("current == ARGV[1] or current == ARGV[2]");
    expect(releaseKeys).toEqual([first.reservation.key]);
    expect(releaseArgs).toEqual([first.reservation.token, `committed:${first.reservation.token}`]);

    const [commitScript, commitKeys, commitArgs] = redisEval.mock.calls[1] as [
      string,
      string[],
      Array<string | number>,
    ];
    expect(commitScript).toContain('redis.call("get", KEYS[1]) == ARGV[1]');
    expect(commitScript).toContain('redis.call("set", KEYS[1], ARGV[2], "EX", ARGV[3])');
    expect(commitKeys).toEqual([first.reservation.key]);
    expect(commitArgs).toEqual([
      first.reservation.token,
      `committed:${first.reservation.token}`,
      48 * 60 * 60,
    ]);
  });

  it("fails closed in a deployed runtime without Redis", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(await acquirePublicAnalysQuota("ip:203.0.113.5")).toEqual({
      status: "unavailable",
    });
  });

  it("uses bounded no-retry Redis commands", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = "secret";

    expect((await acquirePublicAnalysQuota("ip:203.0.113.6")).status).toBe("acquired");
    expect(redisConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        retry: false,
        signal: expect.any(Function),
      }),
    );
    const options = redisConstructor.mock.calls[0]?.[0] as { signal: () => AbortSignal };
    expect(options.signal()).toBeInstanceOf(AbortSignal);
  });

  it("returns unavailable when Redis client construction fails", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = "secret";
    redisControl.throwOnConstruct = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await acquirePublicAnalysQuota("ip:203.0.113.9")).toEqual({
      status: "unavailable",
    });
  });

  it("releases its own committed token when the commit acknowledgement is lost", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = "secret";
    const first = await acquirePublicAnalysQuota("ip:203.0.113.7");
    if (first.status !== "acquired") throw new Error("expected reservation");
    redisControl.throwAfterCommit = true;

    expect(await commitPublicAnalysQuota(first.reservation)).toBe("unavailable");
    redisControl.throwAfterCommit = false;
    expect(await releasePublicAnalysQuota(first.reservation)).toBe("released");
    expect((await acquirePublicAnalysQuota("ip:203.0.113.7")).status).toBe("acquired");
  });

  it("uses Stockholm calendar days across spring and autumn DST boundaries", () => {
    expect(getStockholmCalendarDay(new Date("2026-03-28T22:59:59.000Z"))).toBe("2026-03-28");
    expect(getStockholmCalendarDay(new Date("2026-03-28T23:00:00.000Z"))).toBe("2026-03-29");
    expect(getStockholmCalendarDay(new Date("2026-03-29T21:59:59.000Z"))).toBe("2026-03-29");
    expect(getStockholmCalendarDay(new Date("2026-03-29T22:00:00.000Z"))).toBe("2026-03-30");

    expect(getStockholmCalendarDay(new Date("2026-10-24T21:59:59.000Z"))).toBe("2026-10-24");
    expect(getStockholmCalendarDay(new Date("2026-10-24T22:00:00.000Z"))).toBe("2026-10-25");
    expect(getStockholmCalendarDay(new Date("2026-10-25T22:59:59.000Z"))).toBe("2026-10-25");
    expect(getStockholmCalendarDay(new Date("2026-10-25T23:00:00.000Z"))).toBe("2026-10-26");
  });

  it("admits the same client again on the next Stockholm calendar day", async () => {
    const beforeMidnight = new Date("2026-07-01T21:59:59.000Z");
    const afterMidnight = new Date("2026-07-01T22:00:00.000Z");
    const first = await acquirePublicAnalysQuota("ip:203.0.113.8", beforeMidnight);
    if (first.status !== "acquired") throw new Error("expected reservation");
    expect(await commitPublicAnalysQuota(first.reservation, beforeMidnight)).toBe("committed");

    expect((await acquirePublicAnalysQuota("ip:203.0.113.8", afterMidnight)).status).toBe(
      "acquired",
    );
  });
});
