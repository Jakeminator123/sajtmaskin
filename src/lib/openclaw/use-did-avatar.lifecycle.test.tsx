// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { StrictMode, useEffect, type ReactNode } from "react";
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
  it("connects after React StrictMode repeats the effect lifecycle", async () => {
    const agent = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      speak: vi.fn().mockResolvedValue(undefined),
    };
    sdkMock.createAgentManager.mockResolvedValue(agent);
    const { useDidAvatar } = await loadHook();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    );
    const { result } = renderHook(() => useDidAvatar({ enabled: true }), { wrapper });

    await waitFor(() => expect(result.current.connectionState).toBe("connected"));
    expect(agent.connect).toHaveBeenCalledTimes(1);
  });

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

type DidCallbacks = {
  onSrcObjectReady: (value: MediaStream) => void;
};

function fakeMediaStream(id: string): MediaStream {
  return { id } as MediaStream;
}

function captureSdkCallbacks() {
  const captured: { current: DidCallbacks | null } = { current: null };
  sdkMock.createAgentManager.mockImplementation(async (_id, options) => {
    captured.current = options.callbacks;
    return {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      speak: vi.fn().mockResolvedValue(undefined),
    };
  });
  return captured;
}

function AvatarVideo({
  ready,
  attachVideo,
  fallback = "empty",
}: {
  ready: boolean;
  attachVideo: (node: HTMLVideoElement | null) => void;
  fallback?: "empty" | "pending";
}) {
  if (!ready) {
    return fallback === "pending" ? (
      <div data-testid="did-avatar-pending" />
    ) : null;
  }
  return <video data-testid="did-avatar-video" ref={attachVideo} />;
}

describe("useDidAvatar video srcObject mount", () => {
  it("assigns srcObject after onSrcObjectReady when <video> mounts later", async () => {
    const callbacks = captureSdkCallbacks();
    const stream = fakeMediaStream("stream-mount");
    const { useDidAvatar } = await loadHook();

    function Harness() {
      const { avatarReady, videoRef: attachVideo } = useDidAvatar({
        enabled: true,
      });
      return (
        <AvatarVideo
          ready={avatarReady}
          attachVideo={attachVideo}
          fallback="pending"
        />
      );
    }

    render(<Harness />);
    await waitFor(() => expect(callbacks.current).toBeTruthy());
    expect(screen.getByTestId("did-avatar-pending")).toBeTruthy();

    act(() => {
      callbacks.current!.onSrcObjectReady(stream);
    });

    const video = await screen.findByTestId("did-avatar-video");
    expect(video).toBeInstanceOf(HTMLVideoElement);
    expect((video as HTMLVideoElement).srcObject).toBe(stream);
  });

  it("replaces srcObject on reconnect after the video remounts", async () => {
    const callbacks = captureSdkCallbacks();
    const first = fakeMediaStream("stream-1");
    const second = fakeMediaStream("stream-2");
    const { useDidAvatar } = await loadHook();
    const reconnectRef = { current: async () => {} };

    function Harness() {
      const { avatarReady, videoRef: attachVideo, reconnect } = useDidAvatar({
        enabled: true,
      });
      useEffect(() => {
        reconnectRef.current = reconnect;
      }, [reconnect]);
      return <AvatarVideo ready={avatarReady} attachVideo={attachVideo} />;
    }

    render(<Harness />);
    await waitFor(() => expect(callbacks.current).toBeTruthy());
    act(() => {
      callbacks.current!.onSrcObjectReady(first);
    });
    expect(
      (await screen.findByTestId("did-avatar-video") as HTMLVideoElement).srcObject,
    ).toBe(first);

    await act(async () => {
      await reconnectRef.current();
    });
    expect(screen.queryByTestId("did-avatar-video")).toBeNull();
    await waitFor(() => expect(callbacks.current).toBeTruthy());

    act(() => {
      callbacks.current!.onSrcObjectReady(second);
    });
    expect(
      (await screen.findByTestId("did-avatar-video") as HTMLVideoElement).srcObject,
    ).toBe(second);
  });

  it("replaces an already-mounted video srcObject when the SDK sends a new stream", async () => {
    const callbacks = captureSdkCallbacks();
    const first = fakeMediaStream("live-1");
    const next = fakeMediaStream("live-2");
    const { useDidAvatar } = await loadHook();

    function Harness() {
      const { avatarReady, videoRef: attachVideo } = useDidAvatar({
        enabled: true,
      });
      return <AvatarVideo ready={avatarReady} attachVideo={attachVideo} />;
    }

    render(<Harness />);
    await waitFor(() => expect(callbacks.current).toBeTruthy());
    act(() => {
      callbacks.current!.onSrcObjectReady(first);
    });
    const video = (await screen.findByTestId(
      "did-avatar-video",
    )) as HTMLVideoElement;
    expect(video.srcObject).toBe(first);

    act(() => {
      callbacks.current!.onSrcObjectReady(next);
    });
    expect(video.srcObject).toBe(next);
  });

  it("does not throw when the same stream is assigned twice", async () => {
    const callbacks = captureSdkCallbacks();
    const stream = fakeMediaStream("stream-stable");
    const { useDidAvatar } = await loadHook();
    const attachVideoRef = { current: undefined as
      | ((node: HTMLVideoElement | null) => void)
      | undefined };

    function Harness() {
      const { avatarReady, videoRef: attachVideo } = useDidAvatar({
        enabled: true,
      });
      useEffect(() => {
        attachVideoRef.current = attachVideo;
      }, [attachVideo]);
      return <AvatarVideo ready={avatarReady} attachVideo={attachVideo} />;
    }

    render(<Harness />);
    await waitFor(() => expect(callbacks.current).toBeTruthy());
    act(() => {
      callbacks.current!.onSrcObjectReady(stream);
    });
    const video = (await screen.findByTestId(
      "did-avatar-video",
    )) as HTMLVideoElement;
    expect(video.srcObject).toBe(stream);

    expect(attachVideoRef.current).toEqual(expect.any(Function));
    expect(() => {
      act(() => {
        attachVideoRef.current!(video);
        attachVideoRef.current!(video);
        callbacks.current!.onSrcObjectReady(stream);
      });
    }).not.toThrow();
    expect(video.srcObject).toBe(stream);
  });
});
