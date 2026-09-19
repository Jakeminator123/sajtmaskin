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
});
