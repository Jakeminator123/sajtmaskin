// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdkMock = vi.hoisted(() => ({
  createAgentManager: vi.fn(),
}));

vi.mock("@d-id/client-sdk", () => sdkMock);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

async function loadHook() {
  vi.resetModules();
  return import("./use-did-avatar");
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_AVATAR_AGENT_ID", "v2_agt_test");
  vi.stubEnv("NEXT_PUBLIC_AVATAR_CLIENT_KEY", "client-key");
  vi.stubEnv("NEXT_PUBLIC_AVATAR_ENABLED", "1");
  sdkMock.createAgentManager.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("useDidAvatar connection lifecycle", () => {
  it("disconnects an agent created after avatar mode was already disabled", async () => {
    const creation = deferred<{
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      speak: ReturnType<typeof vi.fn>;
    }>();
    const agent = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      speak: vi.fn().mockResolvedValue(undefined),
    };
    sdkMock.createAgentManager.mockReturnValue(creation.promise);
    const { useDidAvatar } = await loadHook();
    const { result, rerender } = renderHook(
      ({ enabled }) => useDidAvatar({ enabled }),
      { initialProps: { enabled: true } },
    );

    await waitFor(() => expect(sdkMock.createAgentManager).toHaveBeenCalledTimes(1));
    rerender({ enabled: false });

    await act(async () => {
      creation.resolve(agent);
      await creation.promise;
    });

    await waitFor(() => expect(agent.disconnect).toHaveBeenCalledTimes(1));
    expect(agent.connect).not.toHaveBeenCalled();
    expect(result.current.connectionState).toBe("idle");
    expect(result.current.avatarReady).toBe(false);
  });

  it("does not restart a retry that was disabled while the old agent disconnected", async () => {
    const disconnecting = deferred<void>();
    const firstAgent = {
      connect: vi.fn().mockRejectedValue(new Error("network")),
      disconnect: vi.fn().mockReturnValue(disconnecting.promise),
      speak: vi.fn().mockResolvedValue(undefined),
    };
    const secondAgent = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      speak: vi.fn().mockResolvedValue(undefined),
    };
    sdkMock.createAgentManager
      .mockResolvedValueOnce(firstAgent)
      .mockResolvedValueOnce(secondAgent);
    const { useDidAvatar } = await loadHook();
    const { result, rerender } = renderHook(
      ({ enabled }) => useDidAvatar({ enabled }),
      { initialProps: { enabled: true } },
    );

    await waitFor(() => expect(result.current.connectionState).toBe("error"));
    let retry!: Promise<void>;
    act(() => {
      retry = result.current.reconnect();
    });
    await waitFor(() => expect(firstAgent.disconnect).toHaveBeenCalledTimes(1));
    rerender({ enabled: false });

    await act(async () => {
      disconnecting.resolve();
      await retry;
    });

    expect(sdkMock.createAgentManager).toHaveBeenCalledTimes(1);
    expect(secondAgent.connect).not.toHaveBeenCalled();
    expect(result.current.connectionState).toBe("idle");
  });
});
