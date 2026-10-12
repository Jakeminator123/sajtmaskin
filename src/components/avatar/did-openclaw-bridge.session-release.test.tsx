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
