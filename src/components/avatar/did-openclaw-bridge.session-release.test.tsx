// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdkMock = vi.hoisted(() => ({
  createAgentManager: vi.fn(),
}));

vi.mock("@d-id/client-sdk", () => sdkMock);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function fakeAgent(overrides: Record<string, unknown> = {}) {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    speak: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function loadBridge() {
  vi.resetModules();
  const mod = await import("./did-openclaw-bridge");
  return mod.DidOpenClawBridge;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_AVATAR_AGENT_ID", "v2_agt_test");
  vi.stubEnv("NEXT_PUBLIC_AVATAR_CLIENT_KEY", "client-key");
  vi.stubEnv("NEXT_PUBLIC_AVATAR_ENABLED", "1");
  sdkMock.createAgentManager.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "Hej från OpenClaw" }),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("DidOpenClawBridge speak fence after deadline", () => {
  it("keeps offline when a stale speak() rejects after the deadline, so retry can connect again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const speaking = deferred<void>();
    const stalled = fakeAgent({
      speak: vi.fn().mockReturnValue(speaking.promise),
    });
    const fresh = fakeAgent();
    sdkMock.createAgentManager.mockResolvedValueOnce(stalled).mockResolvedValueOnce(fresh);

    const DidOpenClawBridge = await loadBridge();
    const { DID_CONNECT_TIMEOUT_MS } = await import("@/lib/openclaw/use-did-avatar");
    render(<DidOpenClawBridge />);

    const statusText = () => screen.getByTestId("avatar-bridge-status").textContent ?? "";

    fireEvent.click(screen.getByTestId("avatar-bridge-connect"));
    await waitFor(() => expect(statusText()).toContain("Ansluten"));
    expect(screen.getByText("Förbered D-ID-klienten...")).toBeTruthy();

    fireEvent.change(screen.getByTestId("avatar-bridge-input"), {
      target: { value: "hej" },
    });
    fireEvent.click(screen.getByTestId("avatar-bridge-send"));
    await waitFor(() => expect(stalled.speak).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(statusText()).toContain("Talar"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DID_CONNECT_TIMEOUT_MS + 10);
    });
    expect(statusText()).toContain("Sajtagenten offline");
    expect(stalled.disconnect).toHaveBeenCalledTimes(1);

    await act(async () => {
      speaking.reject(new Error("session released"));
      await speaking.promise.catch(() => {});
    });

    expect(statusText()).toContain("Sajtagenten offline");

    fireEvent.click(screen.getByTestId("avatar-bridge-connect"));
    await waitFor(() => expect(sdkMock.createAgentManager).toHaveBeenCalledTimes(2));
    expect(fresh.connect).toHaveBeenCalledTimes(1);
  });

  it("blocks another stream while SDK connect is pending and releases late stream IDs", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const connecting = deferred<void>();
    const stale = fakeAgent({ connect: vi.fn().mockReturnValue(connecting.promise) });
    sdkMock.createAgentManager.mockResolvedValue(stale);
    const DidOpenClawBridge = await loadBridge();
    const { DID_CONNECT_TIMEOUT_MS } = await import("@/lib/openclaw/use-did-avatar");
    render(<DidOpenClawBridge />);

    fireEvent.click(screen.getByTestId("avatar-bridge-connect"));
    await waitFor(() => expect(stale.connect).toHaveBeenCalledTimes(1));
    const callbacks = sdkMock.createAgentManager.mock.calls[0]![1].callbacks;
    act(() => callbacks.onStreamCreated({
      stream_id: "strm_abc", session_id: "sess_xyz", agent_id: "v2_agt_test",
    }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DID_CONNECT_TIMEOUT_MS + 10);
    });
    const button = screen.getByTestId("avatar-bridge-connect");
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(button);
    expect(sdkMock.createAgentManager).toHaveBeenCalledTimes(1);

    act(() => callbacks.onStreamCreated({
      stream_id: "strm_late", session_id: "sess_late", agent_id: "v2_agt_test",
    }));
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    await act(async () => { connecting.reject(new Error("SDK init failed")); });
    act(() => callbacks.onStreamCreated({
      stream_id: "strm_after_reject", session_id: "sess_after_reject", agent_id: "v2_agt_test",
    }));
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[2]![0]).toBe(
      "https://api.d-id.com/agents/v2_agt_test/streams/strm_after_reject",
    );
    expect(sdkMock.createAgentManager).toHaveBeenCalledTimes(1);
  });

  it("keeps its own new stream when it reconnects after an established connection drops", async () => {
    const first = fakeAgent();
    const second = fakeAgent();
    sdkMock.createAgentManager.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const DidOpenClawBridge = await loadBridge();
    render(<DidOpenClawBridge />);
    const statusText = () => screen.getByTestId("avatar-bridge-status").textContent ?? "";

    fireEvent.click(screen.getByTestId("avatar-bridge-connect"));
    await waitFor(() => expect(first.connect).toHaveBeenCalledTimes(1));
    const firstCallbacks = sdkMock.createAgentManager.mock.calls[0]![1].callbacks;
    act(() => firstCallbacks.onSrcObjectReady({} as MediaStream));
    act(() => firstCallbacks.onStreamCreated({
      stream_id: "strm_first", session_id: "sess_first", agent_id: "v2_agt_test",
    }));
    act(() => firstCallbacks.onConnectionStateChange("disconnected"));
    await waitFor(() => expect(statusText()).not.toContain("Ansluten"));

    fireEvent.click(screen.getByTestId("avatar-bridge-connect"));
    await waitFor(() => expect(sdkMock.createAgentManager).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(second.connect).toHaveBeenCalledTimes(1));
    expect(first.disconnect).toHaveBeenCalled();
    // The previous session's stream is released and no longer counts as the new connection's video.
    await waitFor(() => expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      .some((call) => String(call[0]).endsWith("/streams/strm_first"))).toBe(true));
    expect(screen.getByText("Förbered D-ID-klienten...")).toBeTruthy();

    const secondCallbacks = sdkMock.createAgentManager.mock.calls[1]![1].callbacks;
    act(() => secondCallbacks.onStreamCreated({
      stream_id: "strm_second", session_id: "sess_second", agent_id: "v2_agt_test",
    }));
    const releasedUrls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map((call) => String(call[0]));
    expect(releasedUrls.some((url) => url.endsWith("/streams/strm_second"))).toBe(false);
    act(() => secondCallbacks.onConnectionStateChange("connected"));
    await waitFor(() => expect(statusText()).toContain("Ansluten"));
  });

  it("starts a fresh session when pageshow restores a released stream from bfcache", async () => {
    const agent = fakeAgent();
    sdkMock.createAgentManager.mockResolvedValue(agent);
    const DidOpenClawBridge = await loadBridge();
    render(<DidOpenClawBridge />);

    fireEvent.click(screen.getByTestId("avatar-bridge-connect"));
    await waitFor(() => expect(agent.connect).toHaveBeenCalledTimes(1));
    const callbacks = sdkMock.createAgentManager.mock.calls[0]![1].callbacks;
    act(() => callbacks.onSrcObjectReady({} as MediaStream));
    await waitFor(() => expect(screen.queryByText("Förbered D-ID-klienten...")).toBeNull());

    act(() => callbacks.onStreamCreated({
      stream_id: "strm_abc", session_id: "sess_xyz", agent_id: "v2_agt_test",
    }));
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    const show = new Event("pageshow");
    Object.defineProperty(show, "persisted", { value: true });
    await act(async () => {
      window.dispatchEvent(show);
    });

    expect(screen.getByText("Förbered D-ID-klienten...")).toBeTruthy();
    await waitFor(() => expect(sdkMock.createAgentManager).toHaveBeenCalledTimes(2));
    const callsAfterRestart = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterRestart);
  });

  it("starts a new session after the release timeout when bfcache restores a hanging pagehide", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const agent = fakeAgent();
    const next = fakeAgent();
    sdkMock.createAgentManager.mockResolvedValueOnce(agent).mockResolvedValueOnce(next);
    const DidOpenClawBridge = await loadBridge();
    const { DID_STREAM_RELEASE_TIMEOUT_MS } = await import("@/lib/openclaw/did-stream-release");
    render(<DidOpenClawBridge />);

    fireEvent.click(screen.getByTestId("avatar-bridge-connect"));
    await waitFor(() => expect(agent.connect).toHaveBeenCalledTimes(1));
    const callbacks = sdkMock.createAgentManager.mock.calls[0]![1].callbacks;
    act(() => callbacks.onStreamCreated({
      stream_id: "strm_abc", session_id: "sess_xyz", agent_id: "v2_agt_test",
    }));
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}));

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    const show = new Event("pageshow");
    Object.defineProperty(show, "persisted", { value: true });
    act(() => {
      window.dispatchEvent(show);
    });
    expect(sdkMock.createAgentManager).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DID_STREAM_RELEASE_TIMEOUT_MS);
    });

    await waitFor(() => expect(sdkMock.createAgentManager).toHaveBeenCalledTimes(2));
    expect(next.connect).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("avatar-bridge-status").textContent).toContain("Ansluten");
  });

  it("enters error when bfcache restart cannot connect after a hanging release", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const agent = fakeAgent();
    const retry = fakeAgent();
    sdkMock.createAgentManager
      .mockResolvedValueOnce(agent)
      .mockRejectedValueOnce(new Error("sdk down"))
      .mockResolvedValueOnce(retry);
    const DidOpenClawBridge = await loadBridge();
    const { DID_STREAM_RELEASE_TIMEOUT_MS } = await import("@/lib/openclaw/did-stream-release");
    render(<DidOpenClawBridge />);

    fireEvent.click(screen.getByTestId("avatar-bridge-connect"));
    await waitFor(() => expect(agent.connect).toHaveBeenCalledTimes(1));
    const callbacks = sdkMock.createAgentManager.mock.calls[0]![1].callbacks;
    act(() => callbacks.onStreamCreated({
      stream_id: "strm_abc", session_id: "sess_xyz", agent_id: "v2_agt_test",
    }));
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}));

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    const show = new Event("pageshow");
    Object.defineProperty(show, "persisted", { value: true });
    act(() => {
      window.dispatchEvent(show);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DID_STREAM_RELEASE_TIMEOUT_MS);
    });

    await waitFor(() => expect(screen.getByTestId("avatar-bridge-status").textContent).toContain("Fel"));
    const button = screen.getByTestId("avatar-bridge-connect");
    expect(button.hasAttribute("disabled")).toBe(false);

    fireEvent.click(button);
    await waitFor(() => expect(sdkMock.createAgentManager).toHaveBeenCalledTimes(3));
    expect(retry.connect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("avatar-bridge-status").textContent).toContain("Ansluten"));
  });

  it("does not start a second session while the first connect is still in flight", async () => {
    const created = deferred<ReturnType<typeof fakeAgent>>();
    const agent = fakeAgent();
    sdkMock.createAgentManager.mockReturnValue(created.promise.then(() => agent));
    const DidOpenClawBridge = await loadBridge();
    render(<DidOpenClawBridge />);

    fireEvent.click(screen.getByTestId("avatar-bridge-connect"));
    await waitFor(() => expect(sdkMock.createAgentManager).toHaveBeenCalledTimes(1));
    const button = screen.getByTestId("avatar-bridge-connect");
    expect(screen.getByTestId("avatar-bridge-status").textContent).toContain("Ansluter");
    expect(button.hasAttribute("disabled")).toBe(true);

    fireEvent.click(button);
    fireEvent.change(screen.getByTestId("avatar-bridge-input"), { target: { value: "hej" } });
    fireEvent.click(screen.getByTestId("avatar-bridge-send"));
    expect(sdkMock.createAgentManager).toHaveBeenCalledTimes(1);

    await act(async () => {
      created.resolve(agent);
      await created.promise;
    });
    await waitFor(() => expect(agent.connect).toHaveBeenCalledTimes(1));
    expect(sdkMock.createAgentManager).toHaveBeenCalledTimes(1);
  });

  it("releases a stream created after pagehide and ignores the stale connect", async () => {
    const created = deferred<ReturnType<typeof fakeAgent>>();
    const agent = fakeAgent();
    let callbacks: { onStreamCreated: (value: unknown) => void } | null = null;
    sdkMock.createAgentManager.mockImplementation((_agentId, options) => {
      callbacks = options.callbacks;
      return created.promise.then(() => agent);
    });
    const DidOpenClawBridge = await loadBridge();
    render(<DidOpenClawBridge />);
    fireEvent.click(screen.getByTestId("avatar-bridge-connect"));
    await waitFor(() => expect(callbacks).toBeTruthy());

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    act(() => callbacks?.onStreamCreated({
      stream_id: "strm_late",
      session_id: "sess_late",
      agent_id: "v2_agt_test",
    }));

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/streams/strm_late"))).toBe(true);

    await act(async () => {
      created.resolve(agent);
      await created.promise;
    });
    await waitFor(() => expect(agent.disconnect).toHaveBeenCalled());
    expect(agent.connect).not.toHaveBeenCalled();
    expect(screen.getByTestId("avatar-bridge-status").textContent).not.toContain("Ansluten");
  });

  it("releases the first stream when SDK retries before the deadline", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const connecting = deferred<void>();
    const agent = fakeAgent({ connect: vi.fn().mockReturnValue(connecting.promise) });
    sdkMock.createAgentManager.mockResolvedValue(agent);
    const DidOpenClawBridge = await loadBridge();
    const { DID_CONNECT_TIMEOUT_MS } = await import("@/lib/openclaw/use-did-avatar");
    render(<DidOpenClawBridge />);
    fireEvent.click(screen.getByTestId("avatar-bridge-connect"));
    await waitFor(() => expect(agent.connect).toHaveBeenCalledTimes(1));
    const callbacks = sdkMock.createAgentManager.mock.calls[0]![1].callbacks;

    act(() => callbacks.onStreamCreated({
      stream_id: "strm_abc", session_id: "sess_xyz", agent_id: "v2_agt_test",
    }));
    act(() => callbacks.onStreamCreated({
      stream_id: "strm_second", session_id: "sess_second", agent_id: "v2_agt_test",
    }));
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toContain("/streams/strm_abc");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DID_CONNECT_TIMEOUT_MS + 10);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toContain("/streams/strm_second");
    expect(screen.getByTestId("avatar-bridge-connect").hasAttribute("disabled")).toBe(true);
  });

  it("does not retry SDK connect after an early failed callback", async () => {
    const connecting = deferred<void>();
    const agent = fakeAgent({ connect: vi.fn().mockReturnValue(connecting.promise) });
    sdkMock.createAgentManager.mockResolvedValue(agent);
    const DidOpenClawBridge = await loadBridge();
    render(<DidOpenClawBridge />);
    fireEvent.click(screen.getByTestId("avatar-bridge-connect"));
    await waitFor(() => expect(agent.connect).toHaveBeenCalledTimes(1));
    const callbacks = sdkMock.createAgentManager.mock.calls[0]![1].callbacks;

    act(() => callbacks.onConnectionStateChange("failed"));
    expect(screen.getByTestId("avatar-bridge-status").textContent).toContain("Ansluter");
    fireEvent.click(screen.getByTestId("avatar-bridge-connect"));
    expect(agent.connect).toHaveBeenCalledTimes(1);
    expect(sdkMock.createAgentManager).toHaveBeenCalledTimes(1);
  });

  it("keeps the deadline after disconnected while SDK connect is still pending", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const connecting = deferred<void>();
    const agent = fakeAgent({ connect: vi.fn().mockReturnValue(connecting.promise) });
    sdkMock.createAgentManager.mockResolvedValue(agent);
    const DidOpenClawBridge = await loadBridge();
    const { DID_CONNECT_TIMEOUT_MS } = await import("@/lib/openclaw/use-did-avatar");
    render(<DidOpenClawBridge />);
    fireEvent.click(screen.getByTestId("avatar-bridge-connect"));
    await waitFor(() => expect(agent.connect).toHaveBeenCalledTimes(1));
    const callbacks = sdkMock.createAgentManager.mock.calls[0]![1].callbacks;

    act(() => callbacks.onConnectionStateChange("disconnected"));
    expect(screen.getByTestId("avatar-bridge-status").textContent).toContain("Ansluter");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DID_CONNECT_TIMEOUT_MS + 10);
    });
    expect(screen.getByTestId("avatar-bridge-status").textContent).toContain("Sajtagenten offline");
    expect(screen.getByTestId("avatar-bridge-connect").hasAttribute("disabled")).toBe(true);
    expect(agent.connect).toHaveBeenCalledTimes(1);
  });
});
