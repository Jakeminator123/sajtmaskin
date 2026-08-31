import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  onSuccess?: (latest?: unknown) => void;
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
const {
  useVersions,
  VERSIONS_ACTIVITY_BURST_INTERVAL_MS,
  VERSIONS_ACTIVITY_BURST_WINDOW_MS,
} = await import("./useVersions");
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

afterEach(() => {
  // Drop any per-test `visibilityState` stub so the jsdom default returns.
  Reflect.deleteProperty(document, "visibilityState");
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

  // The retry lane has no visibility gate of its own — neither does SWR's
  // default — and `revalidateOnFocus: false` means nothing would wake it back
  // up either. A hidden builder must park, not keep hitting a starved DB.
  it("parks the retry while the tab is hidden and resumes when it returns", () => {
    vi.useFakeTimers();
    let visibility: DocumentVisibilityState = "hidden";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });

    renderHook(() => useChatReadiness("chat_1", "ver_1"));
    const revalidate = vi.fn();

    lastConfig().onErrorRetry?.(
      new PollFetchError("db unavailable", 503, 3_000),
      "/readiness",
      {},
      revalidate,
      { retryCount: 1 },
    );

    vi.advanceTimersByTime(10 * 60_000);
    expect(revalidate).not.toHaveBeenCalled();

    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(revalidate).toHaveBeenCalledWith({ retryCount: 1 });

    visibility = "visible";
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

  // Aktivitets-burst (prod 2026-08-31): konvergensen får inte bero på att
  // versions-panelen råkar vara öppen. Efter ett radbyte eller en avslutad
  // generering pollas snabbt i ett begränsat fönster, sedan viloläge igen.
  it("burstar cadensen efter ett radbyte och återgår när fönstret stängts", () => {
    vi.useFakeTimers();
    try {
      renderHook(() => useVersions("chat_1"));
      const config = lastConfig();

      const pendingPayload = {
        versions: [{ id: "ver_1", verificationState: "pending", releaseState: "draft" }],
      };
      const promotedPayload = {
        versions: [{ id: "ver_1", verificationState: "passed", releaseState: "promoted" }],
      };

      // Första hämtningen sätter bara baslinjen — en nyöppnad gammal chatt
      // ska inte bursta på historik.
      config.onSuccess?.(pendingPayload);
      expect(callRefreshInterval(config, pendingPayload)).toBe(60_000);

      // Radbyte (pending → promoted) öppnar fönstret.
      config.onSuccess?.(promotedPayload);
      expect(callRefreshInterval(config, promotedPayload)).toBe(
        VERSIONS_ACTIVITY_BURST_INTERVAL_MS,
      );

      // Stängt fönster: tillbaka till viloläge.
      vi.advanceTimersByTime(VERSIONS_ACTIVITY_BURST_WINDOW_MS + 1_000);
      expect(callRefreshInterval(config, promotedPayload)).toBe(60_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("öppnar burstfönstret när genereringen avslutas", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = renderHook(
        ({ generating }: { generating: boolean }) =>
          useVersions("chat_1", { isGenerating: generating }),
        { initialProps: { generating: true } },
      );

      rerender({ generating: false });
      expect(callRefreshInterval(lastConfig(), undefined)).toBe(
        VERSIONS_ACTIVITY_BURST_INTERVAL_MS,
      );

      vi.advanceTimersByTime(VERSIONS_ACTIVITY_BURST_WINDOW_MS + 1_000);
      expect(callRefreshInterval(lastConfig(), undefined)).toBe(60_000);
    } finally {
      vi.useRealTimers();
    }
  });
});
