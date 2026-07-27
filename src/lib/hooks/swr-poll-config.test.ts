import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A2 regression coverage for the SWR-backed pollers (`useChatReadiness`,
 * `useVersions`).
 *
 * SWR keeps `refreshInterval` in the dependency list of its polling effect
 * (`node_modules/swr` → "// Polling"). A callback recreated on every render
 * therefore tears the timer down and starts a fresh one before it can elapse —
 * and the builder re-renders constantly while streaming, so the endpoint would
 * silently stop being polled at all. The identity must survive a re-render, and
 * only change when the cadence itself changes.
 *
 * The same config object is where the backoff lives, so this also locks that a
 * failed poll stretches the cadence and a success resets it.
 */

type CapturedConfig = {
  refreshInterval?: unknown;
  onSuccess?: () => void;
  onError?: (err: unknown) => void;
  onErrorRetry?: (
    error: unknown,
    key: string,
    config: { errorRetryCount?: number },
    revalidate: (opts: { retryCount: number }) => void,
    opts: { retryCount: number },
  ) => void;
};

const useSWRMock = vi.hoisted(() => vi.fn());

vi.mock("swr", () => ({ default: useSWRMock }));

const { useChatReadiness } = await import("./useChatReadiness");
const { useVersions } = await import("./useVersions");
const { PollFetchError } = await import("./poll-backoff");

function lastConfig(): CapturedConfig {
  const call = useSWRMock.mock.calls.at(-1);
  return (call?.[2] ?? {}) as CapturedConfig;
}

function callRefreshInterval(config: CapturedConfig, latest?: unknown): number {
  const fn = config.refreshInterval as (latest?: unknown) => number;
  return fn(latest);
}

beforeEach(() => {
  useSWRMock.mockReset();
  useSWRMock.mockReturnValue({
    data: undefined,
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  });
});

describe("useChatReadiness — SWR poll config", () => {
  it("keeps a stable refreshInterval identity across re-renders", () => {
    const { rerender } = renderHook(() => useChatReadiness("chat_1", "ver_1"));
    const first = lastConfig().refreshInterval;

    rerender();
    rerender();

    expect(lastConfig().refreshInterval).toBe(first);
  });

  it("changes identity when the cadence changes", () => {
    const { rerender } = renderHook(
      ({ generating }: { generating: boolean }) =>
        useChatReadiness("chat_1", "ver_1", { isGenerating: generating }),
      { initialProps: { generating: false } },
    );
    const idle = lastConfig().refreshInterval;

    rerender({ generating: true });

    expect(lastConfig().refreshInterval).not.toBe(idle);
  });

  it("backs off while failing and honours Retry-After, then resets on success", () => {
    renderHook(() => useChatReadiness("chat_1", "ver_1", { idleRefreshIntervalMs: 30_000 }));
    const config = lastConfig();

    expect(callRefreshInterval(config)).toBe(30_000);

    config.onError?.(new PollFetchError("db unavailable", 503, 3_000));
    expect(callRefreshInterval(config)).toBeGreaterThanOrEqual(30_000);

    config.onError?.(new PollFetchError("db unavailable", 503, 120_000));
    expect(callRefreshInterval(config)).toBe(120_000);

    config.onSuccess?.();
    expect(callRefreshInterval(config)).toBe(30_000);
  });

  it("stays off without a versionId", () => {
    renderHook(() => useChatReadiness("chat_1", null));
    expect(callRefreshInterval(lastConfig())).toBe(0);
  });

  // SWR skips interval-driven revalidation while the cache holds an error, so
  // the retry lane is where the pacing after a degraded 503 actually happens.
  // Without an own `onErrorRetry` the whole A2 backoff would be dead code for
  // this hook.
  it("retries through its own error lane, never faster than Retry-After", () => {
    vi.useFakeTimers();
    renderHook(() => useChatReadiness("chat_1", "ver_1"));
    const config = lastConfig();
    const revalidate = vi.fn();

    config.onErrorRetry?.(
      new PollFetchError("db unavailable", 503, 30_000),
      "/readiness",
      {},
      revalidate,
      { retryCount: 1 },
    );

    // SWR's own lane would have retried after 2.5–7.5s; the server asked for 30s.
    vi.advanceTimersByTime(29_000);
    expect(revalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(revalidate).toHaveBeenCalledWith({ retryCount: 1 });

    vi.useRealTimers();
  });

  it("stops retrying at an explicit errorRetryCount cap", () => {
    vi.useFakeTimers();
    renderHook(() => useChatReadiness("chat_1", "ver_1"));
    const revalidate = vi.fn();

    lastConfig().onErrorRetry?.(new Error("network"), "/readiness", { errorRetryCount: 2 }, revalidate, {
      retryCount: 3,
    });

    vi.advanceTimersByTime(10 * 60_000);
    expect(revalidate).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});

describe("useVersions — SWR poll config", () => {
  it("keeps a stable refreshInterval identity across re-renders", () => {
    const { rerender } = renderHook(() => useVersions("chat_1"));
    const first = lastConfig().refreshInterval;

    rerender();
    rerender();

    expect(lastConfig().refreshInterval).toBe(first);
  });

  it("still collapses to 0 for an aborted versionless chat (P0 contract)", () => {
    renderHook(() => useVersions("chat_1"));
    const config = lastConfig();

    expect(
      callRefreshInterval(config, {
        chatStatus: { status: "aborted", statusReason: null, hasVersion: false, updatedAt: null },
      }),
    ).toBe(0);
    expect(
      callRefreshInterval(config, {
        chatStatus: { status: "in_progress", statusReason: null, hasVersion: false, updatedAt: null },
      }),
    ).toBe(60_000);
  });

  it("backs off after consecutive failures", () => {
    renderHook(() => useVersions("chat_1", { idleRefreshIntervalMs: 10_000 }));
    const config = lastConfig();

    expect(callRefreshInterval(config, undefined)).toBe(10_000);

    config.onError?.(new Error("network"));
    config.onError?.(new Error("network"));
    expect(callRefreshInterval(config, undefined)).toBeGreaterThanOrEqual(20_000);

    config.onSuccess?.();
    expect(callRefreshInterval(config, undefined)).toBe(10_000);
  });
});
