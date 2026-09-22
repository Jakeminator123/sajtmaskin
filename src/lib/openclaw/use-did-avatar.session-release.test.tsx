// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdkMock = vi.hoisted(() => ({
  createAgentManager: vi.fn(),
}));

vi.mock("@d-id/client-sdk", () => sdkMock);

type Callbacks = {
  onStreamCreated?: (value: unknown) => void;
  onSrcObjectReady?: (value: MediaStream) => void;
  onConnectionStateChange?: (state: string) => void;
};

function lastCallbacks(): Callbacks {
  const call = sdkMock.createAgentManager.mock.calls.at(-1);
  return (call?.[1] as { callbacks: Callbacks }).callbacks;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function fakeAgent(overrides: Record<string, unknown> = {}) {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    speak: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function loadHook() {
  vi.resetModules();
  return import("./use-did-avatar");
}

const STREAM_PAYLOAD = {
  stream_id: "strm_abc",
  session_id: "sess_xyz",
  agent_id: "v2_agt_test",
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_AVATAR_AGENT_ID", "v2_agt_test");
  vi.stubEnv("NEXT_PUBLIC_AVATAR_CLIENT_KEY", "client-key");
  vi.stubEnv("NEXT_PUBLIC_AVATAR_ENABLED", "1");
  sdkMock.createAgentManager.mockReset();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("D-ID stream release on unload", () => {
  it("releases the stream with a keepalive DELETE when the page is hidden", async () => {
    const agent = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      speak: vi.fn().mockResolvedValue(undefined),
    };
    sdkMock.createAgentManager.mockResolvedValue(agent);
    const { useDidAvatar } = await loadHook();
    const { result } = renderHook(() => useDidAvatar({ enabled: true }));

    await waitFor(() => expect(result.current.connectionState).toBe("connected"));
    act(() => lastCallbacks().onStreamCreated?.(STREAM_PAYLOAD));

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.d-id.com/agents/v2_agt_test/streams/strm_abc");
    expect(init).toMatchObject({ method: "DELETE", keepalive: true });
    expect(JSON.parse(init.body as string)).toEqual({ session_id: "sess_xyz" });
  });

  it("does not call D-ID when no stream was ever created", async () => {
    const agent = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      speak: vi.fn().mockResolvedValue(undefined),
    };
    sdkMock.createAgentManager.mockResolvedValue(agent);
    const { useDidAvatar } = await loadHook();
    const { result } = renderHook(() => useDidAvatar({ enabled: true }));

    await waitFor(() => expect(result.current.connectionState).toBe("connected"));
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("stops listening for unload once the hook unmounts", async () => {
    const agent = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      speak: vi.fn().mockResolvedValue(undefined),
    };
    sdkMock.createAgentManager.mockResolvedValue(agent);
    const { useDidAvatar } = await loadHook();
    const { result, unmount } = renderHook(() => useDidAvatar({ enabled: true }));

    await waitFor(() => expect(result.current.connectionState).toBe("connected"));
    act(() => lastCallbacks().onStreamCreated?.(STREAM_PAYLOAD));
    unmount();

    const callsAfterUnmount = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      callsAfterUnmount,
    );
  });
});

describe("D-ID connect deadline", () => {
  it("fails to error when the stream never arrives, instead of spinning forever", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Ansluter men levererar aldrig någon MediaStream — det är precis vad ett
    // fullt D-ID-konto (403 Max user sessions reached) ser ut som i UI:t.
    const agent = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      speak: vi.fn().mockResolvedValue(undefined),
    };
    sdkMock.createAgentManager.mockResolvedValue(agent);
    const { useDidAvatar, DID_CONNECT_TIMEOUT_MS } = await loadHook();
    const { result } = renderHook(() => useDidAvatar({ enabled: true }));

    await waitFor(() => expect(result.current.connectionState).toBe("connected"));
    expect(result.current.avatarReady).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DID_CONNECT_TIMEOUT_MS + 10);
    });

    expect(result.current.connectionState).toBe("error");
    expect(result.current.avatarReady).toBe(false);
    expect(agent.disconnect).toHaveBeenCalled();
  });

  it("keeps a healthy connection alive past the deadline", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const agent = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      speak: vi.fn().mockResolvedValue(undefined),
    };
    sdkMock.createAgentManager.mockResolvedValue(agent);
    const { useDidAvatar, DID_CONNECT_TIMEOUT_MS } = await loadHook();
    const { result } = renderHook(() => useDidAvatar({ enabled: true }));

    await waitFor(() => expect(result.current.connectionState).toBe("connected"));
    act(() => lastCallbacks().onSrcObjectReady?.({} as MediaStream));
    expect(result.current.avatarReady).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DID_CONNECT_TIMEOUT_MS + 10);
    });

    expect(result.current.connectionState).toBe("connected");
    expect(result.current.avatarReady).toBe(true);
    expect(agent.disconnect).not.toHaveBeenCalled();
  });

  // `OpenClawChatPanel` talar så snart tillståndet är `connected` — den kräver
  // inte `avatarReady`. Ett textsvar som hinner före deadlinen fick tidigare
  // timern att returnera på `speaking`, och eftersom timern redan var förbrukad
  // blev spinnern evig igen. Deadlinen ska styras av strömmen, inte av tal.
  it("fails the deadline even when a reply starts speaking before the stream arrives", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const agent = fakeAgent();
    sdkMock.createAgentManager.mockResolvedValue(agent);
    const { useDidAvatar, DID_CONNECT_TIMEOUT_MS } = await loadHook();
    const { result } = renderHook(() => useDidAvatar({ enabled: true }));

    await waitFor(() => expect(result.current.connectionState).toBe("connected"));
    expect(result.current.avatarReady).toBe(false);

    await act(async () => {
      await result.current.speak("Hej, jag svarar redan innan videon finns.");
    });
    expect(result.current.connectionState).toBe("speaking");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DID_CONNECT_TIMEOUT_MS + 10);
    });

    expect(result.current.connectionState).toBe("error");
    expect(result.current.avatarReady).toBe(false);
    expect(agent.disconnect).toHaveBeenCalled();
  });

  it("does not let a late connect() resolve write connected over the deadline", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const connecting = deferred<void>();
    const agent = fakeAgent({ connect: vi.fn().mockReturnValue(connecting.promise) });
    sdkMock.createAgentManager.mockResolvedValue(agent);
    const { useDidAvatar, DID_CONNECT_TIMEOUT_MS } = await loadHook();
    const { result } = renderHook(() => useDidAvatar({ enabled: true }));

    await waitFor(() => expect(result.current.connectionState).toBe("connecting"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DID_CONNECT_TIMEOUT_MS + 10);
    });
    expect(result.current.connectionState).toBe("error");

    await act(async () => {
      connecting.resolve();
      await connecting.promise;
    });

    expect(result.current.connectionState).toBe("error");
    expect(result.current.avatarReady).toBe(false);
  });

  it("waits for the deadline's disconnect before a retry requests a new stream", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const releasing = deferred<void>();
    const stalled = fakeAgent({ disconnect: vi.fn().mockReturnValue(releasing.promise) });
    const fresh = fakeAgent();
    sdkMock.createAgentManager
      .mockResolvedValueOnce(stalled)
      .mockResolvedValueOnce(fresh);
    const { useDidAvatar, DID_CONNECT_TIMEOUT_MS } = await loadHook();
    const { result } = renderHook(() => useDidAvatar({ enabled: true }));

    await waitFor(() => expect(result.current.connectionState).toBe("connected"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DID_CONNECT_TIMEOUT_MS + 10);
    });
    await waitFor(() => expect(stalled.disconnect).toHaveBeenCalledTimes(1));

    let retry!: Promise<void>;
    act(() => {
      retry = result.current.reconnect();
    });
    // Den gamla platsen är ännu inte tillbaka — ingen ny session får begäras.
    await act(async () => {
      await Promise.resolve();
    });
    expect(sdkMock.createAgentManager).toHaveBeenCalledTimes(1);

    await act(async () => {
      releasing.resolve();
      await retry;
    });

    expect(sdkMock.createAgentManager).toHaveBeenCalledTimes(2);
    expect(fresh.connect).toHaveBeenCalledTimes(1);
  });
});
