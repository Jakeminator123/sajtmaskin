import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchPreviewStatus = vi.hoisted(() => vi.fn());

vi.mock("@/lib/builder/preview-session/api", () => ({ fetchPreviewStatus }));

import { usePreviewIframe } from "./usePreviewIframe";
import type { PreviewStatusApiJson } from "@/lib/gen/preview/preview-contract";

const TIER2_URL = "https://vm-test.fly.dev/chat_1";

function status(
  state: PreviewStatusApiJson["status"],
  previewSessionId = "ps_1",
  versionId = "ver_1",
  previewUrl = TIER2_URL,
  lifecycleToken: string | null = "life_1",
): PreviewStatusApiJson {
  return {
    ok: true,
    status: state,
    previewSessionId,
    previewUrl,
    versionId,
    lifecycleToken,
    sessionExpiresAt: null,
  };
}

function makeParams(overrides: Partial<Parameters<typeof usePreviewIframe>[0]> = {}) {
  return {
    previewUrl: TIER2_URL,
    refreshToken: 0,
    chatId: "chat_1",
    versionId: "ver_1",
    activePreviewSessionId: "ps_1",
    activePreviewLifecycleToken: "life_1",
    isOwnEnginePreview: false,
    onPreviewSessionSuspect: vi.fn(),
    reportOwnEngineRenderFailure: vi.fn(),
    iframeRef: { current: null },
    ...overrides,
  };
}

function makeIframeRef(src = TIER2_URL) {
  let currentSrc = src;
  const setSrc = vi.fn((nextSrc: string) => {
    currentSrc = nextSrc;
  });
  const iframe = {
    getAttribute: vi.fn((name: string) => (name === "src" ? currentSrc : null)),
    setAttribute: vi.fn(),
  } as unknown as HTMLIFrameElement;
  Object.defineProperty(iframe, "src", {
    configurable: true,
    get: () => currentSrc,
    set: setSrc,
  });
  return { current: iframe, setSrc };
}

