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

  it("exposes the newest deployment as latestFailedDeployment when it is an error (BB#deploy3)", async () => {
    globalThis.fetch = vi.fn(async () =>
      json(
        {
          deployments: [
            { id: "dep_err", status: "error", url: null, inspectorUrl: "https://vercel.com/i" },
            { id: "dep_ok", status: "ready", url: "https://site.vercel.app" },
          ],
          production: { deploymentId: "dep_ok", versionId: "ver_ok" },
          project: null,
        },
        200,
      ),
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useDeploymentHistory("chat_1"));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.latestFailedDeployment?.id).toBe("dep_err");
    // Den äldre ready-raden är fortsatt den "live" publiceringen.
    expect(result.current.liveDeployment?.deploymentId).toBe("dep_ok");
  });

  it("does not resurrect an old error when the newest deployment is ready", async () => {
    globalThis.fetch = vi.fn(async () =>
      json(
        {
          deployments: [
            { id: "dep_ok", status: "ready", url: "https://site.vercel.app" },
            { id: "dep_err", status: "error", url: null },
          ],
          production: { deploymentId: "dep_ok", versionId: "ver_ok" },
          project: null,
        },
        200,
      ),
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useDeploymentHistory("chat_1"));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.latestFailedDeployment).toBeNull();
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

  it("keeps production A after a later preview READY and a failed deploy", async () => {
    globalThis.fetch = vi.fn(async () =>
      json(
        {
          deployments: [
            { id: "dep_c", status: "error", url: null, versionId: "ver_c" },
            {
              id: "dep_b",
              status: "ready",
              url: "https://demo-8fyovx8jc-team.vercel.app",
              versionId: "ver_b",
            },
            { id: "dep_a", status: "ready", url: "https://demo.vercel.app", versionId: "ver_a" },
          ],
          production: { deploymentId: "dep_a", versionId: "ver_a" },
          project: null,
        },
        200,
      ),
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useDeploymentHistory("chat_1"));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.liveDeployment?.deploymentId).toBe("dep_a");
    expect(result.current.liveDeployment?.versionId).toBe("ver_a");
    expect(result.current.latestFailedDeployment?.id).toBe("dep_c");
  });

  it("does not guess the newest READY when production identity is missing", async () => {
    globalThis.fetch = vi.fn(async () =>
      json(
        {
          deployments: [
            { id: "dep_b", status: "ready", url: "https://demo.vercel.app", versionId: "ver_b" },
            { id: "dep_a", status: "ready", url: "https://demo.vercel.app", versionId: "ver_a" },
          ],
          production: null,
          project: null,
        },
        200,
      ),
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useDeploymentHistory("chat_1"));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.liveDeployment).toBeNull();
  });
});
