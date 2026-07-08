import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDeploymentHistory } from "./useDeploymentHistory";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useDeploymentHistory", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("sets hydrationFailed after automatic retries are exhausted", async () => {
    globalThis.fetch = vi.fn(async () => json({}, 500)) as unknown as typeof fetch;

    const { result } = renderHook(() => useDeploymentHistory("chat_1"));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.hydrationFailed).toBe(false);

    // Retry #1 after 4s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(result.current.hydrationFailed).toBe(false);

    // Retry #2 after 8s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(result.current.hydrationFailed).toBe(true);
  });

  it("clears hydrationFailed after a manual refetch succeeds", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      return calls < 4 ? json({}, 500) : json({ deployments: [], project: null }, 200);
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useDeploymentHistory("chat_1"));

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(result.current.hydrationFailed).toBe(true);

    await act(async () => {
      result.current.refetch();
      await Promise.resolve();
    });

    expect(result.current.hydrationFailed).toBe(false);
    expect(result.current.deployments).toEqual([]);
  });
});