describe("usePreviewIframe — Tier-2 readiness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchPreviewStatus.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps raw external onLoad behavior unchanged", () => {
    const params = makeParams({
      previewUrl: "https://external.example/preview",
      activePreviewSessionId: null,
    });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());

    expect(result.current.iframeLoading).toBe(false);
    expect(fetchPreviewStatus).not.toHaveBeenCalled();
  });

  it("keeps loading while Tier-2 is starting and unlocks only on exact running status", async () => {
    fetchPreviewStatus
      .mockResolvedValueOnce(status("starting"))
      .mockResolvedValueOnce(status("running"));
    const params = makeParams({ iframeRef: makeIframeRef() });
    const { result } = renderHook(() => usePreviewIframe(params));

    await act(async () => {
      result.current.handleIframeLoad();
      await Promise.resolve();
    });
    expect(result.current.iframeLoading).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(4_000);
      await Promise.resolve();
    });

    // A running receipt forces a same-src reload so the host's HTTP-200
    // starting document cannot be revealed before runtime content loads.
    expect(result.current.iframeLoading).toBe(true);
    act(() => result.current.handleIframeLoad());
    expect(result.current.iframeLoading).toBe(false);
    expect(params.onPreviewSessionSuspect).not.toHaveBeenCalled();
  });

  it("starts the gate when version and session metadata arrive after the iframe loaded", async () => {
    fetchPreviewStatus.mockResolvedValue(status("running"));
    const iframeRef = makeIframeRef();
    const initialParams = makeParams({
      versionId: null,
      activePreviewSessionId: null,
      iframeRef,
    });
    const { result, rerender } = renderHook((params) => usePreviewIframe(params), {
      initialProps: initialParams,
    });

    act(() => result.current.handleIframeLoad());
    expect(fetchPreviewStatus).not.toHaveBeenCalled();

    await act(async () => {
      rerender(makeParams({ activePreviewSessionId: "ps_1", iframeRef }));
      await Promise.resolve();
    });

    expect(fetchPreviewStatus).toHaveBeenCalledTimes(1);
    expect(result.current.iframeLoading).toBe(true);
    act(() => result.current.handleIframeLoad());
    expect(result.current.iframeLoading).toBe(false);
  });

  it("ignores and aborts a stale status response after session identity changes", async () => {
    let resolveFirst: ((value: PreviewStatusApiJson) => void) | undefined;
    fetchPreviewStatus.mockReturnValueOnce(
      new Promise<PreviewStatusApiJson>((resolve) => {
        resolveFirst = resolve;
      }),
    );
    const firstParams = makeParams();
    const { result, rerender } = renderHook((params) => usePreviewIframe(params), {
      initialProps: firstParams,
    });

    act(() => result.current.handleIframeLoad());
    const firstSignal = fetchPreviewStatus.mock.calls[0]?.[0]?.signal as AbortSignal;

    rerender(makeParams({ activePreviewSessionId: "ps_2" }));
    expect(firstSignal.aborted).toBe(true);

    await act(async () => {
      resolveFirst?.(status("running", "ps_1"));
      await Promise.resolve();
    });

    expect(result.current.iframeLoading).toBe(true);
  });

  it("aborts lifecycle N status and cannot reload lifecycle N+1 from its late result", async () => {
    let resolveLifecycleN: ((value: PreviewStatusApiJson) => void) | undefined;
    fetchPreviewStatus
      .mockReturnValueOnce(
        new Promise<PreviewStatusApiJson>((resolve) => {
          resolveLifecycleN = resolve;
        }),
      )
      .mockReturnValueOnce(new Promise(() => {}));
    const iframeRef = makeIframeRef();
    const initialParams = makeParams({
      activePreviewLifecycleToken: "life_N",
      iframeRef,
    });
    const { result, rerender } = renderHook((params) => usePreviewIframe(params), {
      initialProps: initialParams,
    });

    act(() => result.current.handleIframeLoad());
    const lifecycleNSignal = fetchPreviewStatus.mock.calls[0]?.[0]?.signal as AbortSignal;

    rerender({ ...initialParams, activePreviewLifecycleToken: "life_N1" });

    expect(lifecycleNSignal.aborted).toBe(true);
    expect(fetchPreviewStatus).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveLifecycleN?.(status("running", "ps_1", "ver_1", TIER2_URL, "life_N"));
      await Promise.resolve();
    });

    expect(iframeRef.setSrc).not.toHaveBeenCalled();
    expect(result.current.iframeLoading).toBe(true);
  });

  it("does not settle a lifecycle N ready-reload onLoad after lifecycle N+1 becomes active", async () => {
    fetchPreviewStatus
      .mockResolvedValueOnce(status("running", "ps_1", "ver_1", TIER2_URL, "life_N"))
      .mockReturnValue(new Promise(() => {}));
    const iframeRef = makeIframeRef();
    const initialParams = makeParams({
      activePreviewLifecycleToken: "life_N",
      iframeRef,
    });
    const { result, rerender } = renderHook((params) => usePreviewIframe(params), {
      initialProps: initialParams,
    });

    await act(async () => {
      result.current.handleIframeLoad();
      await Promise.resolve();
    });
    expect(iframeRef.setSrc).toHaveBeenCalledTimes(1);

    rerender({ ...initialParams, activePreviewLifecycleToken: "life_N1" });
    act(() => result.current.handleIframeLoad());

    expect(result.current.iframeLoading).toBe(true);
    expect(result.current.iframeError).toBe(false);
  });

  it("waits for lifecycle hydration and accepts explicit null for a legacy session", async () => {
    fetchPreviewStatus.mockResolvedValue(
      status("running", "ps_1", "ver_1", TIER2_URL, null),
    );
    const iframeRef = makeIframeRef();
    const initialParams = makeParams({
      activePreviewLifecycleToken: undefined,
      iframeRef,
    });
    const { result, rerender } = renderHook((params) => usePreviewIframe(params), {
      initialProps: initialParams,
    });

    act(() => result.current.handleIframeLoad());
    expect(fetchPreviewStatus).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ ...initialParams, activePreviewLifecycleToken: null });
      await Promise.resolve();
    });

    expect(fetchPreviewStatus).toHaveBeenCalledTimes(1);
    expect(iframeRef.setSrc).toHaveBeenCalledTimes(1);
    expect(result.current.iframeLoading).toBe(true);

    act(() => result.current.handleIframeLoad());
    expect(result.current.iframeLoading).toBe(false);
  });

  it("honors the 90s boot grace and fails closed after the Tier-2 readiness timeout", async () => {
    fetchPreviewStatus
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce(status("build_error"));
    const params = makeParams();
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    const signal = fetchPreviewStatus.mock.calls[0]?.[0]?.signal as AbortSignal;
    act(() => vi.advanceTimersByTime(90_000));

    expect(result.current.iframeLoading).toBe(true);
    expect(result.current.iframeError).toBe(false);
    expect(signal.aborted).toBe(false);
    expect(params.onPreviewSessionSuspect).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(8_000));

    expect(result.current.iframeLoading).toBe(false);
    expect(result.current.iframeError).toBe(true);
    expect(result.current.iframeDiagnosticCode).toBe("preview_ready_timeout");
    expect(signal.aborted).toBe(true);
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);

    const callsAtTimeout = fetchPreviewStatus.mock.calls.length;
    act(() => result.current.handleIframeLoad());
    await act(async () => {
      vi.advanceTimersByTime(4_000);
      await Promise.resolve();
    });
    expect(fetchPreviewStatus).toHaveBeenCalledTimes(callsAtTimeout + 1);

    await act(async () => {
      vi.advanceTimersByTime(8_000);
      await Promise.resolve();
    });
    expect(fetchPreviewStatus).toHaveBeenCalledTimes(callsAtTimeout + 1);
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);
  });

  it("late-recovers the same Tier-2 identity through a verified same-src reload", async () => {
    fetchPreviewStatus
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce(status("starting"))
      .mockResolvedValueOnce(status("running"));
    const decoratedSrc = `${TIER2_URL}/boka?__sm_viewer=viewer_1`;
    const iframeRef = makeIframeRef(decoratedSrc);
    const params = makeParams({ previewUrl: `${TIER2_URL}/boka`, iframeRef });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    act(() => vi.advanceTimersByTime(98_000));

    expect(result.current.iframeError).toBe(true);
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(4_000);
      await Promise.resolve();
    });

    expect(fetchPreviewStatus).toHaveBeenCalledTimes(2);
    expect(iframeRef.setSrc).not.toHaveBeenCalled();
    expect(result.current.iframeLoading).toBe(false);
    expect(result.current.iframeError).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(4_000);
      await Promise.resolve();
    });

    expect(fetchPreviewStatus).toHaveBeenCalledTimes(3);
    expect(iframeRef.setSrc).toHaveBeenCalledTimes(1);
    expect(iframeRef.setSrc).toHaveBeenCalledWith(decoratedSrc);
    expect(result.current.iframeLoading).toBe(true);
    expect(result.current.iframeError).toBe(false);

    act(() => result.current.handleIframeLoad());

    expect(result.current.iframeLoading).toBe(false);
    expect(result.current.iframeError).toBe(false);
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);
  });

  it("stops the read-only late-recovery window after 30 seconds", async () => {
    fetchPreviewStatus
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValue(status("starting"));
    const iframeRef = makeIframeRef();
    const params = makeParams({ iframeRef });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    act(() => vi.advanceTimersByTime(98_000));

    for (let index = 0; index < 7; index += 1) {
      await act(async () => {
        vi.advanceTimersByTime(4_000);
        await Promise.resolve();
      });
    }

    expect(fetchPreviewStatus).toHaveBeenCalledTimes(8);
    expect(result.current.iframeLoading).toBe(false);
    expect(result.current.iframeError).toBe(true);
    expect(iframeRef.setSrc).not.toHaveBeenCalled();
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(22_000);
      await Promise.resolve();
    });

    expect(fetchPreviewStatus).toHaveBeenCalledTimes(8);
    expect(iframeRef.setSrc).not.toHaveBeenCalled();
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["session", status("running", "ps_stale")],
    ["version", status("running", "ps_1", "ver_stale")],
    ["URL", status("running", "ps_1", "ver_1", "https://vm-other.fly.dev/chat_1")],
    ["chat path", status("running", "ps_1", "ver_1", "https://vm-test.fly.dev/chat_2")],
    [
      "lifecycle",
      status("running", "ps_1", "ver_1", TIER2_URL, "life_stale"),
    ],
  ])("rejects a late running receipt with mismatched %s", async (_label, lateStatus) => {
    fetchPreviewStatus
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce(lateStatus);
    const iframeRef = makeIframeRef();
    const params = makeParams({ iframeRef });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    act(() => vi.advanceTimersByTime(98_000));
    await act(async () => {
      vi.advanceTimersByTime(4_000);
      await Promise.resolve();
    });

    expect(iframeRef.setSrc).not.toHaveBeenCalled();
    expect(result.current.iframeLoading).toBe(false);
    expect(result.current.iframeError).toBe(true);
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(12_000);
      await Promise.resolve();
    });
    expect(fetchPreviewStatus).toHaveBeenCalledTimes(2);
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);
  });

  it("aborts a late lifecycle N recovery when lifecycle N+1 becomes active", async () => {
    let resolveLate: ((value: PreviewStatusApiJson) => void) | undefined;
    fetchPreviewStatus
      .mockReturnValueOnce(new Promise(() => {}))
      .mockReturnValueOnce(
        new Promise<PreviewStatusApiJson>((resolve) => {
          resolveLate = resolve;
        }),
      );
    const iframeRef = makeIframeRef();
    const firstParams = makeParams({ activePreviewLifecycleToken: "life_N", iframeRef });
    const { result, rerender } = renderHook((params) => usePreviewIframe(params), {
      initialProps: firstParams,
    });

    act(() => result.current.handleIframeLoad());
    act(() => vi.advanceTimersByTime(98_000));
    await act(async () => {
      vi.advanceTimersByTime(4_000);
      await Promise.resolve();
    });
    const lateSignal = fetchPreviewStatus.mock.calls[1]?.[0]?.signal as AbortSignal;

    rerender({ ...firstParams, activePreviewLifecycleToken: "life_N1" });
    expect(lateSignal.aborted).toBe(true);

    await act(async () => {
      resolveLate?.(status("running", "ps_1", "ver_1", TIER2_URL, "life_N"));
      await Promise.resolve();
    });

    expect(iframeRef.setSrc).not.toHaveBeenCalled();
    expect(result.current.iframeLoading).toBe(true);
  });

  it("makes the boot timeout inert when running arrives just before its deadline", async () => {
    let resolveStatus: ((value: PreviewStatusApiJson) => void) | undefined;
    fetchPreviewStatus.mockReturnValueOnce(
      new Promise<PreviewStatusApiJson>((resolve) => {
        resolveStatus = resolve;
      }),
    );
    const params = makeParams({ iframeRef: makeIframeRef() });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => result.current.handleIframeLoad());
    act(() => vi.advanceTimersByTime(97_999));

    await act(async () => {
      resolveStatus?.(status("running"));
      await Promise.resolve();
    });

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.iframeLoading).toBe(true);
    expect(result.current.iframeError).toBe(false);
    expect(params.onPreviewSessionSuspect).not.toHaveBeenCalled();

    act(() => result.current.handleIframeLoad());
    expect(result.current.iframeLoading).toBe(false);
    expect(params.onPreviewSessionSuspect).not.toHaveBeenCalled();
  });

  it("fails closed if the ready reload never emits onLoad", async () => {
    fetchPreviewStatus.mockResolvedValue(status("running"));
    const params = makeParams({ iframeRef: makeIframeRef() });
    const { result } = renderHook(() => usePreviewIframe(params));

    await act(async () => {
      result.current.handleIframeLoad();
      await Promise.resolve();
    });
    act(() => vi.advanceTimersByTime(15_000));

    expect(result.current.iframeLoading).toBe(false);
    expect(result.current.iframeError).toBe(true);
    expect(result.current.iframeDiagnosticCode).toBe("preview_ready_timeout");
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);
  });

  it("explicitly reloads the decorated controlled src and keeps the readiness gate closed", () => {
    const decoratedSrc = `${TIER2_URL}?__sm_viewer=viewer_1`;
    const iframeRef = makeIframeRef(decoratedSrc);
    const params = makeParams({ iframeRef });
    const { result } = renderHook(() => usePreviewIframe(params));

    act(() => {
      expect(result.current.reloadControlledPreview()).toBe(true);
    });

    expect(iframeRef.setSrc).toHaveBeenCalledWith(decoratedSrc);
    act(() => vi.advanceTimersByTime(97_999));
    expect(result.current.iframeLoading).toBe(true);
    expect(result.current.iframeError).toBe(false);
    expect(params.onPreviewSessionSuspect).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.iframeLoading).toBe(false);
    expect(result.current.iframeError).toBe(true);
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);
  });

  it("hands terminal status to recovery once without continuing the poll", async () => {
    fetchPreviewStatus.mockResolvedValue(status("build_error"));
    const params = makeParams({ iframeRef: makeIframeRef() });
    const { result } = renderHook(() => usePreviewIframe(params));

    await act(async () => {
      result.current.handleIframeLoad();
      await Promise.resolve();
    });

    expect(result.current.iframeLoading).toBe(true);
    expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(8_000));
    expect(fetchPreviewStatus).toHaveBeenCalledTimes(1);
  });

  it.each(["starting", "running"] as const)(
    "hands a mismatched %s receipt to recovery without waiting for timeout",
    async (state) => {
      fetchPreviewStatus.mockResolvedValue(status(state, "ps_stale", "ver_stale"));
      const params = makeParams({ iframeRef: makeIframeRef() });
      const { result } = renderHook(() => usePreviewIframe(params));

      await act(async () => {
        result.current.handleIframeLoad();
        await Promise.resolve();
      });

      expect(result.current.iframeLoading).toBe(true);
      expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);
      act(() => vi.advanceTimersByTime(8_000));
      expect(fetchPreviewStatus).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["starting", "running"] as const)(
    "hands a lifecycle-mismatched %s receipt to recovery without waiting for timeout",
    async (state) => {
      fetchPreviewStatus.mockResolvedValue(
        status(state, "ps_1", "ver_1", TIER2_URL, "life_stale"),
      );
      const params = makeParams({ iframeRef: makeIframeRef() });
      const { result } = renderHook(() => usePreviewIframe(params));

      await act(async () => {
        result.current.handleIframeLoad();
        await Promise.resolve();
      });

      expect(result.current.iframeLoading).toBe(true);
      expect(params.onPreviewSessionSuspect).toHaveBeenCalledTimes(1);
      act(() => vi.advanceTimersByTime(8_000));
      expect(fetchPreviewStatus).toHaveBeenCalledTimes(1);
    },
  );
});
