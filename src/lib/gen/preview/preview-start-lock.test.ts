import { afterEach, describe, expect, it, vi } from "vitest";

const redisRef = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));
vi.mock("@/lib/data/redis", () => ({ getRedis: () => redisRef.current }));

import { PREVIEW_START_LOCK_POLL_MS, withPreviewStartLock } from "./preview-start-lock";

function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    set: vi.fn(async (key: string, value: string, ..._args: unknown[]) => {
      if (store.has(key)) return null;
      store.set(key, value);
      return "OK";
    }),
    eval: vi.fn(async (_script: string, _n: number, key: string, token: string) => {
      if (store.get(key) !== token) return 0;
      store.delete(key);
      return 1;
    }),
  };
}

afterEach(() => {
  redisRef.current = null;
  vi.restoreAllMocks();
});

describe("withPreviewStartLock", () => {
  it("runs directly without Redis (local dev / tests)", async () => {
    const run = vi.fn(async () => "ok");
    expect(await withPreviewStartLock("chat", run)).toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("holds the per-chat key while running and releases only its own token", async () => {
    const redis = fakeRedis();
    redisRef.current = redis;
    let heldDuringRun = false;
    await withPreviewStartLock("chat-1", async () => {
      heldDuringRun = redis.store.size === 1;
    });
    expect(heldDuringRun).toBe(true);
    expect(redis.store.size).toBe(0);
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining("preview-session:start-lock:chat-1"),
      expect.any(String),
      "EX",
      expect.any(Number),
      "NX",
    );
  });

  it("a second instance waits for the holder and runs only after release", async () => {
    const redis = fakeRedis();
    redisRef.current = redis;
    vi.spyOn(console, "info").mockImplementation(() => {});
    const order: string[] = [];
    let releaseHolder!: () => void;
    const holder = withPreviewStartLock("chat-2", async () => {
      order.push("holder:start");
      await new Promise<void>((resolve) => (releaseHolder = resolve));
      order.push("holder:end");
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    let polls = 0;
    let waiterSawWait = false;
    const waiter = withPreviewStartLock(
      "chat-2",
      async ({ waited }) => {
        waiterSawWait = waited;
        order.push("waiter:run");
      },
      {
        sleep: async (ms) => {
          expect(ms).toBe(PREVIEW_START_LOCK_POLL_MS);
          polls += 1;
          if (polls === 2) {
            releaseHolder();
            await holder;
          }
        },
      },
    );
    await waiter;
    expect(order).toEqual(["holder:start", "holder:end", "waiter:run"]);
    expect(waiterSawWait).toBe(true);
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining("waited for another instance"));
    expect(redis.store.size).toBe(0);
  });

  it("fails open when the holder outlives the wait, and never releases a key it does not own", async () => {
    const redis = fakeRedis();
    // Another instance holds the key for the whole wait.
    redis.set.mockResolvedValue(null);
    redisRef.current = redis;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let clock = 0;
    const run = vi.fn(async () => "ran");
    const result = await withPreviewStartLock("chat-3", run, {
      deadlineEpochMs: 5_000,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    expect(result).toBe("ran");
    expect(clock).toBeLessThanOrEqual(5_000);
    expect(redis.set.mock.calls.length).toBeGreaterThan(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("still held after waiting"));
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it("fails open when Redis errors", async () => {
    const redis = fakeRedis();
    redis.set.mockRejectedValueOnce(new Error("redis down"));
    redisRef.current = redis;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await withPreviewStartLock("chat-4", async () => "ok")).toBe("ok");
    expect(redis.eval).not.toHaveBeenCalled();
  });
});
